from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from typing import Optional
from firebase_admin import firestore
from backend.core.database import db
from backend.core.errors import not_found
from backend.auth.auth import AuthUser, get_current_user, require_role
from backend.core.utils import now_iso
from backend.core.logger import logger

router = APIRouter()

@router.get("/users/me")
async def get_current_user_info(user: AuthUser = Depends(get_current_user)):
    """Get current user information."""
    doc = db.collection("users").document(user.uid).get()
    if not doc.exists:
        raise not_found("User")
    
    user_data = doc.to_dict()
    return {
        "id": doc.id,
        "uid": user.uid,
        "email": user.email,
        "role": user.role,
        "createdAt": user_data.get("createdAt"),
        "updatedAt": user_data.get("updatedAt"),
    }

@router.get("/users")
async def list_users(user: AuthUser = Depends(require_role("admin"))):
    """List all users (admin only)."""
    docs = db.collection("users").order_by("createdAt", direction=firestore.Query.DESCENDING).stream()
    return [{"id": d.id, **d.to_dict()} for d in docs]

class UpdateUserRoleRequest(BaseModel):
    role: str

@router.patch("/users/{user_id}/role")
async def update_user_role(
    user_id: str,
    body: UpdateUserRoleRequest,
    user: AuthUser = Depends(require_role("admin"))
):
    """Update user role (admin only)."""
    if body.role not in ["user", "admin"]:
        raise not_found("Invalid role")
    
    doc = db.collection("users").document(user_id).get()
    if not doc.exists:
        raise not_found("User")
    
    db.collection("users").document(user_id).update({
        "role": body.role,
        "updatedAt": now_iso(),
    })
    
    logger.info(f"User role updated: {user_id} -> {body.role} by {user.email}")
    updated_doc = db.collection("users").document(user_id).get()
    return {"id": updated_doc.id, **updated_doc.to_dict()}

@router.get("/stats")
async def get_admin_stats(user: AuthUser = Depends(require_role("admin"))):
    """Get system statistics (admin only)."""
    projects_count = len(list(db.collection("projects").limit(1000).stream()))
    tasks_count = len(list(db.collection("tasks").limit(1000).stream()))
    users_count = len(list(db.collection("users").limit(1000).stream()))
    
    return {
        "projects": projects_count,
        "tasks": tasks_count,
        "users": users_count,
    }