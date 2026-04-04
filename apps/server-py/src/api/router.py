from fastapi import APIRouter

from src.agents.agent_service import router as agents_router
from src.modules.admin.admin_service import router as admin_router
from src.modules.ai.ai_service import router as ai_router
from src.modules.cicd.cicd_service import router as cicd_router
from src.modules.dev.dev_service import router as dev_router
from src.modules.files.files_service import router as files_router
from src.modules.observability.observability_service import router as observe_router
from src.modules.projects.projects_service import router as projects_router
from src.modules.tasks.tasks_service import router as tasks_router


api_router = APIRouter()
api_router.include_router(projects_router, prefix="/projects")
api_router.include_router(tasks_router, prefix="/tasks")
api_router.include_router(ai_router, prefix="/ai")
api_router.include_router(agents_router, prefix="/agents")
api_router.include_router(files_router, prefix="/files")
api_router.include_router(cicd_router, prefix="/cicd")
api_router.include_router(observe_router, prefix="/observe")
api_router.include_router(admin_router, prefix="/admin")
api_router.include_router(dev_router, prefix="/dev")
