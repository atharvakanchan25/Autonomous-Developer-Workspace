from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from firebase_admin import firestore
from backend.core.database import db
from backend.core.errors import not_found, bad_request
from backend.core.utils import now_iso
from backend.auth.auth import AuthUser, get_current_user
from backend.core.logger import logger
from backend.core.config import config
from backend.realtime.emitter import emit_deployment_updated
from backend.realtime.events import DeploymentUpdatedPayload, CicdStageLog
import httpx
import re
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
    
    docs = db.collection("deployments").where(filter=("projectId", "==", projectId)).order_by("createdAt", direction=firestore.Query.DESCENDING).limit(50).stream()
    return [{"id": d.id, **d.to_dict()} for d in docs]

@router.get("/status")
async def cicd_status():
    """Get CI/CD service status."""
    return {
        "status": "ok",
        "availableEnvironments": ["preview", "staging", "production"]
    }


class VercelDeployRequest(BaseModel):
    projectId: str
    projectName: Optional[str] = None


@router.post("/deploy/vercel")
async def deploy_to_vercel(body: VercelDeployRequest, user: AuthUser = Depends(get_current_user)):
    """Deploy the project's HTML/CSS/JS frontend to Vercel as a static site."""
    token = config.VERCEL_TOKEN
    if not token:
        raise bad_request("VERCEL_TOKEN is not configured in the backend .env")

    project_doc = db.collection("projects").document(body.projectId).get()
    if not project_doc.exists:
        raise not_found("Project")
    project = project_doc.to_dict()
    if not user.can_access_resource(project.get("ownerId")):
        raise not_found("Project")

    # Fetch only HTML/CSS/JS files for this project
    file_docs = list(
        db.collection("files")
        .where(filter=("projectId", "==", body.projectId))
        .stream()
    )

    ALLOWED_EXTENSIONS = {".html", ".css", ".js"}
    ALLOWED_LANGUAGES = {"html", "css", "javascript", "js"}

    seen_paths: set[str] = set()
    vercel_files = []
    for f in file_docs:
        data = f.to_dict()
        path = data.get("path", data.get("name", ""))
        filename = path.split("/")[-1] if "/" in path else path
        ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        language = data.get("language", "").lower()
        if ext not in ALLOWED_EXTENSIONS and language not in ALLOWED_LANGUAGES:
            continue
        if filename in seen_paths:
            continue
        seen_paths.add(filename)
        content = data.get("content", "")
        content = content.encode("utf-8", errors="ignore").decode("utf-8").replace("\x00", "")
        vercel_files.append({"file": filename, "data": content})

    if not vercel_files:
        raise bad_request("No HTML/CSS/JS files found for this project. Run the pipeline first.")

    project_name = body.projectName or re.sub(r"[^a-z0-9-]", "-", project.get("name", "project").lower()).strip("-")

    payload = {
        "name": project_name,
        "files": vercel_files,
        "target": "production",
        "builds": [{"src": "*.html", "use": "@vercel/static"}],
        "projectSettings": {"framework": None},
    }

    logger.info(f"Sending {len(vercel_files)} files to Vercel")
    for vf in vercel_files:
        logger.info(f"File: {vf['file']}, content length: {len(vf.get('data', ''))}, first 100 chars: {vf.get('data', '')[:100]!r}")

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            "https://api.vercel.com/v13/deployments",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json=payload,
        )

    if resp.status_code not in (200, 201):
        error_body = resp.json()
        logger.error(f"Vercel API error {resp.status_code}: {error_body}")
        detail = error_body.get("error", {}).get("message", resp.text)
        raise bad_request(f"Vercel deployment failed: {detail}")

    data = resp.json()
    deployment_url = f"https://{data.get('url', '')}"

    # Persist deployment record
    deployment_data = {
        "projectId": body.projectId,
        "environment": "production",
        "status": "SUCCESS",
        "stage": "deployed",
        "platform": "vercel",
        "previewUrl": deployment_url,
        "log": [{"message": f"Deployed {len(vercel_files)} file(s) to Vercel", "level": "info", "timestamp": now_iso()}],
        "triggeredBy": user.email,
        "createdAt": now_iso(),
        "updatedAt": now_iso(),
    }
    _, ref = db.collection("deployments").add(deployment_data)
    logger.info(f"Vercel deployment succeeded: {deployment_url} for project {body.projectId}")

    return {"success": True, "deploymentId": ref.id, "url": deployment_url, "message": "Deployed to Vercel successfully"}