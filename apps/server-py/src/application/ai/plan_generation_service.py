import json
import re

from fastapi import HTTPException

from src.agents.agent_llm import LlmMessage, call_llm
from src.auth.auth import AuthUser
from src.core.errors import bad_request, not_found
from src.core.logger import logger
from src.core.utils import now_iso
from src.infrastructure.database import db
from src.queue.queue import JobData, task_queue

_SYSTEM_PROMPT = """You are a senior software architect. Your job is to break down a software project description into a structured execution plan AND choose the single best technology stack for it.

You MUST respond with ONLY a valid JSON object — no markdown, no explanation, no code fences.

The JSON must conform exactly to this structure:
{
  "language": "string (the BEST programming language for this specific project)",
  "framework": "string (the most appropriate framework, empty string if none needed)",
  "tasks": [
    {
      "key": "string (short unique snake_case identifier)",
      "title": "string (concise task title, max 80 chars)",
      "description": "string (1-2 sentence explanation)",
      "order": number,
      "dependsOn": ["key1", "key2"]
    }
  ]
}

Language selection rules:
- Simple CRUD app / task manager → python (FastAPI) or javascript (React)
- Web app with UI → javascript or typescript with React
- REST API / backend service → python (FastAPI) or javascript (Express) or go (Gin)
- CLI tool / script → python
- Real-time app / chat → javascript/typescript with Node.js
- Data science / ML → python
- System programming / performance critical → go or rust
- Mobile app → swift (iOS) or kotlin (Android)
- NEVER default to python for frontend or UI projects

Task rules:
- Generate between 4 and 10 tasks.
- Every key must be unique, lowercase, snake_case, max 40 chars.
- dependsOn must only reference keys defined in the same tasks array.
- The dependency graph must be a valid DAG — no cycles.
- Order tasks so dependencies always have a lower order number than their dependents."""

_FEW_SHOT_EXAMPLE = {
    "role": "user",
    "content": (
        "Project description: Build a simple to-do list web app\n\n"
        + json.dumps({"language": "javascript", "framework": "React", "tasks": [
            {"key": "setup", "title": "Initialise React project",
             "description": "Create React app with Vite, configure ESLint and folder structure.",
             "order": 1, "dependsOn": []},
            {"key": "task_model", "title": "Define task data model and state",
             "description": "Define the Task shape and set up useState/useReducer for the task list.",
             "order": 2, "dependsOn": ["setup"]},
            {"key": "task_list", "title": "Build TaskList and TaskItem components",
             "description": "Render the list of tasks with completed/pending styling.",
             "order": 3, "dependsOn": ["task_model"]},
            {"key": "add_task", "title": "Implement add task form",
             "description": "Input field and button to add new tasks to the list.",
             "order": 4, "dependsOn": ["task_model"]},
            {"key": "actions", "title": "Implement delete and complete toggle",
             "description": "Add handlers to mark tasks complete and delete them.",
             "order": 5, "dependsOn": ["task_list", "add_task"]},
            {"key": "persist", "title": "Persist tasks to localStorage",
             "description": "Save and load tasks from localStorage so they survive page refresh.",
             "order": 6, "dependsOn": ["actions"]},
        ]})
    ),
}


async def _call_planner_llm(description: str) -> tuple[str, int]:
    result = await call_llm(
        messages=[
            LlmMessage(role="system", content=_SYSTEM_PROMPT),
            LlmMessage(role="user", content=_FEW_SHOT_EXAMPLE["content"]),
            LlmMessage(role="user", content=f"Project description: {description.strip()}"),
        ],
        max_tokens=2048,
        json_mode=True,
    )
    if not result.content:
        raise bad_request("LLM returned an empty response")
    return result.content, result.tokensUsed


def _parse_response(raw: str) -> dict:
    cleaned = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise bad_request("LLM response was not valid JSON") from exc


async def generate_project_plan(project_id: str, description: str, user: AuthUser) -> dict:
    project_doc = db.collection("projects").document(project_id).get()
    if not project_doc.exists:
        raise not_found("Project")

    project_data = project_doc.to_dict()
    if not user.can_access_resource(project_data.get("ownerId")):
        raise HTTPException(status_code=403, detail="Access denied")

    project = {"id": project_doc.id, **project_data}

    raw, tokens_used = await _call_planner_llm(description)
    data = _parse_response(raw)
    language = data.get("language", "python")
    framework = data.get("framework", "")
    tasks: list[dict] = data.get("tasks", [])

    now = now_iso()
    batch = db.batch()
    task_refs = [db.collection("tasks").document() for _ in tasks]
    key_to_id = {task["key"]: task_refs[i].id for i, task in enumerate(tasks)}

    for i, task in enumerate(tasks):
        batch.set(task_refs[i], {
            "title": task["title"],
            "description": task["description"],
            "order": task["order"],
            "status": "PENDING",
            "projectId": project_id,
            "ownerId": user.uid,
            "assignedTo": user.uid,
            "dependsOn": [key_to_id[dep] for dep in task.get("dependsOn", [])],
            "createdAt": now,
            "updatedAt": now,
        })

    batch.set(db.collection("aiPlanLogs").document(), {
        "projectId": project_id,
        "prompt": description,
        "rawResponse": raw,
        "taskCount": len(tasks),
        "language": language,
        "framework": framework,
        "userId": user.uid,
        "userRole": user.role,
        "tokensUsed": tokens_used,
        "createdAt": now,
    })

    db.collection("projects").document(project_id).update({
        "language": language,
        "framework": framework,
        "updatedAt": now,
    })

    batch.commit()

    saved_tasks = [
        {
            "id": task_refs[i].id,
            "title": task["title"],
            "description": task["description"],
            "order": task["order"],
            "status": "PENDING",
            "projectId": project_id,
            "ownerId": user.uid,
            "assignedTo": user.uid,
            "dependsOn": [
                {"id": key_to_id[dep], "title": next(item["title"] for item in tasks if item["key"] == dep)}
                for dep in task.get("dependsOn", [])
            ],
            "createdAt": now,
            "updatedAt": now,
        }
        for i, task in enumerate(tasks)
    ]

    for i, task in enumerate(tasks):
        if task.get("dependsOn", []):
            continue
        await task_queue.add(
            task_refs[i].id,
            JobData(taskId=task_refs[i].id, projectId=project_id, title=task["title"]),
        )
        logger.info(f"Queued task for execution: {task_refs[i].id}")

    logger.info(f"Plan generated: project={project_id} tasks={len(tasks)}")

    return {
        "project": {**project, "language": language, "framework": framework},
        "tasks": saved_tasks,
        "dag": {
            "nodes": [{"key": task["key"], "title": task["title"], "order": task["order"]} for task in tasks],
            "edges": [{"from": dep, "to": task["key"]} for task in tasks for dep in task.get("dependsOn", [])],
        },
        "meta": {"taskCount": len(saved_tasks), "language": language, "framework": framework},
    }
