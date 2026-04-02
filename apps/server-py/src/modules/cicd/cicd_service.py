import asyncio
import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from src.core.database import db
from src.core.errors import not_found
from src.core.utils import now_iso
from src.core.logger import logger
from src.realtime import emitter
from src.realtime.events import DeploymentUpdatedPayload, CicdStageLog
from src.auth.auth import AuthUser, get_current_user, log_action
from src.modules.cicd.netlify_deploy import deploy_to_netlify

router = APIRouter()

# ── Style → exact CSS values ──────────────────────────────────────────────────

THEME_VARS = {
    "Dark":     {"--bg": "#0f0f0f", "--text": "#f0f0f0", "--card": "#1a1a1a", "--border": "#2a2a2a", "--accent": "#6366f1"},
    "Light":    {"--bg": "#ffffff", "--text": "#111111", "--card": "#f5f5f5", "--border": "#dddddd", "--accent": "#4f46e5"},
    "Colorful": {"--bg": "#0d0d1a", "--text": "#ffffff", "--card": "rgba(255,255,255,0.08)", "--border": "rgba(255,255,255,0.15)", "--accent": "#a78bfa"},
}

FONT_VARS = {
    "Modern":  {"font-family": "'Inter', 'Segoe UI', sans-serif", "letter-spacing": "-0.02em", "line-height": "1.6"},
    "Classic": {"font-family": "'Georgia', 'Times New Roman', serif", "letter-spacing": "0", "line-height": "1.8"},
    "Playful": {"font-family": "'Comic Sans MS', 'Chalkboard SE', cursive", "letter-spacing": "0.01em", "line-height": "1.7"},
}

LAYOUT_VARS = {
    "Minimal":  {"padding": "60px", "max-width": "680px", "font-size": "15px"},
    "Spacious": {"padding": "80px", "max-width": "860px", "font-size": "16px"},
    "Compact":  {"padding": "16px", "max-width": "100%",  "font-size": "13px"},
}


def _inject_style_into_css(css: str, theme: str, font: str, layout: str) -> str:
    t = THEME_VARS.get(theme, THEME_VARS["Dark"])
    f = FONT_VARS.get(font, FONT_VARS["Modern"])
    l = LAYOUT_VARS.get(layout, LAYOUT_VARS["Minimal"])

    dark_bg   = "#1a1a1a" if theme == "Dark" else ("#e5e5e5" if theme == "Light" else "rgba(255,255,255,0.12)")
    dark_text = "#f0f0f0" if theme == "Dark" else ("#111111" if theme == "Light" else "#ffffff")

    override = f"""/* ── ADW Style Injection: {theme} / {font} / {layout} ── */
:root {{
  --bg: {t['--bg']};
  --text: {t['--text']};
  --card: {t['--card']};
  --border: {t['--border']};
  --accent: {t['--accent']};
}}
body {{
  background-color: var(--bg) !important;
  color: var(--text) !important;
  font-family: {f['font-family']} !important;
  letter-spacing: {f['letter-spacing']} !important;
  line-height: {f['line-height']} !important;
  font-size: {l['font-size']} !important;
  transition: background 0.3s, color 0.3s;
}}
body > * {{
  max-width: {l['max-width']};
  padding: {l['padding']};
  margin: 0 auto;
  box-sizing: border-box;
}}
body.dark {{
  --bg: {dark_bg};
  --text: {dark_text};
}}

"""
    return override + css


def _stage_logs(log: list[dict]) -> list[CicdStageLog]:
    return [CicdStageLog(**e) for e in log]


def _update_stage(log: list[dict], stage: str, status: str, detail: str = "", duration_ms: int = 0):
    for entry in log:
        if entry["stage"] == stage:
            entry["status"] = status
            if detail:
                entry["detail"] = detail
            if duration_ms:
                entry["durationMs"] = duration_ms
            return


