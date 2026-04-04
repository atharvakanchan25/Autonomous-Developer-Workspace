from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from typing import Optional
from firebase_admin import firestore
from backend.core.database import db
from backend.core.errors import not_found, bad_request
from backend.core.utils import now_iso
from backend.auth.auth import AuthUser, get_current_user
from backend.core.logger import logger
from backend.realtime.emitter import emit_task_updated
from backend.realtime.events import TaskUpdatedPayload

router = APIRouter()

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
    elif not user.is_admin():
        query = query.where("ownerId", "==", user.uid)
    
    if status:
        query = query.where("status", "==", status)
    
    docs = query.order_by("createdAt", direction=firestore.Query.DESCENDING).stream()
    return [{"id": d.id, **d.to_dict()} for d in docs]

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
        "status": "pending",
        "priority": body.priority or "medium",
        "ownerId": user.uid,
        "ownerEmail": user.email,
        "createdAt": now_iso(),
        "updatedAt": now_iso(),
    }
    
    _, ref = db.collection("tasks").add(task_data)
    logger.info(f"Task created: {ref.id} by {user.email}")
    
    result = {"id": ref.id, **task_data}
    await emit_task_updated(TaskUpdatedPayload(
        taskId=ref.id,
        projectId=body.projectId,
        status="pending",
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
    
    return {"id": doc.id, **task}

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
        updates["status"] = body.status
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
    
    return {"id": updated_doc.id, **updated_task}

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