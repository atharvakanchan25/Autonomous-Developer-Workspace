from __future__ import annotations

import asyncio
import sys
from pathlib import Path

# Add backend to Python path
sys.path.append(str(Path(__file__).parent.parent.parent / "backend"))

from agents.agent_dispatcher import _get_task
from agents.langgraph_pipeline import run_langgraph_pipeline
from core.database import db
from core.logger import logger
from core.utils import now_iso
from realtime import emitter
from realtime.events import AgentLogPayload, TaskUpdatedPayload

MAX_AUTO_RETRIES = 2
RETRY_DELAY_SECONDS = 2
_active_projects: set[str] = set()


def _load_project_tasks(project_id: str) -> list[dict]:
    docs = db.collection("tasks").where(filter=("projectId", "==", project_id)).stream()
    tasks = [{"id": doc.id, **doc.to_dict()} for doc in docs]
    return sorted(tasks, key=lambda task: (task.get("order", 0), task.get("createdAt", "")))


def _dependency_ids(task: dict) -> list[str]:
    ids: list[str] = []
    for dep in task.get("dependsOn", []) or []:
        if isinstance(dep, dict) and dep.get("id"):
            ids.append(dep["id"])
        elif isinstance(dep, str):
            ids.append(dep)
    return ids


def _dependencies_completed(task: dict, tasks_by_id: dict[str, dict]) -> bool:
    return all(tasks_by_id.get(dep_id, {}).get("status") == "COMPLETED" for dep_id in _dependency_ids(task))


async def _emit_project_log(project_id: str, task_id: str, message: str, level: str = "info") -> None:
    await emitter.emit_agent_log(AgentLogPayload(
        taskId=task_id,
        projectId=project_id,
        agentRunId="",
        agentType="AUTO_ORCHESTRATOR",
        level=level,  # type: ignore[arg-type]
        message=message,
        timestamp=now_iso(),
    ))


async def _queue_retry(task: dict, project_id: str, attempt: int, max_retries: int) -> None:
    ts = now_iso()
    db.collection("tasks").document(task["id"]).update({
        "status": "PENDING",
        "retryCount": attempt,
        "updatedAt": ts,
    })
    await emitter.emit_task_updated(TaskUpdatedPayload(
        taskId=task["id"],
        projectId=project_id,
        status="PENDING",
        title=task.get("title", ""),
        updatedAt=ts,
    ))
    await _emit_project_log(
        project_id,
        task["id"],
        f'Automatic retry queued for "{task.get("title", "")}" ({attempt}/{max_retries})',
        level="warn",
    )


async def _run_task_with_retries(task: dict, project_id: str) -> bool:
    max_retries = int(task.get("maxRetries", MAX_AUTO_RETRIES))
    title = task.get("title", task["id"])

    for attempt in range(max_retries + 1):
        if attempt > 0:
            await asyncio.sleep(RETRY_DELAY_SECONDS * attempt)
            await _queue_retry(task, project_id, attempt, max_retries)

        await _emit_project_log(
            project_id,
            task["id"],
            f'Automatic pipeline run started for "{title}" (attempt {attempt + 1}/{max_retries + 1})',
        )

        await run_langgraph_pipeline(task["id"])
        latest = _get_task(task["id"])
        if latest.get("status") == "COMPLETED":
            return True

        logger.warning(f'Automatic run failed for task={task["id"]} attempt={attempt + 1}')

    await _emit_project_log(
        project_id,
        task["id"],
        f'Automatic retries exhausted for "{title}". Pipeline halted.',
        level="error",
    )
    return False


async def auto_run_project_pipeline(project_id: str) -> bool:
    if project_id in _active_projects:
        logger.info(f"Auto orchestrator already running for project={project_id}")
        return False

    _active_projects.add(project_id)
    try:
        tasks = _load_project_tasks(project_id)
        if not tasks:
            return False

        await _emit_project_log(
            project_id,
            tasks[0]["id"],
            f'Automatic project pipeline started with {len(tasks)} tasks',
        )

        while True:
            tasks = _load_project_tasks(project_id)
            tasks_by_id = {task["id"]: task for task in tasks}

            if tasks and all(task.get("status") == "COMPLETED" for task in tasks):
                await _emit_project_log(
                    project_id,
                    tasks[-1]["id"],
                    "Automatic project pipeline completed successfully",
                )
                return True

            runnable = [
                task for task in tasks
                if task.get("status") in {"PENDING", "FAILED"}
                and _dependencies_completed(task, tasks_by_id)
            ]

            if not runnable:
                failed = [task for task in tasks if task.get("status") == "FAILED"]
                if failed:
                    await _emit_project_log(
                        project_id,
                        failed[0]["id"],
                        "Automatic project pipeline stopped because a task failed after retries",
                        level="error",
                    )
                    return False
                await asyncio.sleep(1)
                continue

            next_task = runnable[0]
            succeeded = await _run_task_with_retries(next_task, project_id)
            if not succeeded:
                return False
    finally:
        _active_projects.discard(project_id)
