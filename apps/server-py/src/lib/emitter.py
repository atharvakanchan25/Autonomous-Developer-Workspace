from src.lib.socket import sio
from src.lib.firestore import db
from src.lib.logger import logger
from src.lib.utils import now_iso
from src.lib.socket_events import (
    TaskUpdatedPayload, AgentLogPayload,
    PipelineStagePayload, DeploymentUpdatedPayload,
)


def _room(project_id: str) -> str:
    return f"project:{project_id}"


async def emit_task_updated(payload: TaskUpdatedPayload):
    await sio.emit("task:updated", payload.model_dump(), room=_room(payload.projectId))


async def emit_agent_log(payload: AgentLogPayload):
    # Persist to Firestore for observability
    try:
        db.collection("observabilityLogs").add({
            "level": payload.level.upper(),
            "source": "agent",
            "message": payload.message,
            "projectId": payload.projectId,
            "taskId": payload.taskId,
            "agentType": payload.agentType,
            "agentRunId": payload.agentRunId,
            "createdAt": payload.timestamp or now_iso(),
        })
    except Exception as e:
        logger.warning(f"Failed to persist observability log: {e}")
    
    await sio.emit("agent:log", payload.model_dump(), room=_room(payload.projectId))


async def emit_pipeline_stage(payload: PipelineStagePayload):
    await sio.emit("pipeline:stage", payload.model_dump(), room=_room(payload.projectId))


async def emit_deployment_updated(payload: DeploymentUpdatedPayload):
    await sio.emit("deployment:updated", payload.model_dump(mode="json"), room=_room(payload.projectId))
