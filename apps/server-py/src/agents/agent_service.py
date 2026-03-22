from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from src.agents.agent_registry import register_agent, list_agents
from src.agents.agent_dispatcher import dispatch_agent, dispatch_pipeline
from src.agents.agent_types import AgentType
from src.agents.runners.code_generator import CodeGeneratorAgent
from src.agents.runners.test_generator import TestGeneratorAgent
from src.agents.runners.code_reviewer import CodeReviewerAgent
from src.lib.firestore import db
from src.lib.errors import not_found, bad_request
from src.lib.logger import logger

router = APIRouter()


def bootstrap_agents() -> None:
    register_agent(CodeGeneratorAgent())
    register_agent(TestGeneratorAgent())
    register_agent(CodeReviewerAgent())
    logger.info(f"All agents registered: {[a.type for a in list_agents()]}")


class RunAgentRequest(BaseModel):
    taskId: str
    agentType: Optional[AgentType] = None
    pipeline: bool = False


@router.post("/run")
async def run_agent(body: RunAgentRequest):
    if body.pipeline:
        results = await dispatch_pipeline(body.taskId)
        return [{"agentRunId": r.agentRunId, "taskId": r.taskId, "agentType": r.agentType, "status": r.status, "durationMs": r.durationMs} for r in results]
    if not body.agentType:
        raise bad_request("agentType is required when pipeline is false")
    result = await dispatch_agent(body.taskId, body.agentType)
    return {"agentRunId": result.agentRunId, "taskId": result.taskId, "agentType": result.agentType, "status": result.status, "durationMs": result.durationMs}


@router.get("/runs/{task_id}")
async def list_agent_runs(task_id: str):
    task_doc = db.collection("tasks").document(task_id).get()
    if not task_doc.exists:
        raise not_found("Task")
    snap = db.collection("agentRuns").where("taskId", "==", task_id).order_by("createdAt").stream()
    return [{"id": d.id, **d.to_dict()} for d in snap]


@router.get("/")
def get_registered_agents():
    return [{"type": a.type, "displayName": a.display_name, "description": a.description} for a in list_agents()]
