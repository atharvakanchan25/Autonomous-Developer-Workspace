from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from firebase_admin import firestore
from backend.core.database import db
from backend.core.errors import not_found, bad_request
from backend.core.utils import now_iso
from backend.auth.auth import AuthUser, get_current_user
from backend.core.logger import logger

router = APIRouter()

class CreateProjectRequest(BaseModel):
    name: str
    description: Optional[str] = ""
    techStack: Optional[list[str]] = []

class UpdateProjectRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    techStack: Optional[list[str]] = None

@router.get("/")
async def list_projects(user: AuthUser = Depends(get_current_user)):
    """List all projects for the current user."""
    query = db.collection("projects")
    if not user.is_admin():
        query = query.where("ownerId", "==", user.uid)
    
    docs = query.order_by("createdAt", direction=firestore.Query.DESCENDING).stream()
    return [{"id": d.id, **d.to_dict()} for d in docs]

@router.post("/")
async def create_project(body: CreateProjectRequest, user: AuthUser = Depends(get_current_user)):
    """Create a new project."""
    if not body.name or not body.name.strip():
        raise bad_request("Project name is required")
    
    project_data = {
        "name": body.name.strip(),
        "description": body.description or "",
        "techStack": body.techStack or [],
        "ownerId": user.uid,
        "ownerEmail": user.email,
        "status": "active",
        "createdAt": now_iso(),
        "updatedAt": now_iso(),
    }
    
    _, ref = db.collection("projects").add(project_data)
    logger.info(f"Project created: {ref.id} by {user.email}")
    return {"id": ref.id, **project_data}

@router.get("/{project_id}")
async def get_project(project_id: str, user: AuthUser = Depends(get_current_user)):
    """Get a specific project by ID."""
    doc = db.collection("projects").document(project_id).get()
    if not doc.exists:
        raise not_found("Project")
    
    project = doc.to_dict()
    if not user.can_access_resource(project.get("ownerId")):
        raise not_found("Project")
    
    return {"id": doc.id, **project}

@router.patch("/{project_id}")
async def update_project(project_id: str, body: UpdateProjectRequest, user: AuthUser = Depends(get_current_user)):
    """Update a project."""
    doc = db.collection("projects").document(project_id).get()
    if not doc.exists:
        raise not_found("Project")
    
    project = doc.to_dict()
    if not user.can_access_resource(project.get("ownerId")):
        raise not_found("Project")
    
    updates = {"updatedAt": now_iso()}
    if body.name is not None:
        updates["name"] = body.name.strip()
    if body.description is not None:
        updates["description"] = body.description
    if body.techStack is not None:
        updates["techStack"] = body.techStack
    
    db.collection("projects").document(project_id).update(updates)
    logger.info(f"Project updated: {project_id} by {user.email}")
    
    updated_doc = db.collection("projects").document(project_id).get()
    return {"id": updated_doc.id, **updated_doc.to_dict()}

@router.delete("/{project_id}")
async def delete_project(project_id: str, user: AuthUser = Depends(get_current_user)):
    """Delete a project and all its related data."""
    doc = db.collection("projects").document(project_id).get()
    if not doc.exists:
        raise not_found("Project")
    
    project = doc.to_dict()
    if not user.can_access_resource(project.get("ownerId")):
        raise not_found("Project")
    
    # Delete related tasks
    tasks = db.collection("tasks").where("projectId", "==", project_id).stream()
    for task in tasks:
        task.reference.delete()
    
    # Delete project
    db.collection("projects").document(project_id).delete()
    logger.info(f"Project deleted: {project_id} by {user.email}")
    return {"message": "Project deleted successfully"}