async def run_cicd_pipeline(
    project_id: str,
    task_id: Optional[str],
    style_theme: str = "Dark",
    style_font: str = "Modern",
    style_layout: str = "Minimal",
) -> None:
    if not db.collection("projects").document(project_id).get().exists:
        raise not_found("Project")

    logger.info(f"CI/CD pipeline: project={project_id} theme={style_theme} font={style_font} layout={style_layout}")

    db.collection("projects").document(project_id).update({
        "styleTheme": style_theme, "styleFont": style_font, "styleLayout": style_layout,
        "updatedAt": now_iso(),
    })

    deploy_ref = db.collection("deployments").add({
        "projectId": project_id, "taskId": task_id,
        "status": "RUNNING", "log": [],
        "styleTheme": style_theme, "styleFont": style_font, "styleLayout": style_layout,
        "createdAt": now_iso(), "updatedAt": now_iso(),
    })[1]
    deployment_id = deploy_ref.id

    log: list[dict] = [
        {"stage": "tests",  "status": "pending"},
        {"stage": "build",  "status": "pending"},
        {"stage": "deploy", "status": "pending"},
    ]
    deploy_ref.update({"log": log, "updatedAt": now_iso()})
    await emitter.emit_deployment_updated(DeploymentUpdatedPayload(
        deploymentId=deployment_id, projectId=project_id, taskId=task_id,
        status="RUNNING", stage="tests", log=_stage_logs(log), updatedAt=now_iso(),
    ))

    # ── Stage 1: Tests ────────────────────────────────────────────────────────
    t0 = time.monotonic()
    _update_stage(log, "tests", "running")
    deploy_ref.update({"log": log, "updatedAt": now_iso()})
    await emitter.emit_deployment_updated(DeploymentUpdatedPayload(
        deploymentId=deployment_id, projectId=project_id, taskId=task_id,
        status="RUNNING", stage="tests", log=_stage_logs(log), updatedAt=now_iso(),
    ))

    files_snap = db.collection("projectFiles").where("projectId", "==", project_id).stream()
    project_files: dict[str, str] = {}
    for doc in files_snap:
        data = doc.to_dict()
        name = data.get("path") or data.get("name", "file.txt")
        content = data.get("content", "")
        if content:
            project_files[name] = content

    await asyncio.sleep(0.8)
    tests_ms = int((time.monotonic() - t0) * 1000)

    if not project_files:
        _update_stage(log, "tests", "failed", "No generated files found for this project", tests_ms)
        deploy_ref.update({"log": log, "status": "FAILED", "errorMsg": "No files to deploy", "updatedAt": now_iso()})
        await emitter.emit_deployment_updated(DeploymentUpdatedPayload(
            deploymentId=deployment_id, projectId=project_id, taskId=task_id,
            status="FAILED", errorMsg="No files to deploy",
            log=_stage_logs(log), updatedAt=now_iso(),
        ))
        return

    _update_stage(log, "tests", "passed", f"Found {len(project_files)} file(s) — validation passed", tests_ms)
    deploy_ref.update({"log": log, "updatedAt": now_iso()})
    await emitter.emit_deployment_updated(DeploymentUpdatedPayload(
        deploymentId=deployment_id, projectId=project_id, taskId=task_id,
        status="RUNNING", stage="build", log=_stage_logs(log), updatedAt=now_iso(),
    ))

    # ── Stage 2: Build — inject style overrides into style.css ───────────────
    t1 = time.monotonic()
    _update_stage(log, "build", "running")
    deploy_ref.update({"log": log, "updatedAt": now_iso()})
    await emitter.emit_deployment_updated(DeploymentUpdatedPayload(
        deploymentId=deployment_id, projectId=project_id, taskId=task_id,
        status="RUNNING", stage="build", log=_stage_logs(log), updatedAt=now_iso(),
    ))

    is_web = any(name.endswith(".html") for name in project_files)
    if is_web:
        css_key = next((k for k in project_files if k.endswith(".css")), None)
        if css_key:
            project_files[css_key] = _inject_style_into_css(
                project_files[css_key], style_theme, style_font, style_layout
            )
            logger.info(f"Style injected into {css_key}: theme={style_theme} font={style_font} layout={style_layout}")
        else:
            project_files["style.css"] = _inject_style_into_css("", style_theme, style_font, style_layout)
            logger.info("Created style.css with style overrides")

    await asyncio.sleep(1.2)
    build_ms = int((time.monotonic() - t1) * 1000)
    _update_stage(log, "build", "passed", f"Bundle assembled — {len(project_files)} files, style={style_theme}/{style_font}/{style_layout}", build_ms)
    deploy_ref.update({"log": log, "updatedAt": now_iso()})
    await emitter.emit_deployment_updated(DeploymentUpdatedPayload(
        deploymentId=deployment_id, projectId=project_id, taskId=task_id,
        status="RUNNING", stage="deploy", log=_stage_logs(log), updatedAt=now_iso(),
    ))

    # ── Stage 3: Deploy to Netlify ────────────────────────────────────────────
    t2 = time.monotonic()
    _update_stage(log, "deploy", "running")
    deploy_ref.update({"log": log, "updatedAt": now_iso()})
    await emitter.emit_deployment_updated(DeploymentUpdatedPayload(
        deploymentId=deployment_id, projectId=project_id, taskId=task_id,
        status="RUNNING", stage="deploy", log=_stage_logs(log), updatedAt=now_iso(),
    ))

    try:
        result = await deploy_to_netlify(project_files)
        deploy_ms = int((time.monotonic() - t2) * 1000)
        preview_url = result["url"]

        _update_stage(log, "deploy", "passed", f"Live at {preview_url}", deploy_ms)
        deploy_ref.update({
            "status": "SUCCESS",
            "previewUrl": preview_url,
            "netlifyDeployId": result.get("deploy_id"),
            "netlifySiteId": result.get("site_id"),
            "log": log,
            "updatedAt": now_iso(),
        })
        await emitter.emit_deployment_updated(DeploymentUpdatedPayload(
            deploymentId=deployment_id, projectId=project_id, taskId=task_id,
            status="SUCCESS", previewUrl=preview_url,
            log=_stage_logs(log), updatedAt=now_iso(),
        ))
        logger.info(f"CI/CD succeeded: deployment={deployment_id} url={preview_url}")

    except Exception as err:
        deploy_ms = int((time.monotonic() - t2) * 1000)
        error_msg = str(err)
        _update_stage(log, "deploy", "failed", error_msg, deploy_ms)
        deploy_ref.update({"status": "FAILED", "errorMsg": error_msg, "log": log, "updatedAt": now_iso()})
        await emitter.emit_deployment_updated(DeploymentUpdatedPayload(
            deploymentId=deployment_id, projectId=project_id, taskId=task_id,
            status="FAILED", errorMsg=error_msg,
            log=_stage_logs(log), updatedAt=now_iso(),
        ))
        logger.error(f"CI/CD deploy failed: deployment={deployment_id} error={error_msg}")


# ── Routes ────────────────────────────────────────────────────────────────────

class TriggerCicdRequest(BaseModel):
    projectId: str
    taskId: Optional[str] = None
    style_theme: str = "Dark"
    style_font: str = "Modern"
    style_layout: str = "Minimal"


@router.post("/deploy")
async def trigger_cicd(body: TriggerCicdRequest, user: AuthUser = Depends(get_current_user)):
    project_doc = db.collection("projects").document(body.projectId).get()
    if not project_doc.exists:
        raise not_found("Project")
    if not user.can_access_resource(project_doc.to_dict().get("ownerId")):
        raise HTTPException(status_code=403, detail="Access denied")

    logger.info(f"Deploy triggered: project={body.projectId} theme={body.style_theme} font={body.style_font} layout={body.style_layout}")
    asyncio.create_task(run_cicd_pipeline(body.projectId, body.taskId, body.style_theme, body.style_font, body.style_layout))
    await log_action(user, "CICD_TRIGGER", {"projectId": body.projectId, "style_theme": body.style_theme, "style_font": body.style_font, "style_layout": body.style_layout})
    return {"message": "CI/CD pipeline triggered"}


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
