from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from typing import Optional
from backend.core.database import db
from backend.core.errors import not_found, bad_request
from backend.core.utils import now_iso
from backend.auth.auth import AuthUser, get_current_user
from backend.core.logger import logger

router = APIRouter()


def serialize_file(file_id: str, data: dict, include_content: bool = True) -> dict:
    content = data.get("content", "") or ""
    path = data.get("path", "")
    return {
        "id": file_id,
        **data,
        "name": data.get("name") or path.split("/")[-1],
        "size": int(data.get("size") or len(content.encode("utf-8"))),
        "content": content if include_content else "",
    }

class CreateFileRequest(BaseModel):
    projectId: str
    path: str
    content: str
    language: Optional[str] = "text"

class UpdateFileRequest(BaseModel):
    content: str

@router.get("/")
async def list_files(
    projectId: str = Query(...),
    user: AuthUser = Depends(get_current_user)
):
    """List all files in a project."""
    # Verify project access
    project_doc = db.collection("projects").document(projectId).get()
    if not project_doc.exists:
        raise not_found("Project")
    project = project_doc.to_dict()
    if not user.can_access_resource(project.get("ownerId")):
        raise not_found("Project")
    
    docs = db.collection("files").where("projectId", "==", projectId).order_by("path").stream()
    return [serialize_file(d.id, d.to_dict(), include_content=False) for d in docs]

@router.post("/")
async def create_file(body: CreateFileRequest, user: AuthUser = Depends(get_current_user)):
    """Create a new file in a project."""
    if not body.path or not body.path.strip():
        raise bad_request("File path is required")
    
    # Verify project access
    project_doc = db.collection("projects").document(body.projectId).get()
    if not project_doc.exists:
        raise not_found("Project")
    project = project_doc.to_dict()
    if not user.can_access_resource(project.get("ownerId")):
        raise not_found("Project")
    
    # Check if file already exists
    existing = db.collection("files").where("projectId", "==", body.projectId).where("path", "==", body.path).limit(1).stream()
    if list(existing):
        raise bad_request("File already exists at this path")
    
    file_data = {
        "projectId": body.projectId,
        "path": body.path.strip(),
        "content": body.content,
        "name": body.path.strip().split("/")[-1],
        "language": body.language or "text",
        "size": len((body.content or "").encode("utf-8")),
        "createdBy": user.email,
        "createdAt": now_iso(),
        "updatedAt": now_iso(),
    }
    
    _, ref = db.collection("files").add(file_data)
    logger.info(f"File created: {body.path} in project {body.projectId}")
    return serialize_file(ref.id, file_data)

@router.get("/{file_id}")
async def get_file(file_id: str, user: AuthUser = Depends(get_current_user)):
    """Get a specific file by ID."""
    doc = db.collection("files").document(file_id).get()
    if not doc.exists:
        raise not_found("File")
    
    file_data = doc.to_dict()
    
    # Verify project access
    project_doc = db.collection("projects").document(file_data.get("projectId")).get()
    if project_doc.exists:
        project = project_doc.to_dict()
        if not user.can_access_resource(project.get("ownerId")):
            raise not_found("File")
    
    return serialize_file(doc.id, file_data)

@router.patch("/{file_id}")
async def update_file(file_id: str, body: UpdateFileRequest, user: AuthUser = Depends(get_current_user)):
    """Update file content."""
    doc = db.collection("files").document(file_id).get()
    if not doc.exists:
        raise not_found("File")
    
    file_data = doc.to_dict()
    
    # Verify project access
    project_doc = db.collection("projects").document(file_data.get("projectId")).get()
    if project_doc.exists:
        project = project_doc.to_dict()
        if not user.can_access_resource(project.get("ownerId")):
            raise not_found("File")
    
    db.collection("files").document(file_id).update({
        "content": body.content,
        "size": len((body.content or "").encode("utf-8")),
        "updatedAt": now_iso(),
    })
    
    logger.info(f"File updated: {file_id}")
    updated_doc = db.collection("files").document(file_id).get()
    return serialize_file(updated_doc.id, updated_doc.to_dict())

@router.delete("/{file_id}")
async def delete_file(file_id: str, user: AuthUser = Depends(get_current_user)):
    """Delete a file."""
    doc = db.collection("files").document(file_id).get()
    if not doc.exists:
        raise not_found("File")
    
    file_data = doc.to_dict()
    
    # Verify project access
    project_doc = db.collection("projects").document(file_data.get("projectId")).get()
    if project_doc.exists:
        project = project_doc.to_dict()
        if not user.can_access_resource(project.get("ownerId")):
            raise not_found("File")
    
    db.collection("files").document(file_id).delete()
    logger.info(f"File deleted: {file_id}")
    return {"message": "File deleted successfully"}
