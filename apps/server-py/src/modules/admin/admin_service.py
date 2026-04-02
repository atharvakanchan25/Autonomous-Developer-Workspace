"""
Admin endpoints — user management, audit logs, token usage, alerts, system stats.
All endpoints require admin role unless noted.
"""
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from firebase_admin import auth as firebase_auth

from src.auth.auth import AuthUser, get_current_user, require_role, log_action
from src.core.errors import not_found
from src.core.database import db
from src.core.utils import now_iso
from src.core.logger import logger

router = APIRouter()

TOKEN_LIMIT_PER_USER = 500_000


# ── Models ────────────────────────────────────────────────────────────────────

class SetRoleRequest(BaseModel):
    role: Literal["user", "admin"]

class AlertRequest(BaseModel):
    message: str
    type: Literal["info", "warning", "error"] = "info"
    targetUid: Optional[str] = None   # None = broadcast to all users

class TokenLimitRequest(BaseModel):
    limit: int


# ── Current user (no admin required) ─────────────────────────────────────────

@router.get("/users/me")
def get_me(user: AuthUser = Depends(get_current_user)):
    return {"uid": user.uid, "email": user.email, "role": user.role}


# ── System stats ──────────────────────────────────────────────────────────────

@router.get("/stats")
def get_system_stats(admin: AuthUser = Depends(require_role("admin"))):
    """High-level system stats for the dashboard."""
    try:
        user_count = len(list(db.collection("users").stream()))
        project_count = len(list(db.collection("projects").stream()))
        task_count = len(list(db.collection("tasks").stream()))
        agent_runs = list(db.collection("agentRuns").stream())
        deployments = list(db.collection("deployments").stream())
        audit_logs = list(db.collection("audit_logs").stream())

        completed_runs = sum(1 for r in agent_runs if r.to_dict().get("status") == "COMPLETED")
        failed_runs = sum(1 for r in agent_runs if r.to_dict().get("status") == "FAILED")
        successful_deploys = sum(1 for d in deployments if d.to_dict().get("status") == "SUCCESS")
        failed_deploys = sum(1 for d in deployments if d.to_dict().get("status") == "FAILED")

        total_tokens = 0
        for d in db.collection("agentRuns").stream():
            total_tokens += d.to_dict().get("tokensUsed", 0) or 0
        for d in db.collection("aiPlanLogs").stream():
            total_tokens += d.to_dict().get("tokensUsed", 0) or 0

        return {
            "users": user_count,
            "projects": project_count,
            "tasks": task_count,
            "agentRuns": len(agent_runs),
            "completedRuns": completed_runs,
            "failedRuns": failed_runs,
            "deployments": len(deployments),
            "successfulDeploys": successful_deploys,
            "failedDeploys": failed_deploys,
            "auditLogs": len(audit_logs),
            "totalTokensUsed": total_tokens,
        }
    except Exception as e:
        logger.error(f"Failed to fetch system stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch stats")


# ── Token usage ───────────────────────────────────────────────────────────────

