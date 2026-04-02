from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from src.core.database import db
from src.core.errors import not_found, bad_request
from src.core.logger import logger
from src.core.utils import now_iso
from src.auth.auth import AuthUser, get_current_user
from src.queue.queue import task_queue, JobData
from src.agents.agent_llm import call_llm, LlmMessage

import json
import re

router = APIRouter()

_WEB_KEYWORDS = {
    "todo", "calculator", "landing page", "portfolio", "quiz", "game",
    "weather", "clock", "timer", "stopwatch", "form", "survey", "dashboard",
    "ui", "frontend", "webpage", "website", "html", "css", "browser",
    "interactive", "animation", "gallery", "slider", "modal", "navbar",
}


def _is_web_project(description: str) -> bool:
    desc_lower = description.lower()
    return any(kw in desc_lower for kw in _WEB_KEYWORDS)


_SYSTEM_PROMPT_WEB = """You are a senior software architect. Your job is to break down a frontend web project into a structured execution plan.

This is a FRONTEND/WEB project. The output MUST be a single self-contained index.html file.

You MUST respond with ONLY a valid JSON object — no markdown, no explanation, no code fences.

The JSON must conform exactly to this structure:
{
  "language": "html",
  "framework": "",
  "tasks": [
    {
      "key": "string (short unique snake_case identifier)",
      "title": "string (concise task title, max 80 chars)",
      "description": "string — MUST end with: Output: a single self-contained index.html file with all CSS in <style> and all JS in <script> tags. No imports, no npm, no build tools.",
      "order": number,
      "dependsOn": ["key1", "key2"]
    }
  ]
}

CRITICAL rules for web projects:
- language MUST be "html", framework MUST be empty string.
- Every task description MUST specify output is a single index.html.
- Generate 3 to 6 tasks max — each task builds on the previous index.html.
- The FINAL task must produce the complete, polished index.html.
- NO React, NO Vue, NO Vite, NO npm, NO Node.js, NO imports.
- Task rules: unique snake_case keys, valid DAG, no cycles."""


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
- REST API / backend service → python (FastAPI) or go (Gin)
- CLI tool / script → python
- Data science / ML → python
- System programming / performance critical → go or rust
- Mobile app → swift (iOS) or kotlin (Android)
- NEVER use React, Vite, or Node.js — if a project needs a UI, use python (FastAPI with Jinja2).

