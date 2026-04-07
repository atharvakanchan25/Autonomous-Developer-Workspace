"""
Planner Agent v2 — Microsoft-style goal decomposition.

Takes a user goal string and produces a structured ExecutionPlan with
per-task metadata (agent assignment, language, priority, complexity,
dependencies). Uses a LangGraph pipeline internally for context loading
→ LLM planning → Firestore persistence.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Optional
import sys
from pathlib import Path

_root = Path(__file__).resolve().parent.parent.parent
for _p in (_root, _root / "backend", _root / "ai-services"):
    _s = str(_p)
    if _s not in sys.path:
        sys.path.insert(0, _s)

from langgraph.graph import StateGraph, END
from typing import TypedDict

from agents.agent_llm import LlmMessage, call_llm
from backend.core.database import db
from backend.core.logger import logger
from backend.core.utils import now_iso
from backend.lib.mcp_server import build_project_context_text, get_project_snapshot

VALID_AGENTS = {
    "code_generator", "test_generator", "code_reviewer",
    "scaffold", "frontend_generator",
}

SYSTEM_PROMPT = """\
You are a senior software architect decomposing a user goal into an ordered task plan.

Return JSON with key "tasks" — an array of 3–8 objects, each with:
  title        (string)  — short imperative action
  description  (string)  — one sentence of detail
  agent        (string)  — one of: code_generator, test_generator, code_reviewer, scaffold, frontend_generator
  language     (string)  — primary language (python, typescript, html, etc.)
  priority     (string)  — high | medium | low
  complexity   (string)  — simple | moderate | complex
  depends_on   (array)   — list of titles this task depends on (empty for first task)
  tags         (array)   — relevant tags (e.g. ["auth", "api", "database"])

