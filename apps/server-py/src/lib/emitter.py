from src.lib.socket import sio
from src.lib.socket_events import (
    TaskUpdatedPayload, AgentLogPayload,
    PipelineStagePayload, DeploymentUpdatedPayload,
)


def _room(project_id: str) -> str:
    return f"project:{project_id}"


async def emit_task_updated(payload: TaskUpdatedPayload):
    await sio.emit("task:updated", payload.model_dump(), room=_room(payload.projectId))


async def emit_agent_log(payload: AgentLogPayload):
    await sio.emit("agent:log", payload.model_dump(), room=_room(payload.projectId))


async def emit_pipeline_stage(payload: PipelineStagePayload):
    await sio.emit("pipeline:stage", payload.model_dump(), room=_room(payload.projectId))


async def emit_deployment_updated(payload: DeploymentUpdatedPayload):
    await sio.emit("deployment:updated", payload.model_dump(mode="json"), room=_room(payload.projectId))