@router.get("/token-usage")
def get_token_usage(admin: AuthUser = Depends(require_role("admin"))):
    try:
        users_map: dict[str, dict] = {}
        for d in db.collection("users").stream():
            data = d.to_dict()
            uid = data.get("uid") or d.id
            users_map[uid] = {
                "email": data.get("email", ""),
                "role": data.get("role", "user"),
                "tokenLimit": data.get("tokenLimit", TOKEN_LIMIT_PER_USER),
            }

        stats: dict[str, dict] = {}

        def _ensure(uid: str):
            if uid not in stats:
                info = users_map.get(uid, {"email": uid, "role": "user", "tokenLimit": TOKEN_LIMIT_PER_USER})
                stats[uid] = {
                    "uid": uid, "email": info["email"], "role": info["role"],
                    "totalTokens": 0, "callCount": 0, "lastCallAt": None,
                    "limit": info["tokenLimit"],
                }

        for d in db.collection("agentRuns").stream():
            data = d.to_dict()
            tokens = data.get("tokensUsed", 0) or 0
            if tokens == 0:
                continue
            task_doc = db.collection("tasks").document(data.get("taskId", "")).get()
            uid = task_doc.to_dict().get("ownerId", "") if task_doc.exists else ""
            if not uid:
                continue
            _ensure(uid)
            stats[uid]["totalTokens"] += tokens
            stats[uid]["callCount"] += 1
            created = data.get("createdAt")
            if created and (not stats[uid]["lastCallAt"] or created > stats[uid]["lastCallAt"]):
                stats[uid]["lastCallAt"] = created

        for d in db.collection("aiPlanLogs").stream():
            data = d.to_dict()
            tokens = data.get("tokensUsed", 0) or 0
            uid = data.get("userId", "")
            if not uid:
                continue
            _ensure(uid)
            stats[uid]["totalTokens"] += tokens
            stats[uid]["callCount"] += 1
            created = data.get("createdAt")
            if created and (not stats[uid]["lastCallAt"] or created > stats[uid]["lastCallAt"]):
                stats[uid]["lastCallAt"] = created

        result = []
        for uid, s in stats.items():
            lim = s["limit"]
            remaining = max(0, lim - s["totalTokens"])
            result.append({
                **s,
                "remaining": remaining,
                "limitExceeded": s["totalTokens"] > lim,
            })

        result.sort(key=lambda x: x["totalTokens"], reverse=True)
        return result
    except Exception as e:
        logger.error(f"Failed to fetch token usage: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch token usage")


@router.get("/token-usage/{uid}")
def get_user_token_calls(uid: str, limit: int = 100, admin: AuthUser = Depends(require_role("admin"))):
    calls = []
    for d in db.collection("agentRuns").stream():
        data = d.to_dict()
        task_doc = db.collection("tasks").document(data.get("taskId", "")).get()
        if not task_doc.exists or task_doc.to_dict().get("ownerId", "") != uid:
            continue
        calls.append({
            "id": d.id, "source": "agent",
            "agentType": data.get("agentType", ""),
            "prompt": data.get("prompt", "")[:200],
            "tokensUsed": data.get("tokensUsed", 0) or 0,
            "status": data.get("status", ""),
            "durationMs": data.get("durationMs", 0),
            "createdAt": data.get("createdAt", ""),
        })
    for d in db.collection("aiPlanLogs").where("userId", "==", uid).stream():
        data = d.to_dict()
        calls.append({
            "id": d.id, "source": "plan", "agentType": "PLAN_GENERATOR",
            "prompt": data.get("prompt", "")[:200],
            "tokensUsed": data.get("tokensUsed", 0) or 0,
            "status": "COMPLETED",
            "durationMs": 0,
            "createdAt": data.get("createdAt", ""),
        })
    calls.sort(key=lambda x: x["createdAt"], reverse=True)
    return calls[:limit]


@router.patch("/users/{uid}/token-limit")
async def set_token_limit(uid: str, body: TokenLimitRequest, admin: AuthUser = Depends(require_role("admin"))):
    """Override the token limit for a specific user."""
    doc = db.collection("users").document(uid).get()
    if not doc.exists:
        raise not_found("User")
    db.collection("users").document(uid).update({"tokenLimit": body.limit, "updatedAt": now_iso()})
    await log_action(admin, "TOKEN_LIMIT_SET", {"targetUser": uid, "limit": body.limit})
    return {"uid": uid, "tokenLimit": body.limit}


# ── User management ───────────────────────────────────────────────────────────

@router.get("/users")
def list_users(admin: AuthUser = Depends(require_role("admin"))):
    try:
        result = []
        for d in db.collection("users").stream():
            data = d.to_dict()
            uid = data.get("uid") or d.id
            project_count = len(list(db.collection("projects").where("ownerId", "==", uid).stream()))
            result.append({
                "id": d.id,
                "uid": uid,
                "email": data.get("email", ""),
                "role": data.get("role", "user"),
                "createdAt": data.get("createdAt", ""),
                "projectCount": project_count,
            })
        return result
    except Exception as e:
        logger.error(f"Failed to list users: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch users")


