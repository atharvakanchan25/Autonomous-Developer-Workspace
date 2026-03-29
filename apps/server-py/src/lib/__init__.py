# backward-compat shim — re-exports from src.core
from src.core.config import config
from src.core.logger import logger
from src.core.database import db
from src.core.cache import project_cache, task_cache
from src.core.utils import now_iso
from src.core.errors import not_found, bad_request
from src.core.groq_client import groq_client
from src.auth.auth import AuthUser, get_current_user, require_role, log_action
from src.realtime.server import sio
from src.realtime.emitter import emit_task_updated, emit_agent_log, emit_pipeline_stage, emit_deployment_updated
from src.realtime.events import (
    TaskUpdatedPayload, AgentLogPayload, PipelineStagePayload,
    CicdStageLog, DeploymentUpdatedPayload,
)

__all__ = [
    "config", "logger", "db", "project_cache", "task_cache", "now_iso",
    "not_found", "bad_request", "groq_client",
    "AuthUser", "get_current_user", "require_role", "log_action",
    "sio",
    "emit_task_updated", "emit_agent_log", "emit_pipeline_stage", "emit_deployment_updated",
    "TaskUpdatedPayload", "AgentLogPayload", "PipelineStagePayload",
    "CicdStageLog", "DeploymentUpdatedPayload",
]
