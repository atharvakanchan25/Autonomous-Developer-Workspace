from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from typing import Optional
from backend.core.database import db
from backend.core.errors import not_found, bad_request
from backend.core.utils import now_iso
from backend.auth.auth import AuthUser, get_current_user
from backend.core.logger import logger
from backend.realtime.emitter import emit_task_updated
from backend.realtime.events import TaskUpdatedPayload

router = APIRouter()

STATUS_ALIASES = {
    "pending": "PENDING",
    "in_progress": "IN_PROGRESS",
    "completed": "COMPLETED",
    "failed": "FAILED",
}


def normalize_status(status: Optional[str]) -> str:
    if not status:
        return "PENDING"
    return STATUS_ALIASES.get(status.lower(), status.upper())


def serialize_task(task_id: str, data: dict) -> dict:
    depends_on = data.get("dependsOn") or []
    normalized_deps = []
    for dep in depends_on:
        if isinstance(dep, dict) and dep.get("id"):
            normalized_deps.append({
                "id": dep["id"],
                "title": dep.get("title", ""),
            })
        elif isinstance(dep, str):
            normalized_deps.append({"id": dep, "title": ""})

    return {
        "id": task_id,
        **data,
        "status": normalize_status(data.get("status")),
        "dependsOn": normalized_deps,
    }

class CreateTaskRequest(BaseModel):
    projectId: str
    title: str
    description: Optional[str] = ""
    type: Optional[str] = "feature"
    priority: Optional[str] = "medium"

class UpdateTaskRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    assignedTo: Optional[str] = None

@router.get("/")
async def list_tasks(
    projectId: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    user: AuthUser = Depends(get_current_user)
):
    """List tasks with optional filters."""
    query = db.collection("tasks")
    
    if projectId:
        # Verify user has access to project
        project_doc = db.collection("projects").document(projectId).get()
        if not project_doc.exists:
            raise not_found("Project")
        project = project_doc.to_dict()
        if not user.can_access_resource(project.get("ownerId")):
            return []
        query = query.where("projectId", "==", projectId)
    else:
        query = query.where("ownerId", "==", user.uid)
    
    if status:
        query = query.where("status", "==", status)
    
    tasks = [serialize_task(d.id, d.to_dict()) for d in query.stream()]
    if projectId:
        tasks.sort(key=lambda item: (item.get("order", 0), item.get("createdAt") or item.get("updatedAt") or item["id"]))
    else:
        tasks.sort(
            key=lambda item: item.get("createdAt") or item.get("updatedAt") or item["id"],
            reverse=True,
        )
    return tasks

@router.post("/")
async def create_task(body: CreateTaskRequest, user: AuthUser = Depends(get_current_user)):
    """Create a new task."""
    if not body.title or not body.title.strip():
        raise bad_request("Task title is required")
    
    # Verify project exists and user has access
    project_doc = db.collection("projects").document(body.projectId).get()
    if not project_doc.exists:
        raise not_found("Project")
    project = project_doc.to_dict()
    if not user.can_access_resource(project.get("ownerId")):
        raise not_found("Project")
    
    task_data = {
        "projectId": body.projectId,
        "title": body.title.strip(),
        "description": body.description or "",
        "type": body.type or "feature",
        "status": "PENDING",
        "priority": body.priority or "medium",
        "order": 0,
        "dependsOn": [],
        "ownerId": user.uid,
        "ownerEmail": user.email,
        "createdAt": now_iso(),
        "updatedAt": now_iso(),
    }
    
    _, ref = db.collection("tasks").add(task_data)
    logger.info(f"Task created: {ref.id} by {user.email}")
    
    result = serialize_task(ref.id, task_data)
    await emit_task_updated(TaskUpdatedPayload(
        taskId=ref.id,
        projectId=body.projectId,
        status="PENDING",
        title=body.title.strip()
    ))
    
    return result

