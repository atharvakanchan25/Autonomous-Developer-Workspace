from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from src.lib.firestore import db
from src.lib.errors import not_found
from src.lib.utils import now_iso
from src.lib.auth import AuthUser, get_current_user, log_action

router = APIRouter()


class CreateProjectRequest(BaseModel):
    name: str
    description: Optional[str] = None


@router.get("/")
async def list_projects(user: AuthUser = Depends(get_current_user)):
    """List projects - admins see all, users see only their own."""
    if user.is_admin():
        projects = db.collection("projects").order_by("createdAt", direction="DESCENDING").stream()
    else:
        projects = db.collection("projects").where("ownerId", "==", user.uid).order_by("createdAt", direction="DESCENDING").stream()
    return [{"id": d.id, **d.to_dict()} for d in projects]


@router.post("/", status_code=201)
async def create_project(body: CreateProjectRequest, user: AuthUser = Depends(get_current_user)):
    """Create a new project."""
    now = now_iso()
    ref = db.collection("projects").add({
        **body.model_dump(),
        "ownerId": user.uid,
        "createdAt": now,
        "updatedAt": now,
    })[1]
    
    await log_action(user, "PROJECT_CREATE", {"projectId": ref.id, "name": body.name})
    return {"id": ref.id, **body.model_dump(), "ownerId": user.uid, "createdAt": now, "updatedAt": now}


@router.get("/{project_id}")
async def get_project(project_id: str, user: AuthUser = Depends(get_current_user)):
    """Get project details with all tasks."""
    doc = db.collection("projects").document(project_id).get()
    if not doc.exists:
        raise not_found("Project")
    
    project_data = doc.to_dict()
    
    # Check access: admin can see all, users must own it
    if not user.can_access_resource(project_data.get("ownerId")):
        raise HTTPException(status_code=403, detail="Access denied")
    
    tasks = [
        {"id": d.id, **d.to_dict()}
        for d in db.collection("tasks").where("projectId", "==", project_id).stream()
    ]
    return {"id": doc.id, **project_data, "tasks": tasks}


@router.patch("/{project_id}")
async def update_project(project_id: str, body: CreateProjectRequest, user: AuthUser = Depends(get_current_user)):
    """Update project details."""
    doc = db.collection("projects").document(project_id).get()
    if not doc.exists:
        raise not_found("Project")
    
    project_data = doc.to_dict()
    
    # Check access: admin can update any, users can only update their own
    if not user.can_access_resource(project_data.get("ownerId")):
        raise HTTPException(status_code=403, detail="Access denied")
    
    now = now_iso()
    db.collection("projects").document(project_id).update({
        **body.model_dump(),
        "updatedAt": now
    })
    
    await log_action(user, "PROJECT_UPDATE", {"projectId": project_id})
    return {"id": project_id, **body.model_dump(), "ownerId": project_data.get("ownerId"), "updatedAt": now}


@router.delete("/{project_id}", status_code=204)
async def delete_project(project_id: str, user: AuthUser = Depends(get_current_user)):
    """Delete a project and all its tasks."""
    doc = db.collection("projects").document(project_id).get()
    if not doc.exists:
        raise not_found("Project")
    
    project_data = doc.to_dict()
    
    # Only admin or owner can delete
    if not user.can_access_resource(project_data.get("ownerId")):
        raise HTTPException(status_code=403, detail="Access denied. Only project owner or admin can delete.")
    
    # Delete all tasks in the project
    tasks = db.collection("tasks").where("projectId", "==", project_id).stream()
    for task in tasks:
        task.reference.delete()
    
    # Delete the project
    db.collection("projects").document(project_id).delete()
    
    await log_action(user, "PROJECT_DELETE", {"projectId": project_id})
