import asyncio
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from backend.core.database import db
from backend.core.errors import not_found
from backend.auth.auth import AuthUser, get_current_user
from backend.api.ai.langgraph_planner import generate_plan_with_langgraph
from agents.project_orchestrator import auto_run_project_pipeline

router = APIRouter()

class GeneratePlanRequest(BaseModel):
    projectId: str
    description: str = ""
    prompt: str = ""

@router.post("/generate-plan")
async def generate_plan(body: GeneratePlanRequest, user: AuthUser = Depends(get_current_user)):
    """Generate an AI execution plan for a project and create tasks."""
    project_id = body.projectId
    prompt = (body.description or body.prompt or "").strip()

    if not project_id:
        return {"error": "projectId is required"}
    
    # Verify project exists and user has access
    project_doc = db.collection("projects").document(project_id).get()
    if not project_doc.exists:
        raise not_found("Project")
    
    project = project_doc.to_dict()
    if not user.can_access_resource(project.get("ownerId")):
        raise not_found("Project")

    plan = await generate_plan_with_langgraph(
        project_id=project_id,
        prompt=prompt,
        user_id=user.uid,
        user_email=user.email,
    )
    asyncio.create_task(auto_run_project_pipeline(project_id))
    plan.setdefault("meta", {})
    plan["meta"]["autoRun"] = True
    plan["meta"]["retryPolicy"] = {"maxRetries": 2}
    return plan

@router.get("/status")
async def ai_status():
    """Get AI service status."""
    return {
        "status": "ok",
        "availableAgents": ["scaffold", "code_generator", "test_generator", "code_reviewer"]
    }
