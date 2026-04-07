"""
Orchestrator Core — Microsoft-style central orchestrator.

Responsibilities:
  - Session lifecycle (PENDING → RUNNING → COMPLETED/FAILED)
  - Delegates task execution to the LangGraph pipeline
  - Retry + error recovery per task
  - Emits real-time events throughout

Session state is kept in-memory (fast) and mirrored to Firestore (durable).
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass, field, asdict
from typing import Optional
import sys
from pathlib import Path

_root = Path(__file__).resolve().parent.parent.parent
for _p in (_root, _root / "backend", _root / "ai-services"):
    _s = str(_p)
    if _s not in sys.path:
        sys.path.insert(0, _s)

from backend.core.database import db
from backend.core.logger import logger
from backend.core.utils import now_iso
from realtime import emitter
from realtime.events import AgentLogPayload, TaskUpdatedPayload

MAX_TASK_RETRIES = 2
RETRY_DELAY_BASE = 2  # seconds; multiplied by attempt number


# ── Session model ─────────────────────────────────────────────────────────────

@dataclass
class OrchestratorSession:
    project_id: str
    owner_id: str
    status: str = "PENDING"          # PENDING | RUNNING | COMPLETED | FAILED
    current_task_id: str = ""
    completed_tasks: list[str] = field(default_factory=list)
    failed_tasks: list[str] = field(default_factory=list)
    started_at: str = ""
    finished_at: str = ""
    error: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


# In-memory session store: project_id → session
_sessions: dict[str, OrchestratorSession] = {}


def get_session(project_id: str) -> Optional[OrchestratorSession]:
    return _sessions.get(project_id)


def _save_session(session: OrchestratorSession) -> None:
    _sessions[session.project_id] = session
    db.collection("orchestratorSessions").document(session.project_id).set(
        session.to_dict(), merge=True
    )


# ── Internal helpers ──────────────────────────────────────────────────────────

def _load_tasks(project_id: str) -> list[dict]:
    docs = db.collection("tasks").where(filter=("projectId", "==", project_id)).stream()
    tasks = [{"id": d.id, **d.to_dict()} for d in docs]
    return sorted(tasks, key=lambda t: (t.get("order", 0), t.get("createdAt", "")))


def _dep_ids(task: dict) -> list[str]:
    ids: list[str] = []
    for dep in task.get("dependsOn", []) or []:
        if isinstance(dep, dict):
            ids.append(dep["id"])
        elif isinstance(dep, str):
            ids.append(dep)
    return ids


def _deps_done(task: dict, by_id: dict[str, dict]) -> bool:
    return all(by_id.get(d, {}).get("status") == "COMPLETED" for d in _dep_ids(task))


async def _log(project_id: str, task_id: str, message: str, level: str = "info") -> None:
    await emitter.emit_agent_log(AgentLogPayload(
        taskId=task_id, projectId=project_id, agentRunId="",
        agentType="ORCHESTRATOR", level=level,  # type: ignore[arg-type]
        message=message, timestamp=now_iso(),
    ))


# ── Task execution with retries ───────────────────────────────────────────────

async def _run_task(task: dict, project_id: str) -> bool:
    """Run a single task through the LangGraph pipeline with retry logic."""
    from agents.langgraph_pipeline import run_langgraph_pipeline
    from agents.agent_dispatcher import _get_task

    task_id = task["id"]
    title = task.get("title", task_id)
    max_retries = int(task.get("maxRetries", MAX_TASK_RETRIES))

    for attempt in range(max_retries + 1):
        if attempt > 0:
            wait = RETRY_DELAY_BASE * attempt
            await asyncio.sleep(wait)
            db.collection("tasks").document(task_id).update({
                "status": "PENDING", "retryCount": attempt, "updatedAt": now_iso()
            })
            await emitter.emit_task_updated(TaskUpdatedPayload(
                taskId=task_id, projectId=project_id, status="PENDING",
                title=title, updatedAt=now_iso(),
            ))
            await _log(project_id, task_id,
                       f'Retry {attempt}/{max_retries} for "{title}"', level="warn")

        await _log(project_id, task_id,
                   f'Running "{title}" (attempt {attempt + 1}/{max_retries + 1})')
        await run_langgraph_pipeline(task_id)

        latest = _get_task(task_id)
        if latest.get("status") == "COMPLETED":
            return True

        logger.warning(f"Task failed: task={task_id} attempt={attempt + 1}")

    await _log(project_id, task_id,
               f'Retries exhausted for "{title}"', level="error")
    return False


# ── Main project runner ───────────────────────────────────────────────────────

async def run_project(project_id: str, owner_id: str = "") -> None:
    """
    Orchestrate all tasks in a project respecting dependency order.
    Runs tasks sequentially; parallel execution can be added by grouping
    tasks with no inter-dependencies into asyncio.gather() calls.
    """
    existing = get_session(project_id)
    if existing and existing.status == "RUNNING":
        logger.info(f"Orchestrator already running for project={project_id}")
        return

    session = OrchestratorSession(
        project_id=project_id,
        owner_id=owner_id,
        status="RUNNING",
        started_at=now_iso(),
    )
    _save_session(session)

    try:
        tasks = _load_tasks(project_id)
        if not tasks:
            session.status = "COMPLETED"
            session.finished_at = now_iso()
            _save_session(session)
            return

        await _log(project_id, tasks[0]["id"],
                   f"Orchestrator started — {len(tasks)} tasks queued")

        while True:
            tasks = _load_tasks(project_id)
            by_id = {t["id"]: t for t in tasks}

            if all(t.get("status") == "COMPLETED" for t in tasks):
                session.status = "COMPLETED"
                session.finished_at = now_iso()
                _save_session(session)
                await _log(project_id, tasks[-1]["id"],
                           "All tasks completed — orchestrator finished")
                return

            runnable = [
                t for t in tasks
                if t.get("status") in {"PENDING", "FAILED"}
                and _deps_done(t, by_id)
            ]

            if not runnable:
                failed = [t for t in tasks if t.get("status") == "FAILED"]
                if failed:
                    session.status = "FAILED"
                    session.failed_tasks = [t["id"] for t in failed]
                    session.finished_at = now_iso()
                    session.error = f"Task failed: {failed[0].get('title', '')}"
                    _save_session(session)
                    await _log(project_id, failed[0]["id"],
                               "Orchestrator halted — task failed after retries",
                               level="error")
                    return
                await asyncio.sleep(1)
                continue

            next_task = runnable[0]
            session.current_task_id = next_task["id"]
            _save_session(session)

            success = await _run_task(next_task, project_id)
            if success:
                session.completed_tasks.append(next_task["id"])
            else:
                session.status = "FAILED"
                session.failed_tasks.append(next_task["id"])
                session.finished_at = now_iso()
                _save_session(session)
                return

    except Exception as err:
        logger.error(f"Orchestrator error: project={project_id} err={err}", exc_info=True)
        session.status = "FAILED"
        session.error = str(err)
        session.finished_at = now_iso()
        _save_session(session)