Task rules:
- Generate between 4 and 10 tasks.
- Every key must be unique, lowercase, snake_case, max 40 chars.
- dependsOn must only reference keys defined in the same tasks array.
- The dependency graph must be a valid DAG — no cycles.
- Order tasks so dependencies always have a lower order number than their dependents."""

_FEW_SHOT_EXAMPLE_WEB = {
    "role": "user",
    "content": (
        "Project description: Build a simple to-do list web app\n\n"
        + json.dumps({"language": "html", "framework": "", "tasks": [
            {"key": "structure", "title": "HTML structure and base styles",
             "description": "Create the base HTML skeleton with input field, add button, and task list container. Output: a single self-contained index.html file with all CSS in <style> and all JS in <script> tags. No imports, no npm, no build tools.",
             "order": 1, "dependsOn": []},
            {"key": "add_delete", "title": "Add and delete task functionality",
             "description": "Implement JS to add new tasks to the list and delete them with a button. Output: a single self-contained index.html file with all CSS in <style> and all JS in <script> tags. No imports, no npm, no build tools.",
             "order": 2, "dependsOn": ["structure"]},
            {"key": "complete_persist", "title": "Complete toggle and localStorage persistence",
             "description": "Add strike-through toggle for completed tasks and persist the list to localStorage. Output: a single self-contained index.html file with all CSS in <style> and all JS in <script> tags. No imports, no npm, no build tools.",
             "order": 3, "dependsOn": ["add_delete"]},
        ]})
    ),
}

_FEW_SHOT_EXAMPLE = {
    "role": "user",
    "content": (
        "Project description: Build a REST API for a blog with posts and comments\n\n"
        + json.dumps({"language": "python", "framework": "FastAPI", "tasks": [
            {"key": "setup", "title": "Initialise project and install dependencies",
             "description": "Create the Python project, configure virtual environment, and install FastAPI and core dependencies.",
             "order": 1, "dependsOn": []},
            {"key": "models", "title": "Define Pydantic data models",
             "description": "Define Pydantic models for Post and Comment with appropriate fields.",
             "order": 2, "dependsOn": ["setup"]},
            {"key": "posts_api", "title": "Implement Posts CRUD endpoints",
             "description": "Build GET /posts, POST /posts, GET /posts/{id}, PUT /posts/{id}, DELETE /posts/{id}.",
             "order": 3, "dependsOn": ["models"]},
            {"key": "comments_api", "title": "Implement Comments endpoints",
             "description": "Build GET /posts/{id}/comments and POST /posts/{id}/comments.",
             "order": 4, "dependsOn": ["models"]},
            {"key": "error_handling", "title": "Add global error handling",
             "description": "Implement centralised FastAPI exception handler and input validation.",
             "order": 5, "dependsOn": ["posts_api", "comments_api"]},
        ]})
    ),
}


async def _call_llm(description: str) -> tuple[str, int]:
    web = _is_web_project(description)
    system_prompt = _SYSTEM_PROMPT_WEB if web else _SYSTEM_PROMPT
    few_shot = _FEW_SHOT_EXAMPLE_WEB if web else _FEW_SHOT_EXAMPLE
    result = await call_llm(
        messages=[
            LlmMessage(role="system", content=system_prompt),
            LlmMessage(role="user", content=few_shot["content"]),
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
    except json.JSONDecodeError:
        raise bad_request("LLM response was not valid JSON")


class GeneratePlanRequest(BaseModel):
    projectId: str
    description: str


@router.post("/generate-plan", status_code=201)
async def generate_plan(body: GeneratePlanRequest, user: AuthUser = Depends(get_current_user)):
    """Generate AI task plan for a project."""
    project_doc = db.collection("projects").document(body.projectId).get()
    if not project_doc.exists:
        raise not_found("Project")

    project_data = project_doc.to_dict()
    if not user.can_access_resource(project_data.get("ownerId")):
        raise HTTPException(status_code=403, detail="Access denied")

    project = {"id": project_doc.id, **project_data}

    raw, tokens_used = await _call_llm(body.description)
    data = _parse_response(raw)
    language = data.get("language", "python")
    framework = data.get("framework", "")
    tasks: list[dict] = data.get("tasks", [])

    now = now_iso()
    batch = db.batch()
    task_refs = [db.collection("tasks").document() for _ in tasks]
    key_to_id = {t["key"]: task_refs[i].id for i, t in enumerate(tasks)}

    for i, t in enumerate(tasks):
        batch.set(task_refs[i], {
            "title": t["title"],
            "description": t["description"],
            "order": t["order"],
            "status": "PENDING",
            "projectId": body.projectId,
            "ownerId": user.uid,
            "assignedTo": user.uid,
            "dependsOn": [key_to_id[dep] for dep in t.get("dependsOn", [])],
            "createdAt": now,
            "updatedAt": now,
        })

    log_ref = db.collection("aiPlanLogs").document()
    batch.set(log_ref, {
        "projectId": body.projectId, "prompt": body.description,
        "rawResponse": raw, "taskCount": len(tasks), "language": language,
        "framework": framework, "userId": user.uid, "userRole": user.role,
        "tokensUsed": tokens_used, "createdAt": now,
    })

    db.collection("projects").document(body.projectId).update({
        "language": language, "framework": framework, "updatedAt": now,
    })

    batch.commit()

    saved_tasks = [
        {
            "id": task_refs[i].id,
            "title": t["title"],
            "description": t["description"],
            "order": t["order"],
            "status": "PENDING",
            "projectId": body.projectId,
            "ownerId": user.uid,
            "assignedTo": user.uid,
            "dependsOn": [
                {"id": key_to_id[dep], "title": next(x["title"] for x in tasks if x["key"] == dep)}
                for dep in t.get("dependsOn", [])
            ],
            "createdAt": now,
            "updatedAt": now,
        }
        for i, t in enumerate(tasks)
    ]

    edges = [{"from": dep, "to": t["key"]} for t in tasks for dep in t.get("dependsOn", [])]

    logger.info(f"Plan generated: project={body.projectId} tasks={len(tasks)}")

    for i, t in enumerate(tasks):
        if not t.get("dependsOn", []):
            await task_queue.add(
                task_refs[i].id,
                JobData(taskId=task_refs[i].id, projectId=body.projectId, title=t["title"])
            )
            logger.info(f"Queued task for execution: {task_refs[i].id}")

    return {
        "project": {**project, "language": language, "framework": framework},
        "tasks": saved_tasks,
        "dag": {
            "nodes": [{"key": t["key"], "title": t["title"], "order": t["order"]} for t in tasks],
            "edges": edges,
        },
        "meta": {"taskCount": len(saved_tasks), "language": language, "framework": framework},
    }
