from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from src.core.database import db
from src.core.errors import not_found
from src.core.utils import now_iso
from src.realtime import emitter
from src.realtime.events import DeploymentUpdatedPayload, CicdStageLog
from src.core.logger import logger
from src.auth.auth import AuthUser, get_current_user, log_action

import asyncio
import random

router = APIRouter()

STAGES = [
    {"name": "tests",  "fail_rate": 0.1,  "min_ms": 1500, "max_ms": 2500,
     "pass_detail": "All tests passed",
     "fail_detail": "2 tests failed — assertion error in handler_test.py",
     "logs": [
         "🔍 Discovering test files...",
         "📦 Installing test dependencies...",
         "🧪 Running pytest...",
         "✅ test_auth.py passed",
         "✅ test_projects.py passed",
         "✅ test_tasks.py passed",
     ]},
    {"name": "build",  "fail_rate": 0.05, "min_ms": 2000, "max_ms": 3500,
     "pass_detail": "Build succeeded — 0 errors, 0 warnings",
     "fail_detail": "TypeError: unsupported operand type(s) for +: 'int' and 'str'",
     "logs": [
         "🔧 Compiling source files...",
         "📦 Bundling dependencies...",
         "🗜 Optimizing assets...",
         "✅ Build completed successfully",
     ]},
    {"name": "deploy", "fail_rate": 0.0,  "min_ms": 800,  "max_ms": 1400,
     "pass_detail": "", "fail_detail": "",
     "logs": [
         "🚀 Preparing deployment package...",
         "📡 Connecting to platform...",
         "⬆ Uploading files...",
     ]},
]


def _deterministic_pass(seed: str, fail_rate: float) -> bool:
    h = 0
    for c in seed:
        h = (h * 31 + ord(c)) & 0xFFFFFFFF
    return (h % 100) >= int(fail_rate * 100)


def _stage_logs(log: list[dict]) -> list[CicdStageLog]:
    return [CicdStageLog(**e) for e in log]


async def run_cicd_pipeline(project_id: str, task_id: Optional[str], platform: Optional[str] = None) -> None:
    if not db.collection("projects").document(project_id).get().exists:
        raise not_found("Project")

    seed = f"{project_id}{task_id or ''}"
    platform_name = platform or "default"

    deploy_ref = db.collection("deployments").add({
        "projectId": project_id, "taskId": task_id,
        "platform": platform_name,
        "status": "RUNNING", "log": [],
        "createdAt": now_iso(), "updatedAt": now_iso(),
    })[1]
    deployment_id = deploy_ref.id
    log: list[dict] = []

    logger.info(f"CI/CD pipeline started: deployment={deployment_id} platform={platform_name}")
    await emitter.emit_cicd_log(project_id, deployment_id, "pipeline", f"🚀 Pipeline started for {platform_name.title()} deployment")

    for stage in STAGES:
        duration_ms = random.randint(stage["min_ms"], stage["max_ms"])
        step_delay = (duration_ms / 1000) / len(stage["logs"])

        log.append({"stage": stage["name"], "status": "running"})
        deploy_ref.update({"log": log, "updatedAt": now_iso()})
        await emitter.emit_deployment_updated(DeploymentUpdatedPayload(
            deploymentId=deployment_id, projectId=project_id, taskId=task_id,
            status="RUNNING", stage=stage["name"],
            log=_stage_logs(log), updatedAt=now_iso(),
        ))

        # Stream each log line with delay
        for line in stage["logs"]:
            await asyncio.sleep(step_delay)
            await emitter.emit_cicd_log(project_id, deployment_id, stage["name"], line)

        if stage["name"] == "deploy":
            if platform == "vercel":
                preview_url = f"https://adw-{deployment_id[-8:]}.vercel.app"
            elif platform == "github":
                preview_url = f"https://username.github.io/adw-{deployment_id[-8:]}"
            elif platform == "infinityfree":
                preview_url = f"http://adw-{deployment_id[-8:]}.rf.gd"
            else:
                preview_url = f"https://preview-{deployment_id[-8:]}.adw-deploy.example.com"

            await emitter.emit_cicd_log(project_id, deployment_id, stage["name"], f"✅ Deployed → {preview_url}")
            log[-1] = {"stage": "deploy", "status": "passed", "durationMs": duration_ms,
                       "detail": f"Deployed to {platform_name.title()} → {preview_url}"}
            deploy_ref.update({"status": "SUCCESS", "previewUrl": preview_url, "log": log, "updatedAt": now_iso()})
            await emitter.emit_deployment_updated(DeploymentUpdatedPayload(
                deploymentId=deployment_id, projectId=project_id, taskId=task_id,
                status="SUCCESS", previewUrl=preview_url,
                log=_stage_logs(log), updatedAt=now_iso(),
            ))
            await emitter.emit_cicd_log(project_id, deployment_id, "pipeline", "🎉 Pipeline completed successfully!")
            logger.info(f"CI/CD succeeded: deployment={deployment_id} preview={preview_url}")
            return

        passed = _deterministic_pass(seed + stage["name"], stage["fail_rate"])
        detail = stage["pass_detail"] if passed else stage["fail_detail"]
        log[-1] = {"stage": stage["name"], "status": "passed" if passed else "failed",
                   "durationMs": duration_ms, "detail": detail}
        deploy_ref.update({"log": log, "updatedAt": now_iso()})

        if not passed:
            await emitter.emit_cicd_log(project_id, deployment_id, stage["name"], f"❌ {detail}", level="error")
            await emitter.emit_cicd_log(project_id, deployment_id, "pipeline", f"💥 Pipeline failed at {stage['name']} stage", level="error")
            deploy_ref.update({"status": "FAILED", "errorMsg": detail, "updatedAt": now_iso()})
            await emitter.emit_deployment_updated(DeploymentUpdatedPayload(
                deploymentId=deployment_id, projectId=project_id, taskId=task_id,
                status="FAILED", errorMsg=detail,
                log=_stage_logs(log), updatedAt=now_iso(),
            ))
            logger.warning(f"CI/CD failed at {stage['name']}: deployment={deployment_id}")
            return

        await emitter.emit_cicd_log(project_id, deployment_id, stage["name"], f"✅ {detail}")
        await emitter.emit_deployment_updated(DeploymentUpdatedPayload(
            deploymentId=deployment_id, projectId=project_id, taskId=task_id,
            status="RUNNING", stage=stage["name"],
            log=_stage_logs(log), updatedAt=now_iso(),
        ))


