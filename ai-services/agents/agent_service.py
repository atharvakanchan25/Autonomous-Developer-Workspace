from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
import sys
from pathlib import Path

# Add backend to Python path
sys.path.append(str(Path(__file__).parent.parent.parent / "backend"))

from agents.agent_registry import register_agent, list_agents
from agents.agent_dispatcher import dispatch_agent
from agents.langgraph_pipeline import run_langgraph_pipeline
from agents.agent_types import AgentType
from agents.runners.code_generator import CodeGeneratorAgent
from agents.runners.test_generator import TestGeneratorAgent
from agents.runners.code_reviewer import CodeReviewerAgent
from agents.runners.scaffold_agent import ScaffoldAgent
from agents.runners.frontend_generator import FrontendGeneratorAgent
from core.database import db
from core.errors import not_found, bad_request
from core.logger import logger
from auth.auth import AuthUser, get_current_user

router = APIRouter()


def bootstrap_agents() -> None:
    register_agent(CodeGeneratorAgent())
    register_agent(TestGeneratorAgent())
    register_agent(CodeReviewerAgent())
    register_agent(ScaffoldAgent())
    register_agent(FrontendGeneratorAgent())
    logger.info(f"All agents registered: {[a.type.value for a in list_agents()]}")


class RunAgentRequest(BaseModel):
    taskId: str
    agentType: Optional[AgentType] = None
    pipeline: bool = False


@router.post("/run")
async def run_agent(body: RunAgentRequest, user: AuthUser = Depends(get_current_user)):
    """Run AI agent(s) for a task."""
    if body.pipeline:
        results = await run_langgraph_pipeline(body.taskId)
        return [
            {
                "agentRunId": r.agentRunId,
                "taskId": r.taskId,
                "agentType": r.agentType,
                "status": r.status,
                "durationMs": r.durationMs,
            }
            for r in results
        ]

    if not body.agentType:
        raise bad_request("agentType is required when pipeline is false")

    result = await dispatch_agent(body.taskId, body.agentType)
    return {
        "agentRunId": result.agentRunId,
        "taskId": result.taskId,
        "agentType": result.agentType,
        "status": result.status,
        "durationMs": result.durationMs,
    }


@router.get("/runs/{task_id}")
async def list_agent_runs(task_id: str, user: AuthUser = Depends(get_current_user)):
    """List all agent runs for a task."""
    task_doc = db.collection("tasks").document(task_id).get()
    if not task_doc.exists:
        raise not_found("Task")

    runs = db.collection("agentRuns").where("taskId", "==", task_id).order_by("createdAt").stream()
    return [{"id": d.id, **d.to_dict()} for d in runs]


@router.get("/")
def get_registered_agents():
    return [{"type": a.type, "displayName": a.display_name, "description": a.description} for a in list_agents()]
