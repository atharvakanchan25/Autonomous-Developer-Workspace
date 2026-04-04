from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from firebase_admin import firestore
from backend.core.database import db
from backend.core.errors import not_found, bad_request
from backend.core.utils import now_iso
from backend.auth.auth import AuthUser, get_current_user, log_action
from backend.core.logger import logger

router = APIRouter()


def _delete_docs(docs) -> int:
    docs = list(docs)
    if not docs:
        return 0

    deleted = 0
    for idx in range(0, len(docs), 400):
        batch = db.batch()
        chunk = docs[idx:idx + 400]
        for doc in chunk:
            batch.delete(doc.reference)
        batch.commit()
        deleted += len(chunk)
    return deleted

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
    query = db.collection("projects").where("ownerId", "==", user.uid)
    
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

    deleted_counts = {
        "tasks": 0,
        "files": 0,
        "legacyFiles": 0,
        "fileVersions": 0,
        "agentRuns": 0,
        "deployments": 0,
        "observabilityLogs": 0,
        "aiPlanRuns": 0,
        "auditLogs": 0,
    }

    tasks = list(db.collection("tasks").where("projectId", "==", project_id).stream())
    deleted_counts["tasks"] = _delete_docs(tasks)

    files = list(db.collection("files").where("projectId", "==", project_id).stream())
    deleted_counts["files"] = _delete_docs(files)

    legacy_files = list(db.collection("projectFiles").where("projectId", "==", project_id).stream())
    deleted_counts["legacyFiles"] = _delete_docs(legacy_files)

    file_ids = [doc.id for doc in files] + [doc.id for doc in legacy_files]
    file_version_docs = []
    for file_id in file_ids:
        file_version_docs.extend(list(db.collection("fileVersions").where("fileId", "==", file_id).stream()))
    deleted_counts["fileVersions"] = _delete_docs(file_version_docs)

    deleted_counts["agentRuns"] = _delete_docs(
        db.collection("agentRuns").where("projectId", "==", project_id).stream()
    )
    deleted_counts["deployments"] = _delete_docs(
        db.collection("deployments").where("projectId", "==", project_id).stream()
    )
    deleted_counts["observabilityLogs"] = _delete_docs(
        db.collection("observabilityLogs").where("projectId", "==", project_id).stream()
    )
    deleted_counts["aiPlanRuns"] = _delete_docs(
        db.collection("aiPlanRuns").where("projectId", "==", project_id).stream()
    )

    audit_logs = []
    for audit_doc in db.collection("audit_logs").stream():
        meta = audit_doc.to_dict().get("meta", {}) or {}
        if meta.get("projectId") == project_id:
            audit_logs.append(audit_doc)
    deleted_counts["auditLogs"] = _delete_docs(audit_logs)

    db.collection("projects").document(project_id).delete()
    await log_action(user, "PROJECT_DELETE", {"name": project.get("name", ""), "resourceType": "project"})
    logger.info(f"Project deleted permanently: {project_id} by {user.email} cleanup={deleted_counts}")
    return {"message": "Project deleted successfully"}