class TriggerCicdRequest(BaseModel):
    projectId: str
    taskId: Optional[str] = None
    platform: Optional[str] = None


@router.post("/deploy")
async def trigger_cicd(body: TriggerCicdRequest, user: AuthUser = Depends(get_current_user)):
    project_doc = db.collection("projects").document(body.projectId).get()
    if not project_doc.exists:
        raise not_found("Project")

    project_data = project_doc.to_dict()
    if not user.can_access_resource(project_data.get("ownerId")):
        raise HTTPException(status_code=403, detail="Access denied")

    asyncio.create_task(run_cicd_pipeline(body.projectId, body.taskId, body.platform))
    await log_action(user, "CICD_TRIGGER", {"projectId": body.projectId, "taskId": body.taskId, "platform": body.platform or "default"})
    return {"message": f"CI/CD pipeline triggered for {body.platform or 'default'} deployment"}


@router.get("/deployments")
async def list_deployments(projectId: str, user: AuthUser = Depends(get_current_user)):
    project_doc = db.collection("projects").document(projectId).get()
    if not project_doc.exists:
        raise not_found("Project")

    if not user.can_access_resource(project_doc.to_dict().get("ownerId")):
        raise HTTPException(status_code=403, detail="Access denied")

    snap = (
        db.collection("deployments")
        .where("projectId", "==", projectId)
        .order_by("createdAt", direction="DESCENDING")
        .limit(50)
        .stream()
    )
    return [{"id": d.id, **d.to_dict()} for d in snap]


@router.get("/deployments/{deployment_id}")
async def get_deployment(deployment_id: str, user: AuthUser = Depends(get_current_user)):
    doc = db.collection("deployments").document(deployment_id).get()
    if not doc.exists:
        raise not_found("Deployment")

    deployment_data = doc.to_dict()
    project_id = deployment_data.get("projectId")
    if project_id:
        project_doc = db.collection("projects").document(project_id).get()
        if project_doc.exists and not user.can_access_resource(project_doc.to_dict().get("ownerId")):
            raise HTTPException(status_code=403, detail="Access denied")

    return {"id": doc.id, **deployment_data}