@router.get("/{task_id}")
async def get_task(task_id: str, user: AuthUser = Depends(get_current_user)):
    """Get a specific task by ID."""
    doc = db.collection("tasks").document(task_id).get()
    if not doc.exists:
        raise not_found("Task")
    
    task = doc.to_dict()
    if not user.can_access_resource(task.get("ownerId")):
        raise not_found("Task")
    
    return serialize_task(doc.id, task)

@router.patch("/{task_id}")
async def update_task(task_id: str, body: UpdateTaskRequest, user: AuthUser = Depends(get_current_user)):
    """Update a task."""
    doc = db.collection("tasks").document(task_id).get()
    if not doc.exists:
        raise not_found("Task")
    
    task = doc.to_dict()
    if not user.can_access_resource(task.get("ownerId")):
        raise not_found("Task")
    
    updates = {"updatedAt": now_iso()}
    if body.title is not None:
        updates["title"] = body.title.strip()
    if body.description is not None:
        updates["description"] = body.description
    if body.status is not None:
        updates["status"] = normalize_status(body.status)
    if body.priority is not None:
        updates["priority"] = body.priority
    if body.assignedTo is not None:
        updates["assignedTo"] = body.assignedTo
    
    db.collection("tasks").document(task_id).update(updates)
    logger.info(f"Task updated: {task_id} by {user.email}")
    
    updated_doc = db.collection("tasks").document(task_id).get()
    updated_task = updated_doc.to_dict()
    
    await emit_task_updated(TaskUpdatedPayload(
        taskId=task_id,
        projectId=updated_task.get("projectId"),
        status=updated_task.get("status"),
        title=updated_task.get("title")
    ))
    
    return serialize_task(updated_doc.id, updated_task)

@router.patch("/{task_id}/status")
async def update_task_status(task_id: str, body: UpdateTaskRequest, user: AuthUser = Depends(get_current_user)):
    """Update task status only."""
    doc = db.collection("tasks").document(task_id).get()
    if not doc.exists:
        raise not_found("Task")
    
    task = doc.to_dict()
    if not user.can_access_resource(task.get("ownerId")):
        raise not_found("Task")
    
    if body.status is None:
        raise bad_request("Status is required")
    
    now = now_iso()
    normalized_status = normalize_status(body.status)
    db.collection("tasks").document(task_id).update({"status": normalized_status, "updatedAt": now})
    logger.info(f"Task status updated: {task_id} -> {normalized_status} by {user.email}")
    
    updated_doc = db.collection("tasks").document(task_id).get()
    updated_task = updated_doc.to_dict()
    
    await emit_task_updated(TaskUpdatedPayload(
        taskId=task_id,
        projectId=updated_task.get("projectId"),
        status=updated_task.get("status"),
        title=updated_task.get("title")
    ))
    
    return serialize_task(updated_doc.id, updated_task)

@router.patch("/{task_id}/assign")
async def assign_task(task_id: str, body: UpdateTaskRequest, user: AuthUser = Depends(get_current_user)):
    """Assign task to user."""
    doc = db.collection("tasks").document(task_id).get()
    if not doc.exists:
        raise not_found("Task")
    
    task = doc.to_dict()
    if not user.can_access_resource(task.get("ownerId")):
        raise not_found("Task")
    
    if body.assignedTo is None:
        raise bad_request("assignedTo is required")
    
    now = now_iso()
    db.collection("tasks").document(task_id).update({"assignedTo": body.assignedTo, "updatedAt": now})
    logger.info(f"Task assigned: {task_id} -> {body.assignedTo} by {user.email}")
    
    updated_doc = db.collection("tasks").document(task_id).get()
    return serialize_task(updated_doc.id, updated_doc.to_dict())

@router.delete("/{task_id}")
async def delete_task(task_id: str, user: AuthUser = Depends(get_current_user)):
    """Delete a task."""
    doc = db.collection("tasks").document(task_id).get()
    if not doc.exists:
        raise not_found("Task")
    
    task = doc.to_dict()
    if not user.can_access_resource(task.get("ownerId")):
        raise not_found("Task")
    
    db.collection("tasks").document(task_id).delete()
    logger.info(f"Task deleted: {task_id} by {user.email}")
    return {"message": "Task deleted successfully"}
