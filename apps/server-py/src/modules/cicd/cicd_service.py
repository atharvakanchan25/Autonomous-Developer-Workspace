import asyncio
import random
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from src.lib.firestore import db
from src.lib.errors import not_found
from src.lib import emitter
from src.lib.socket_events import DeploymentUpdatedPayload, CicdStageLog
from src.lib.logger import logger
from src.lib.utils import now_iso

router = APIRouter()

STAGES = [
    {
        "name": "tests", "fail_rate": 0.1, "min_ms": 1500, "max_ms": 2500,
        "pass_detail": "All tests passed",
        "fail_detail": "2 tests failed — assertion error in handler_test.py",
    },
    {
        "name": "build", "fail_rate": 0.05, "min_ms": 2000, "max_ms": 3500,
        "pass_detail": "Build succeeded — 0 errors, 0 warnings",
        "fail_detail": "TypeError: unsupported operand type(s) for +: 'int' and 'str'",
    },
    {
        "name": "deploy", "fail_rate": 0.0, "min_ms": 800, "max_ms": 1400,
        "pass_detail": "", "fail_detail": "",
    },
]


def _deterministic_pass(seed: str, fail_rate: float) -> bool:
    h = 0
    for c in seed:
        h = (h * 31 + ord(c)) & 0xFFFFFFFF
    return (h % 100) >= int(fail_rate * 100)


def _stage_logs(log: list[dict]) -> list[CicdStageLog]:
    return [CicdStageLog(**e) for e in log]


async def run_cicd_pipeline(project_id: str, task_id: Optional[str]) -> None:
    if not db.collection("projects").document(project_id).get().exists:
        raise not_found("Project")

    seed = f"{project_id}{task_id or ''}"
    deploy_ref = db.collection("deployments").add({
        "projectId": project_id, "taskId": task_id,
        "status": "RUNNING", "log": [],
        "createdAt": now_iso(), "updatedAt": now_iso(),
    })[1]
    deployment_id = deploy_ref.id
    log: list[dict] = []

    logger.info(f"CI/CD pipeline started: deployment={deployment_id}")

    for stage in STAGES:
        duration_ms = random.randint(stage["min_ms"], stage["max_ms"])

        # mark stage as running
        log.append({"stage": stage["name"], "status": "running"})
        deploy_ref.update({"log": log, "updatedAt": now_iso()})
        await emitter.emit_deployment_updated(DeploymentUpdatedPayload(
            deploymentId=deployment_id, projectId=project_id, taskId=task_id,
            status="RUNNING", stage=stage["name"],
            log=_stage_logs(log), updatedAt=now_iso(),
        ))

        await asyncio.sleep(duration_ms / 1000)

        if stage["name"] == "deploy":
            preview_url = f"https://preview-{deployment_id[-8:]}.adw-deploy.example.com"
            log[-1] = {"stage": "deploy", "status": "passed", "durationMs": duration_ms,
                       "detail": f"Preview deployed to {preview_url}"}
            deploy_ref.update({"status": "SUCCESS", "previewUrl": preview_url, "log": log, "updatedAt": now_iso()})
            await emitter.emit_deployment_updated(DeploymentUpdatedPayload(
                deploymentId=deployment_id, projectId=project_id, taskId=task_id,
                status="SUCCESS", previewUrl=preview_url,
                log=_stage_logs(log), updatedAt=now_iso(),
            ))
            logger.info(f"CI/CD succeeded: deployment={deployment_id} preview={preview_url}")
            return

        passed = _deterministic_pass(seed + stage["name"], stage["fail_rate"])
        detail = stage["pass_detail"] if passed else stage["fail_detail"]
        log[-1] = {"stage": stage["name"], "status": "passed" if passed else "failed",
                   "durationMs": duration_ms, "detail": detail}
        deploy_ref.update({"log": log, "updatedAt": now_iso()})

        if not passed:
            deploy_ref.update({"status": "FAILED", "errorMsg": detail, "updatedAt": now_iso()})
            await emitter.emit_deployment_updated(DeploymentUpdatedPayload(
                deploymentId=deployment_id, projectId=project_id, taskId=task_id,
                status="FAILED", errorMsg=detail,
                log=_stage_logs(log), updatedAt=now_iso(),
            ))
            logger.warning(f"CI/CD failed at {stage['name']}: deployment={deployment_id}")
            return

        await emitter.emit_deployment_updated(DeploymentUpdatedPayload(
            deploymentId=deployment_id, projectId=project_id, taskId=task_id,
            status="RUNNING", stage=stage["name"],
            log=_stage_logs(log), updatedAt=now_iso(),
        ))


# ── Routes ────────────────────────────────────────────────────────────────────

class TriggerCicdRequest(BaseModel):
    projectId: str
    taskId: Optional[str] = None


@router.post("/deploy")
async def trigger_cicd(body: TriggerCicdRequest):
    if not db.collection("projects").document(body.projectId).get().exists:
        raise not_found("Project")
    asyncio.create_task(run_cicd_pipeline(body.projectId, body.taskId))
    return {"message": "CI/CD pipeline triggered"}


@router.get("/deployments")
def list_deployments(projectId: str):
    if not db.collection("projects").document(projectId).get().exists:
        raise not_found("Project")
    snap = (
        db.collection("deployments")
        .where("projectId", "==", projectId)
        .order_by("createdAt", direction="DESCENDING")
        .limit(50)
        .stream()
    )
    return [{"id": d.id, **d.to_dict()} for d in snap]


@router.get("/deployments/{deployment_id}")
def get_deployment(deployment_id: str):
    doc = db.collection("deployments").document(deployment_id).get()
    if not doc.exists:
        raise not_found("Deployment")
    return {"id": doc.id, **doc.to_dict()}