@router.patch("/users/{uid}/role")
async def update_user_role(uid: str, body: SetRoleRequest, admin: AuthUser = Depends(require_role("admin"))):
    doc = db.collection("users").document(uid).get()
    if not doc.exists:
        raise not_found("User")
    db.collection("users").document(uid).update({"role": body.role, "updatedAt": now_iso()})
    await log_action(admin, "ROLE_CHANGE", {"targetUser": uid, "newRole": body.role})
    logger.info(f"Role updated: uid={uid} role={body.role} by {admin.email}")
    return {"uid": uid, "role": body.role}


@router.delete("/users/{uid}", status_code=204)
async def delete_user(uid: str, admin: AuthUser = Depends(require_role("admin"))):
    """Delete user + all their projects, tasks, files, agent runs, deployments."""
    doc = db.collection("users").document(uid).get()
    if not doc.exists:
        raise not_found("User")

    # Delete all projects and their children
    for p in db.collection("projects").where("ownerId", "==", uid).stream():
        _delete_project_cascade(p.id)

    # Delete audit logs for this user
    for log in db.collection("audit_logs").where("userId", "==", uid).stream():
        log.reference.delete()

    # Delete alerts sent to this user
    for alert in db.collection("alerts").where("targetUid", "==", uid).stream():
        alert.reference.delete()

    db.collection("users").document(uid).delete()
    await log_action(admin, "USER_DELETE", {"targetUser": uid})
    logger.info(f"User deleted: uid={uid} by {admin.email}")


def _delete_project_cascade(project_id: str):
    """Delete project + tasks + files + agent runs + deployments."""
    for task in db.collection("tasks").where("projectId", "==", project_id).stream():
        for run in db.collection("agentRuns").where("taskId", "==", task.id).stream():
            run.reference.delete()
        task.reference.delete()
    for f in db.collection("projectFiles").where("projectId", "==", project_id).stream():
        for v in db.collection("fileVersions").where("fileId", "==", f.id).stream():
            v.reference.delete()
        f.reference.delete()
    for dep in db.collection("deployments").where("projectId", "==", project_id).stream():
        dep.reference.delete()
    db.collection("projects").document(project_id).delete()


@router.get("/users/{uid}/activity")
def get_user_activity(uid: str, limit: int = 100, admin: AuthUser = Depends(require_role("admin"))):
    doc = db.collection("users").document(uid).get()
    if not doc.exists:
        raise not_found("User")
    user_data = doc.to_dict()

    logs = list(
        db.collection("audit_logs")
        .where("userId", "==", uid)
        .order_by("createdAt", direction="DESCENDING")
        .limit(limit)
        .stream()
    )

    agent_runs = list(db.collection("agentRuns").stream())
    user_runs = []
    for r in agent_runs:
        data = r.to_dict()
        task_doc = db.collection("tasks").document(data.get("taskId", "")).get()
        if task_doc.exists and task_doc.to_dict().get("ownerId") == uid:
            user_runs.append(data)

    total_tokens = sum(r.get("tokensUsed", 0) or 0 for r in user_runs)

    return {
        "uid": uid,
        "email": user_data.get("email", ""),
        "role": user_data.get("role", "user"),
        "createdAt": user_data.get("createdAt", ""),
        "stats": {
            "projectCount": len(list(db.collection("projects").where("ownerId", "==", uid).stream())),
            "taskCount": len(list(db.collection("tasks").where("ownerId", "==", uid).stream())),
            "actionCount": len(logs),
            "agentRuns": len(user_runs),
            "totalTokens": total_tokens,
        },
        "activity": [
            {"id": d.id, "action": d.to_dict().get("action", ""),
             "meta": d.to_dict().get("meta", {}), "createdAt": d.to_dict().get("createdAt", "")}
            for d in logs
        ],
    }


