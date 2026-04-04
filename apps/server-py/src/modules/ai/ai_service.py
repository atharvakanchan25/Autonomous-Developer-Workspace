from fastapi import APIRouter, Depends
from pydantic import BaseModel
from src.auth.auth import AuthUser, get_current_user
from src.application.ai import generate_project_plan

router = APIRouter()


class GeneratePlanRequest(BaseModel):
    projectId: str
    description: str


@router.post("/generate-plan", status_code=201)
async def generate_plan(body: GeneratePlanRequest, user: AuthUser = Depends(get_current_user)):
    """Generate AI task plan for a project."""
    return await generate_project_plan(
        project_id=body.projectId,
        description=body.description,
        user=user,
    )
