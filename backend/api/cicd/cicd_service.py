from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from firebase_admin import firestore
from backend.core.database import db
from backend.core.errors import not_found, bad_request
from backend.core.utils import now_iso
from backend.auth.auth import AuthUser, get_current_user
from backend.core.logger import logger
from backend.realtime.emitter import emit_deployment_updated
from backend.realtime.events import DeploymentUpdatedPayload, CicdStageLog
import random

router = APIRouter()

class TriggerDeploymentRequest(BaseModel):
    projectId: str
    taskId: Optional[str] = None
    environment: str = "preview"

@router.post("/deploy")
async def trigger_deployment(body: TriggerDeploymentRequest, user: AuthUser = Depends(get_current_user)):
    """Trigger a deployment for a project."""
    # Verify project access
    project_doc = db.collection("projects").document(body.projectId).get()
    if not project_doc.exists:
        raise not_found("Project")
    project = project_doc.to_dict()
    if not user.can_access_resource(project.get("ownerId")):
        raise not_found("Project")
    
    # Create deployment record
    deployment_data = {
        "projectId": body.projectId,
        "taskId": body.taskId,
        "environment": body.environment,
        "status": "PENDING",
        "stage": "initializing",
        "log": [],
        "triggeredBy": user.email,
        "createdAt": now_iso(),
        "updatedAt": now_iso(),
    }
    
    _, ref = db.collection("deployments").add(deployment_data)
    logger.info(f"Deployment triggered: {ref.id} for project {body.projectId}")
    
    result = {"id": ref.id, **deployment_data}
    
    # Emit real-time update
    await emit_deployment_updated(DeploymentUpdatedPayload(
        deploymentId=ref.id,
        projectId=body.projectId,
        taskId=body.taskId,
        status="PENDING",
        stage="initializing",
        log=[],
        updatedAt=now_iso()
    ))
    
    return result

@router.get("/deployments/{deployment_id}")
async def get_deployment(deployment_id: str, user: AuthUser = Depends(get_current_user)):
    """Get deployment details."""
    doc = db.collection("deployments").document(deployment_id).get()
    if not doc.exists:
        raise not_found("Deployment")
    
    deployment = doc.to_dict()
    
    # Verify project access
    project_doc = db.collection("projects").document(deployment.get("projectId")).get()
    if project_doc.exists:
        project = project_doc.to_dict()
        if not user.can_access_resource(project.get("ownerId")):
            raise not_found("Deployment")
    
    return {"id": doc.id, **deployment}

@router.get("/deployments")
async def list_deployments(projectId: str, user: AuthUser = Depends(get_current_user)):
    """List deployments for a project."""
    # Verify project access
    project_doc = db.collection("projects").document(projectId).get()
    if not project_doc.exists:
        raise not_found("Project")
    project = project_doc.to_dict()
    if not user.can_access_resource(project.get("ownerId")):
        raise not_found("Project")
    
    docs = db.collection("deployments").where("projectId", "==", projectId).order_by("createdAt", direction=firestore.Query.DESCENDING).limit(50).stream()
    return [{"id": d.id, **d.to_dict()} for d in docs]

@router.get("/status")
async def cicd_status():
    """Get CI/CD service status."""
    return {
        "status": "ok",
        "availableEnvironments": ["preview", "staging", "production"]
    }