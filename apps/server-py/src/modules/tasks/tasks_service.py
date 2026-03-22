from fastapi import APIRouter, Query
from pydantic import BaseModel
from typing import Optional, Literal

from src.lib.firestore import db
from src.lib.errors import not_found
from src.lib.utils import now_iso
from src.lib import emitter
from src.lib.socket_events import TaskUpdatedPayload
from src.agents.agent_types import TaskStatus

router = APIRouter()


class CreateTaskRequest(BaseModel):
    projectId: str
    title: str
    description: Optional[str] = None
    order: int = 0
    dependsOn: list[str] = []


class UpdateTaskStatusRequest(BaseModel):
    status: TaskStatus


@router.get("/")
def list_tasks(projectId: Optional[str] = Query(None)):
    q = db.collection("tasks").order_by("createdAt", direction="DESCENDING")
    if projectId:
        q = q.where("projectId", "==", projectId)
    return [{"id": d.id, **d.to_dict()} for d in q.stream()]


@router.get("/{task_id}")
def get_task(task_id: str):
    doc = db.collection("tasks").document(task_id).get()
    if not doc.exists:
        raise not_found("Task")
    return {"id": doc.id, **doc.to_dict()}


@router.post("/", status_code=201)
async def create_task(body: CreateTaskRequest):
    if not db.collection("projects").document(body.projectId).get().exists:
        raise not_found("Project")
    now = now_iso()
    ref = db.collection("tasks").add({
        **body.model_dump(),
        "status": TaskStatus.PENDING.value,
        "createdAt": now,
        "updatedAt": now,
    })[1]
    task = {"id": ref.id, **body.model_dump(), "status": TaskStatus.PENDING.value, "createdAt": now, "updatedAt": now}
    await emitter.emit_task_updated(TaskUpdatedPayload(
        taskId=task["id"], projectId=task["projectId"],
        status="PENDING", title=task["title"], updatedAt=now,
    ))
    return task


@router.patch("/{task_id}/status")
async def update_task_status(task_id: str, body: UpdateTaskStatusRequest):
    doc = db.collection("tasks").document(task_id).get()
    if not doc.exists:
        raise not_found("Task")
    now = now_iso()
    db.collection("tasks").document(task_id).update({"status": body.status.value, "updatedAt": now})
    updated = {"id": task_id, **doc.to_dict(), "status": body.status.value, "updatedAt": now}
    await emitter.emit_task_updated(TaskUpdatedPayload(
        taskId=task_id, projectId=updated["projectId"],
        status=body.status.value, title=updated["title"], updatedAt=now,
    ))
    return updated
