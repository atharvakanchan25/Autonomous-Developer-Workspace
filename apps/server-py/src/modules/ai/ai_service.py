import json
import re

from fastapi import APIRouter
from pydantic import BaseModel

from src.lib.groq import groq_client
from src.lib.firestore import db
from src.lib.errors import not_found, bad_request
from src.lib.logger import logger
from src.lib.utils import now_iso

router = APIRouter()

_SYSTEM_PROMPT = """You are a senior software architect. Your job is to break down a software project description into a structured execution plan.

You MUST respond with ONLY a valid JSON object — no markdown, no explanation, no code fences.

The JSON must conform exactly to this structure:
{
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

Rules:
- Generate between 4 and 12 tasks.
- Every key must be unique, lowercase, snake_case, max 40 chars.
- dependsOn must only reference keys defined in the same tasks array.
- The dependency graph must be a valid DAG — no cycles.
- Order tasks so dependencies always have a lower order number than their dependents."""

_FEW_SHOT_EXAMPLE = {
    "role": "user",
    "content": (
        "Project description: Build a simple REST API for a blog with posts and comments\n\n"
        + json.dumps({"tasks": [
            {"key": "setup_project", "title": "Initialise project and install dependencies",
             "description": "Create the Python project, configure virtual environment, and install FastAPI and other core dependencies.",
             "order": 1, "dependsOn": []},
            {"key": "design_schema", "title": "Design data models",
             "description": "Define Pydantic models for Post and Comment with appropriate fields.",
             "order": 2, "dependsOn": ["setup_project"]},
            {"key": "posts_api", "title": "Implement Posts CRUD endpoints",
             "description": "Build GET /posts, POST /posts, GET /posts/{id}, PUT /posts/{id}, DELETE /posts/{id}.",
             "order": 3, "dependsOn": ["design_schema"]},
            {"key": "comments_api", "title": "Implement Comments CRUD endpoints",
             "description": "Build GET /posts/{id}/comments and POST /posts/{id}/comments endpoints.",
             "order": 4, "dependsOn": ["design_schema"]},
            {"key": "error_handling", "title": "Add global error handling and input validation",
             "description": "Implement Pydantic validation schemas and a centralised FastAPI exception handler.",
             "order": 5, "dependsOn": ["posts_api", "comments_api"]},
            {"key": "write_tests", "title": "Write integration tests",
             "description": "Cover all endpoints with integration tests using pytest and httpx.",
             "order": 6, "dependsOn": ["error_handling"]},
        ]})
    ),
}


async def _call_llm(description: str) -> str:
    response = await groq_client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            _FEW_SHOT_EXAMPLE,
            {"role": "user", "content": f"Project description: {description.strip()}"},
        ],
        max_tokens=2048,
        temperature=0,
        response_format={"type": "json_object"},
    )
    content = response.choices[0].message.content or ""
    if not content:
        raise bad_request("LLM returned an empty response")
    return content


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
async def generate_plan(body: GeneratePlanRequest):
    project_doc = db.collection("projects").document(body.projectId).get()
    if not project_doc.exists:
        raise not_found("Project")
    project = {"id": project_doc.id, **project_doc.to_dict()}

    raw = await _call_llm(body.description)
    data = _parse_response(raw)
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
            "dependsOn": [key_to_id[dep] for dep in t.get("dependsOn", [])],
            "createdAt": now,
            "updatedAt": now,
        })

    log_ref = db.collection("aiPlanLogs").document()
    batch.set(log_ref, {
        "projectId": body.projectId, "prompt": body.description,
        "rawResponse": raw, "taskCount": len(tasks), "createdAt": now,
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
    return {
        "project": project,
        "tasks": saved_tasks,
        "dag": {
            "nodes": [{"key": t["key"], "title": t["title"], "order": t["order"]} for t in tasks],
            "edges": edges,
        },
        "meta": {"taskCount": len(saved_tasks)},
    }