@router.get("/users/{uid}/projects")
def get_user_projects(uid: str, admin: AuthUser = Depends(require_role("admin"))):
    doc = db.collection("users").document(uid).get()
    if not doc.exists:
        raise not_found("User")
    result = []
    for p in db.collection("projects").where("ownerId", "==", uid).order_by("createdAt", direction="DESCENDING").stream():
        data = p.to_dict()
        tasks = list(db.collection("tasks").where("projectId", "==", p.id).stream())
        completed = sum(1 for t in tasks if t.to_dict().get("status") == "COMPLETED")
        result.append({
            "id": p.id,
            "name": data.get("name", ""),
            "description": data.get("description", ""),
            "language": data.get("language", ""),
            "createdAt": data.get("createdAt", ""),
            "updatedAt": data.get("updatedAt", ""),
            "taskCount": len(tasks),
            "completedTasks": completed,
        })
    return result


@router.delete("/users/{uid}/projects/{project_id}", status_code=204)
async def delete_user_project(uid: str, project_id: str, admin: AuthUser = Depends(require_role("admin"))):
    """Delete a specific project belonging to a user."""
    doc = db.collection("projects").document(project_id).get()
    if not doc.exists:
        raise not_found("Project")
    _delete_project_cascade(project_id)
    await log_action(admin, "PROJECT_DELETE", {"projectId": project_id, "targetUser": uid})


# ── All projects (admin view) ─────────────────────────────────────────────────

@router.get("/projects")
def get_all_projects(admin: AuthUser = Depends(require_role("admin"))):
    try:
        users_map: dict[str, str] = {}
        for d in db.collection("users").stream():
            data = d.to_dict()
            uid = data.get("uid") or d.id
            users_map[uid] = data.get("email", uid)

        result = []
        for p in db.collection("projects").order_by("createdAt", direction="DESCENDING").stream():
            data = p.to_dict()
            owner_uid = data.get("ownerId", "")
            tasks = list(db.collection("tasks").where("projectId", "==", p.id).stream())
            completed = sum(1 for t in tasks if t.to_dict().get("status") == "COMPLETED")
            result.append({
                "id": p.id,
                "name": data.get("name", ""),
                "description": data.get("description", ""),
                "language": data.get("language", ""),
                "ownerId": owner_uid,
                "ownerEmail": users_map.get(owner_uid, owner_uid),
                "createdAt": data.get("createdAt", ""),
                "taskCount": len(tasks),
                "completedTasks": completed,
            })
        return result
    except Exception as e:
        logger.error(f"Failed to fetch all projects: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch projects")


@router.delete("/projects/{project_id}", status_code=204)
async def delete_project(project_id: str, admin: AuthUser = Depends(require_role("admin"))):
    """Delete any project and all its children."""
    doc = db.collection("projects").document(project_id).get()
    if not doc.exists:
        raise not_found("Project")
    _delete_project_cascade(project_id)
    await log_action(admin, "PROJECT_DELETE", {"projectId": project_id})


# ── Audit logs ────────────────────────────────────────────────────────────────

@router.get("/audit-logs")
def get_audit_logs(limit: int = 200, userId: Optional[str] = None, admin: AuthUser = Depends(require_role("admin"))):
    try:
        query = db.collection("audit_logs").order_by("createdAt", direction="DESCENDING")
        if userId:
            query = query.where("userId", "==", userId)
        return [
            {
                "id": d.id,
                "userId": d.to_dict().get("userId", ""),
                "email": d.to_dict().get("email", ""),
                "role": d.to_dict().get("role", "user"),
                "action": d.to_dict().get("action", ""),
                "meta": d.to_dict().get("meta", {}),
                "createdAt": d.to_dict().get("createdAt", ""),
            }
            for d in query.limit(limit).stream()
        ]
    except Exception as e:
        logger.error(f"Failed to fetch audit logs: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch audit logs")


# ── Alerts ────────────────────────────────────────────────────────────────────

@router.post("/alerts", status_code=201)
async def send_alert(body: AlertRequest, admin: AuthUser = Depends(require_role("admin"))):
    """Send an alert message to a specific user or broadcast to all users."""
    now = now_iso()
    ref = db.collection("alerts").add({
        "message": body.message,
        "type": body.type,
        "targetUid": body.targetUid,   # None = broadcast
        "sentBy": admin.uid,
        "sentByEmail": admin.email,
        "createdAt": now,
        "read": False,
    })[1]
    await log_action(admin, "ALERT_SENT", {
        "alertId": ref.id,
        "targetUid": body.targetUid or "ALL",
        "type": body.type,
    })
    return {"id": ref.id, "message": body.message, "type": body.type, "createdAt": now}


