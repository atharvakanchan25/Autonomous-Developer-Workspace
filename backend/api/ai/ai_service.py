from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from typing import Optional
from backend.core.database import db
from backend.core.errors import not_found
from backend.auth.auth import AuthUser, get_current_user

router = APIRouter()

class GeneratePlanRequest(BaseModel):
    taskId: str
    prompt: str

@router.post("/plan")
async def generate_plan(body: GeneratePlanRequest, user: AuthUser = Depends(get_current_user)):
    """Generate an AI execution plan for a task."""
    # Verify task exists and user has access
    task_doc = db.collection("tasks").document(body.taskId).get()
    if not task_doc.exists:
        raise not_found("Task")
    
    task = task_doc.to_dict()
    if not user.can_access_resource(task.get("ownerId")):
        raise not_found("Task")
    
    # Simple plan generation (can be enhanced with actual LLM)
    plan = {
        "taskId": body.taskId,
        "prompt": body.prompt,
        "steps": [
            {"agent": "scaffold", "description": "Generate project structure"},
            {"agent": "code_generator", "description": "Generate code implementation"},
            {"agent": "test_generator", "description": "Generate unit tests"},
            {"agent": "code_reviewer", "description": "Review code quality"},
        ],
        "estimatedDuration": "5-10 minutes"
    }
    
    return plan

@router.get("/status")
async def ai_status():
    """Get AI service status."""
    return {
        "status": "ok",
        "availableAgents": ["scaffold", "code_generator", "test_generator", "code_reviewer"]
    }