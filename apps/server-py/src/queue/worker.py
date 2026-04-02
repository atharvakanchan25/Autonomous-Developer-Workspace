import asyncio
import time

from src.queue.queue import task_queue, Job, JobData
from src.core.database import db
from src.core.logger import logger
from src.core.utils import now_iso
from src.agents.langgraph_pipeline import run_langgraph_pipeline


async def _queue_dependent_tasks(completed_task_id: str, project_id: str) -> None:
    """Queue tasks that depend on the completed task."""
    all_tasks = db.collection("tasks").where("projectId", "==", project_id).stream()
    
    for task_doc in all_tasks:
        task_data = task_doc.to_dict()
        depends_on = task_data.get("dependsOn", [])
        
        # Check if this task depends on the completed task
        if completed_task_id in depends_on:
            # Check if all dependencies are completed
            all_deps_completed = True
            for dep_id in depends_on:
                dep_doc = db.collection("tasks").document(dep_id).get()
                if not dep_doc.exists or dep_doc.to_dict().get("status") != "COMPLETED":
                    all_deps_completed = False
                    break
            
            # Queue if all dependencies are met and task is still pending
            if all_deps_completed and task_data.get("status") == "PENDING":
                await task_queue.add(
                    task_doc.id,
                    JobData(
                        taskId=task_doc.id,
                        projectId=project_id,
                        title=task_data.get("title", "")
                    )
                )
                logger.info(f"Queued dependent task: {task_doc.id}")


async def _process_job(job: Job) -> None:
    task_id = job.data.taskId
    project_id = job.data.projectId
    started_at = time.monotonic()

    logger.info(f"Task job started: task={task_id}")

    task_doc = db.collection("tasks").document(task_id).get()
    if not task_doc.exists:
        logger.error(f"Task not found - skipping: task={task_id}")
        return

    if task_doc.to_dict().get("status") == "COMPLETED":
        logger.warning(f"Task already completed, skipping: task={task_id}")
        return

    db.collection("tasks").document(task_id).update({"status": "IN_PROGRESS", "updatedAt": now_iso()})

    pipeline_results = await run_langgraph_pipeline(task_id)
    all_passed = all(r.status == "COMPLETED" for r in pipeline_results)

    if all_passed:
        await _queue_dependent_tasks(task_id, project_id)

    duration_ms = int((time.monotonic() - started_at) * 1000)
    status_label = "COMPLETED" if all_passed else "FAILED"
    logger.info(f"Task job finished: task={task_id} status={status_label} duration={duration_ms}ms")


async def _job_handler(job: Job) -> None:
    task_queue.update_job(job.id, state="active")
    logger.info(f"Job active: job={job.id} task={job.data.taskId}")
    try:
        await _process_job(job)
        task_queue.update_job(job.id, state="completed")
        logger.info(f"Job completed: job={job.id}")
    except Exception as err:
        error_msg = str(err)
        task_queue.update_job(job.id, state="failed", failed_reason=error_msg)
        logger.error(f"Job failed: job={job.id} error={error_msg}")
        try:
            db.collection("tasks").document(job.data.taskId).update(
                {"status": "FAILED", "updatedAt": now_iso()}
            )
        except Exception as db_err:
            logger.error(f"Failed to mark task as FAILED: {db_err}")


task_queue.on_job(_job_handler)
logger.info("Task worker registered (in-memory queue)")