@router.get("/alerts")
def list_alerts(admin: AuthUser = Depends(require_role("admin"))):
    """List all sent alerts."""
    alerts = db.collection("alerts").order_by("createdAt", direction="DESCENDING").limit(100).stream()
    return [{"id": d.id, **d.to_dict()} for d in alerts]


@router.delete("/alerts/{alert_id}", status_code=204)
async def delete_alert(alert_id: str, admin: AuthUser = Depends(require_role("admin"))):
    doc = db.collection("alerts").document(alert_id).get()
    if not doc.exists:
        raise not_found("Alert")
    doc.reference.delete()


# ── User alerts (called by frontend for logged-in user) ──────────────────────

@router.get("/my-alerts")
def get_my_alerts(user: AuthUser = Depends(get_current_user)):
    """Get alerts for the current user (broadcast + targeted)."""
    result = []
    for d in db.collection("alerts").where("targetUid", "==", None).stream():
        result.append({"id": d.id, **d.to_dict()})
    for d in db.collection("alerts").where("targetUid", "==", user.uid).stream():
        result.append({"id": d.id, **d.to_dict()})
    result.sort(key=lambda x: x.get("createdAt", ""), reverse=True)
    return result[:20]


# ── My token usage (any authenticated user) ───────────────────────────────────

@router.get("/my-token-usage")
def get_my_token_usage(user: AuthUser = Depends(get_current_user)):
    """Return token usage stats for the currently logged-in user."""
    user_doc = db.collection("users").document(user.uid).get()
    token_limit = TOKEN_LIMIT_PER_USER
    if user_doc.exists:
        token_limit = user_doc.to_dict().get("tokenLimit", TOKEN_LIMIT_PER_USER)

    total_tokens = 0
    call_count = 0
    last_call_at = None

    for d in db.collection("agentRuns").stream():
        data = d.to_dict()
        tokens = data.get("tokensUsed", 0) or 0
        if tokens == 0:
            continue
        task_doc = db.collection("tasks").document(data.get("taskId", "")).get()
        if not task_doc.exists or task_doc.to_dict().get("ownerId") != user.uid:
            continue
        total_tokens += tokens
        call_count += 1
        created = data.get("createdAt")
        if created and (not last_call_at or created > last_call_at):
            last_call_at = created

    for d in db.collection("aiPlanLogs").where("userId", "==", user.uid).stream():
        data = d.to_dict()
        tokens = data.get("tokensUsed", 0) or 0
        if tokens == 0:
            continue
        total_tokens += tokens
        call_count += 1
        created = data.get("createdAt")
        if created and (not last_call_at or created > last_call_at):
            last_call_at = created

    remaining = max(0, token_limit - total_tokens)
    return {
        "uid": user.uid,
        "email": user.email,
        "role": user.role,
        "totalTokens": total_tokens,
        "callCount": call_count,
        "lastCallAt": last_call_at,
        "limit": token_limit,
        "remaining": remaining,
        "limitExceeded": total_tokens > token_limit,
    }


# ── Self account deletion (any authenticated user) ────────────────────────────

@router.delete("/me", status_code=204)
async def delete_my_account(user: AuthUser = Depends(get_current_user)):
    """Allow a user to delete their own account and all their data."""
    for p in db.collection("projects").where("ownerId", "==", user.uid).stream():
        _delete_project_cascade(p.id)
    for log_doc in db.collection("audit_logs").where("userId", "==", user.uid).stream():
        log_doc.reference.delete()
    for alert in db.collection("alerts").where("targetUid", "==", user.uid).stream():
        alert.reference.delete()
    db.collection("users").document(user.uid).delete()
    try:
        firebase_auth.delete_user(user.uid)
    except Exception as e:
        logger.warning(f"Could not delete Firebase Auth user {user.uid}: {e}")
    logger.info(f"User self-deleted: {user.email}")
