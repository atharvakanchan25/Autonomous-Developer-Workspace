from __future__ import annotations

import json
from typing import Any, TypedDict

from langgraph.graph import END, StateGraph

from agents.agent_llm import LlmMessage, call_llm
from backend.core.database import db
from backend.core.logger import logger
from backend.core.utils import now_iso
from backend.lib.mcp_server import build_project_context_text, get_project_snapshot


VALID_AGENTS = {"scaffold", "code_generator", "test_generator", "code_reviewer"}
DEFAULT_STEPS = [
    {"agent": "scaffold", "title": "Generate project structure"},
    {"agent": "code_generator", "title": "Generate code implementation"},
    {"agent": "test_generator", "title": "Generate unit tests"},
    {"agent": "code_reviewer", "title": "Review code quality"},
]


class PlannerState(TypedDict):
    project_id: str
    user_id: str
    user_email: str
    prompt: str
    snapshot: dict[str, Any]
    steps: list[dict[str, str]]
    tasks: list[dict[str, Any]]
    plan_tokens: int
    plan_status: str


def _fallback_steps() -> list[dict[str, str]]:
    return [dict(step) for step in DEFAULT_STEPS]


def _normalize_steps(raw_steps: list[dict[str, Any]]) -> list[dict[str, str]]:
    steps: list[dict[str, str]] = []
    for item in raw_steps:
        agent = str(item.get("agent", "")).strip().lower()
        title = str(item.get("title", "")).strip()
        if agent not in VALID_AGENTS or not title:
            continue
        steps.append({"agent": agent, "title": title})
    return steps or _fallback_steps()


async def _load_context(state: PlannerState) -> PlannerState:
    snapshot = get_project_snapshot(state["project_id"], include_contents=True)
    return {**state, "snapshot": snapshot}


async def _plan_steps(state: PlannerState) -> PlannerState:
    context_text = build_project_context_text(state["snapshot"])

    try:
        result = await call_llm(
            [
                LlmMessage(
                    role="system",
                    content=(
                        "You are planning an AI software delivery workflow.\n"
                        "Return JSON with a single key named `steps`.\n"
                        "`steps` must be an array of 3 to 6 objects.\n"
                        "Each object must have:\n"
                        '- `agent`: one of "scaffold", "code_generator", "test_generator", "code_reviewer"\n'
                        '- `title`: a short action title\n'
                        "The steps must be in execution order and form a realistic build pipeline.\n"
                        "Do not include explanations."
                    ),
                ),
                LlmMessage(
                    role="user",
                    content=(
                        f"User request:\n{state['prompt']}\n\n"
                        f"Workspace context:\n{context_text}"
                    ),
                ),
            ],
            max_tokens=768,
            json_mode=True,
        )
        parsed = json.loads(result.content)
        steps = _normalize_steps(parsed.get("steps", []))
        plan_tokens = result.tokensUsed
        plan_status = "COMPLETED"
    except Exception as err:
        logger.warning(f"Falling back to default AI plan steps: {err}")
        steps = _fallback_steps()
        plan_tokens = 0
        plan_status = "FALLBACK"

    return {**state, "steps": steps, "plan_tokens": plan_tokens, "plan_status": plan_status}


async def _persist_tasks(state: PlannerState) -> PlannerState:
    created_tasks: list[dict[str, Any]] = []
    previous_task: dict[str, str] | None = None
    timestamp = now_iso()

    for index, step in enumerate(state["steps"], start=1):
        depends_on = []
        if previous_task is not None:
            depends_on.append(previous_task)

        task_data = {
            "projectId": state["project_id"],
            "title": step["title"],
            "description": state["prompt"],
            "type": "feature",
            "status": "PENDING",
            "priority": "medium",
            "order": index,
            "dependsOn": depends_on,
            "agent": step["agent"],
            "autoRun": True,
            "retryCount": 0,
            "maxRetries": 2,
            "ownerId": state["user_id"],
            "ownerEmail": state["user_email"],
            "createdAt": timestamp,
            "updatedAt": timestamp,
        }
        _, ref = db.collection("tasks").add(task_data)
        previous_task = {"id": ref.id, "title": step["title"]}
        created_tasks.append({"id": ref.id, **task_data})

    db.collection("aiPlanRuns").add({
        "projectId": state["project_id"],
        "uid": state["user_id"],
        "email": state["user_email"],
        "prompt": state["prompt"],
        "tokensUsed": state.get("plan_tokens", 0),
        "status": state.get("plan_status", "COMPLETED"),
        "stepCount": len(state["steps"]),
        "createdAt": timestamp,
        "updatedAt": timestamp,
    })

    return {**state, "tasks": created_tasks}


def _build_planner():
    graph = StateGraph(PlannerState)
    graph.add_node("load_context", _load_context)
    graph.add_node("plan_steps", _plan_steps)
    graph.add_node("persist_tasks", _persist_tasks)
    graph.set_entry_point("load_context")
    graph.add_edge("load_context", "plan_steps")
    graph.add_edge("plan_steps", "persist_tasks")
    graph.add_edge("persist_tasks", END)
    return graph.compile()


_planner = _build_planner()


async def generate_plan_with_langgraph(
    *,
    project_id: str,
    prompt: str,
    user_id: str,
    user_email: str,
) -> dict[str, Any]:
    final_state = await _planner.ainvoke(
        {
            "project_id": project_id,
            "user_id": user_id,
            "user_email": user_email,
            "prompt": prompt,
            "snapshot": {},
            "steps": [],
            "tasks": [],
            "plan_tokens": 0,
            "plan_status": "PENDING",
        }
    )

    project = final_state["snapshot"]["project"]
    tasks = final_state["tasks"]
    dag_nodes = [
        {"key": task["id"], "title": task["title"], "order": task["order"]}
        for task in tasks
    ]
    dag_edges = [
        {"from": dep["id"], "to": task["id"]}
        for task in tasks
        for dep in task.get("dependsOn", [])
    ]

    return {
        "project": {"id": project_id, "name": project.get("name", "")},
        "tasks": tasks,
        "dag": {"nodes": dag_nodes, "edges": dag_edges},
        "meta": {
            "taskCount": len(tasks),
            "planner": "langgraph",
            "contextSource": "mcp",
            "autoRun": True,
        },
    }