Rules:
- Tasks must be in logical execution order
- scaffold always comes first if needed
- code_generator before test_generator before code_reviewer
- No circular dependencies
- Return only valid JSON, no markdown fences
"""


# ── Data models ───────────────────────────────────────────────────────────────

@dataclass
class PlannedTask:
    title: str
    description: str
    agent_id: str
    language: str
    priority: str
    complexity: str
    depends_on_titles: list[str]
    tags: list[str]


@dataclass
class ExecutionPlan:
    project_id: str
    goal: str
    planner_version: str
    tokens_used: int
    tasks: list[PlannedTask] = field(default_factory=list)


# ── LangGraph state ───────────────────────────────────────────────────────────

class PlannerState(TypedDict):
    project_id: str
    goal: str
    language: str
    user_id: str
    user_email: str
    snapshot: dict[str, Any]
    raw_tasks: list[dict[str, Any]]
    tokens_used: int
    status: str


# ── Graph nodes ───────────────────────────────────────────────────────────────

async def _load_context(state: PlannerState) -> PlannerState:
    snapshot = get_project_snapshot(state["project_id"], include_contents=True)
    return {**state, "snapshot": snapshot}


async def _llm_plan(state: PlannerState) -> PlannerState:
    context = build_project_context_text(state["snapshot"])
    try:
        result = await call_llm(
            [
                LlmMessage(role="system", content=SYSTEM_PROMPT),
                LlmMessage(
                    role="user",
                    content=(
                        f"Goal: {state['goal']}\n"
                        f"Primary language: {state['language']}\n\n"
                        f"Workspace context:\n{context}"
                    ),
                ),
            ],
            max_tokens=1500,
            json_mode=True,
        )
        parsed = json.loads(result.content)
        raw_tasks = parsed.get("tasks", [])
        if not raw_tasks:
            raise ValueError("LLM returned empty task list")
        return {**state, "raw_tasks": raw_tasks, "tokens_used": result.tokensUsed, "status": "COMPLETED"}
    except Exception as err:
        logger.warning(f"Planner LLM failed, using fallback: {err}")
        return {**state, "raw_tasks": _fallback_tasks(state["language"]), "tokens_used": 0, "status": "FALLBACK"}


async def _persist(state: PlannerState) -> PlannerState:
    ts = now_iso()
    title_to_id: dict[str, str] = {}
    ordered_tasks: list[dict[str, Any]] = []

    for idx, raw in enumerate(state["raw_tasks"], start=1):
        title = str(raw.get("title", f"Task {idx}")).strip()
        agent = str(raw.get("agent", "code_generator")).lower()
        if agent not in VALID_AGENTS:
            agent = "code_generator"

        dep_titles: list[str] = raw.get("depends_on", []) or []
        depends_on = [
            {"id": title_to_id[t], "title": t}
            for t in dep_titles
            if t in title_to_id
        ]

        task_data = {
            "projectId": state["project_id"],
            "title": title,
            "description": raw.get("description", state["goal"]),
            "type": "feature",
            "status": "PENDING",
            "priority": raw.get("priority", "medium"),
            "complexity": raw.get("complexity", "moderate"),
            "order": idx,
            "dependsOn": depends_on,
            "language": raw.get("language", state["language"]),
            "agent": agent,
            "tags": raw.get("tags", []),
            "autoRun": True,
            "retryCount": 0,
            "maxRetries": 2,
            "ownerId": state["user_id"],
            "ownerEmail": state["user_email"],
            "createdAt": ts,
            "updatedAt": ts,
        }
        _, ref = db.collection("tasks").add(task_data)
        title_to_id[title] = ref.id
        ordered_tasks.append({"id": ref.id, **task_data})

    db.collection("aiPlanRuns").add({
        "projectId": state["project_id"],
        "uid": state["user_id"],
        "email": state["user_email"],
        "goal": state["goal"],
        "tokensUsed": state.get("tokens_used", 0),
        "status": state.get("status", "COMPLETED"),
        "plannerVersion": "v2",
        "taskCount": len(ordered_tasks),
        "createdAt": ts,
    })

    return {**state, "raw_tasks": ordered_tasks}


# ── Fallback plan ─────────────────────────────────────────────────────────────

def _fallback_tasks(language: str) -> list[dict[str, Any]]:
    return [
        {"title": "Generate project scaffold", "description": "Create project structure and config files",
         "agent": "scaffold", "language": language, "priority": "high", "complexity": "simple",
         "depends_on": [], "tags": ["scaffold"]},
        {"title": "Generate core implementation", "description": "Implement the main feature logic",
         "agent": "code_generator", "language": language, "priority": "high", "complexity": "moderate",
         "depends_on": ["Generate project scaffold"], "tags": ["core"]},
        {"title": "Generate unit tests", "description": "Write tests for the implementation",
         "agent": "test_generator", "language": language, "priority": "medium", "complexity": "simple",
         "depends_on": ["Generate core implementation"], "tags": ["testing"]},
        {"title": "Review code quality", "description": "Review and suggest improvements",
         "agent": "code_reviewer", "language": language, "priority": "low", "complexity": "simple",
         "depends_on": ["Generate unit tests"], "tags": ["review"]},
    ]


# ── Graph assembly ────────────────────────────────────────────────────────────

def _build_planner_graph():
    g = StateGraph(PlannerState)
    g.add_node("load_context", _load_context)
    g.add_node("llm_plan", _llm_plan)
    g.add_node("persist", _persist)
    g.set_entry_point("load_context")
    g.add_edge("load_context", "llm_plan")
    g.add_edge("llm_plan", "persist")
    g.add_edge("persist", END)
    return g.compile()


_planner_graph = _build_planner_graph()


# ── Public API ────────────────────────────────────────────────────────────────

async def generate_plan(
    *,
    project_id: str,
    goal: str,
    user_id: str,
    user_email: str,
    language: str = "python",
) -> ExecutionPlan:
    final = await _planner_graph.ainvoke({
        "project_id": project_id,
        "goal": goal,
        "language": language,
        "user_id": user_id,
        "user_email": user_email,
        "snapshot": {},
        "raw_tasks": [],
        "tokens_used": 0,
        "status": "PENDING",
    })

    tasks = [
        PlannedTask(
            title=t.get("title", ""),
            description=t.get("description", ""),
            agent_id=t.get("agent", "code_generator"),
            language=t.get("language", language),
            priority=t.get("priority", "medium"),
            complexity=t.get("complexity", "moderate"),
            depends_on_titles=[d.get("title", "") for d in t.get("dependsOn", [])],
            tags=t.get("tags", []),
        )
        for t in final["raw_tasks"]
    ]

    return ExecutionPlan(
        project_id=project_id,
        goal=goal,
        planner_version="v2",
        tokens_used=final["tokens_used"],
        tasks=tasks,
    )
