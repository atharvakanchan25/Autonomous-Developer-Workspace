from typing import Literal, Optional
from pydantic import BaseModel


from typing import Literal, Optional
from pydantic import BaseModel
from backend.core.utils import now_iso


class TaskUpdatedPayload(BaseModel):
    taskId: str
    projectId: str
    status: str  # "pending", "in_progress", "completed", "failed", etc.
    title: str
    updatedAt: Optional[str] = None
    
    def __init__(self, **data):
        if 'updatedAt' not in data:
            data['updatedAt'] = now_iso()
        super().__init__(**data)


class AgentLogPayload(BaseModel):
    taskId: str
    projectId: str
    agentRunId: str
    agentType: str
    level: Literal["info", "warn", "error"]
    message: str
    meta: Optional[dict] = None
    timestamp: str


class PipelineStagePayload(BaseModel):
    taskId: str
    projectId: str
    agentType: str
    stage: Literal["started", "completed", "failed"]
    durationMs: Optional[int] = None
    summary: Optional[str] = None
    error: Optional[str] = None
    timestamp: str


class CicdStageLog(BaseModel):
    stage: str
    status: Literal["running", "passed", "failed", "skipped"]
    durationMs: Optional[int] = None
    detail: Optional[str] = None


class DeploymentUpdatedPayload(BaseModel):
    deploymentId: str
    projectId: str
    taskId: Optional[str] = None
    status: Literal["PENDING", "RUNNING", "SUCCESS", "FAILED"]
    stage: Optional[str] = None
    previewUrl: Optional[str] = None
    errorMsg: Optional[str] = None
    log: list[CicdStageLog]
    updatedAt: str
