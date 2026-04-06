from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from backend.core.database import db
from backend.core.errors import not_found
from backend.auth.auth import AuthUser, get_current_user
from backend.core.logger import logger

router = APIRouter()

class SeedDataRequest(BaseModel):
    projectName: str = "Sample Project"
    taskCount: int = 3

@router.post("/seed")
async def seed_data(body: SeedDataRequest, user: AuthUser = Depends(get_current_user)):
    """Seed sample data for development/testing."""
    from backend.core.utils import now_iso
    
    # Create a sample project
    project_data = {
        "name": body.projectName,
        "description": "Sample project for testing",
        "techStack": ["Python", "FastAPI", "React"],
        "ownerId": user.uid,
        "ownerEmail": user.email,
        "status": "active",
        "createdAt": now_iso(),
        "updatedAt": now_iso(),
    }
    _, project_ref = db.collection("projects").add(project_data)
    
    # Create sample tasks
    tasks = []
    for i in range(body.taskCount):
        task_data = {
            "projectId": project_ref.id,
            "title": f"Sample Task {i+1}",
            "description": f"This is a sample task for testing purposes",
            "type": "feature",
            "status": ["pending", "in_progress", "completed"][i % 3],
            "priority": ["low", "medium", "high"][i % 3],
            "ownerId": user.uid,
            "ownerEmail": user.email,
            "createdAt": now_iso(),
            "updatedAt": now_iso(),
        }
        _, task_ref = db.collection("tasks").add(task_data)
        tasks.append({"id": task_ref.id, **task_data})
    
    logger.info(f"Seeded data: 1 project, {body.taskCount} tasks for {user.email}")
    
    return {
        "project": {"id": project_ref.id, **project_data},
        "tasks": tasks,
        "message": f"Successfully seeded {body.taskCount} tasks in project {body.projectName}"
    }

@router.delete("/cleanup")
async def cleanup_data(user: AuthUser = Depends(get_current_user)):
    """Clean up user's data (for development)."""
    # Delete user's projects
    projects = db.collection("projects").where("ownerId", "==", user.uid).stream()
    project_count = 0
    for project in projects:
        # Delete associated tasks
        tasks = db.collection("tasks").where("projectId", "==", project.id).stream()
        for task in tasks:
            task.reference.delete()
        project.reference.delete()
        project_count += 1
    
    logger.info(f"Cleaned up {project_count} projects for {user.email}")
    return {"message": f"Cleaned up {project_count} projects and their tasks"}

@router.get("/status")
async def dev_status():
    """Get development service status."""
    return {
        "status": "ok",
        "endpoints": ["/seed", "/cleanup"]
    }