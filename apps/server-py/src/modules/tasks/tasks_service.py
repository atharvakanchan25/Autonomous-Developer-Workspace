from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional

from src.lib.firestore import db
from src.lib.errors import not_found
from src.lib.utils import now_iso
from src.lib import emitter
from src.lib.socket_events import TaskUpdatedPayload
from src.agents.agent_types import TaskStatus
from src.lib.auth import AuthUser, get_current_user, log_action

router = APIRouter()


class CreateTaskRequest(BaseModel):
    projectId: str
    title: str
    description: Optional[str] = None
    order: int = 0
    dependsOn: list[str] = []
    assignedTo: Optional[str] = None  # Admin can assign to others


class UpdateTaskStatusRequest(BaseModel):
    status: TaskStatus


class AssignTaskRequest(BaseModel):
    assignedTo: str


def _check_project_access(project_id: str, user: AuthUser):
    """Verify user has access to the project."""
    if user.is_admin():
        return
    
    doc = db.collection("projects").document(project_id).get()
    if doc.exists and doc.to_dict().get("ownerId") == user.uid:
        return
    
    raise HTTPException(status_code=403, detail="Access denied")


@router.get("/")
async def list_tasks(projectId: Optional[str] = Query(None), user: AuthUser = Depends(get_current_user)):
    """List tasks, optionally filtered by project."""
    query = db.collection("tasks").order_by("createdAt", direction="DESCENDING")
    
    if projectId:
        _check_project_access(projectId, user)
        query = query.where("projectId", "==", projectId)
    elif not user.is_admin():
        # Users only see tasks from their own projects
        owned_projects = [d.id for d in db.collection("projects").where("ownerId", "==", user.uid).stream()]
        if not owned_projects:
            return []
        query = query.where("projectId", "in", owned_projects)
    
    return [{"id": d.id, **d.to_dict()} for d in query.stream()]


@router.get("/{task_id}")
async def get_task(task_id: str, user: AuthUser = Depends(get_current_user)):
    """Get task details."""
    doc = db.collection("tasks").document(task_id).get()
    if not doc.exists:
        raise not_found("Task")
    
    _check_project_access(doc.to_dict().get("projectId", ""), user)
    return {"id": doc.id, **doc.to_dict()}


@router.post("/", status_code=201)
async def create_task(body: CreateTaskRequest, user: AuthUser = Depends(get_current_user)):
    """Create a new task."""
    if not db.collection("projects").document(body.projectId).get().exists:
        raise not_found("Project")
    
    _check_project_access(body.projectId, user)
    
    # Determine task assignment
    assigned_to = body.assignedTo
    if assigned_to:
        # Only admin can assign to others
        if not user.is_admin() and assigned_to != user.uid:
            raise HTTPException(status_code=403, detail="Only admin can assign tasks to other users")
    else:
        # Default: assign to self
        assigned_to = user.uid
    
    now = now_iso()
    ref = db.collection("tasks").add({
        **body.model_dump(exclude={"assignedTo"}),
        "ownerId": user.uid,
        "assignedTo": assigned_to,
        "status": TaskStatus.PENDING.value,
        "createdAt": now,
        "updatedAt": now,
    })[1]
    
    task = {
        "id": ref.id,
        **body.model_dump(exclude={"assignedTo"}),
        "ownerId": user.uid,
        "assignedTo": assigned_to,
        "status": TaskStatus.PENDING.value,
        "createdAt": now,
        "updatedAt": now
    }
    
    await emitter.emit_task_updated(TaskUpdatedPayload(
        taskId=task["id"],
        projectId=task["projectId"],
        status="PENDING",
        title=task["title"],
        updatedAt=now,
    ))
    
    await log_action(user, "TASK_CREATE", {"taskId": ref.id, "projectId": body.projectId})
    return task


@router.patch("/{task_id}/status")
async def update_task_status(
    task_id: str,
    body: UpdateTaskStatusRequest,
    user: AuthUser = Depends(get_current_user)
):
    """Update task status."""
    doc = db.collection("tasks").document(task_id).get()
    if not doc.exists:
        raise not_found("Task")
    
    _check_project_access(doc.to_dict().get("projectId", ""), user)
    
    now = now_iso()
    db.collection("tasks").document(task_id).update({
        "status": body.status.value,
        "updatedAt": now
    })
    
    updated = {"id": task_id, **doc.to_dict(), "status": body.status.value, "updatedAt": now}
    
    await emitter.emit_task_updated(TaskUpdatedPayload(
        taskId=task_id,
        projectId=updated["projectId"],
        status=body.status.value,
        title=updated["title"],
        updatedAt=now,
    ))
    
    await log_action(user, "TASK_STATUS_UPDATE", {"taskId": task_id, "status": body.status.value})
    return updated


@router.patch("/{task_id}/assign")
async def assign_task(
    task_id: str,
    body: AssignTaskRequest,
    user: AuthUser = Depends(get_current_user)
):
    """Assign task to a user. Only admin can assign to others."""
    doc = db.collection("tasks").document(task_id).get()
    if not doc.exists:
        raise not_found("Task")
    
    task_data = doc.to_dict()
    _check_project_access(task_data.get("projectId", ""), user)
    
    # Only admin can assign to others
    if not user.is_admin() and body.assignedTo != user.uid:
        raise HTTPException(status_code=403, detail="Only admin can assign tasks to other users")
    
    now = now_iso()
    db.collection("tasks").document(task_id).update({
        "assignedTo": body.assignedTo,
        "updatedAt": now
    })
    
    await log_action(user, "TASK_ASSIGN", {"taskId": task_id, "assignedTo": body.assignedTo})
    return {"id": task_id, **task_data, "assignedTo": body.assignedTo, "updatedAt": now}


@router.delete("/{task_id}", status_code=204)
async def delete_task(task_id: str, user: AuthUser = Depends(get_current_user)):
    """Delete a task. Only admin or task owner can delete."""
    doc = db.collection("tasks").document(task_id).get()
    if not doc.exists:
        raise not_found("Task")
    
    task_data = doc.to_dict()
    
    # Check project access first
    _check_project_access(task_data.get("projectId", ""), user)
    
    # Only admin or task owner can delete
    if not user.can_access_resource(task_data.get("ownerId")):
        raise HTTPException(status_code=403, detail="Access denied. Only task owner or admin can delete.")
    
    db.collection("tasks").document(task_id).delete()
    
    await log_action(user, "TASK_DELETE", {"taskId": task_id})
