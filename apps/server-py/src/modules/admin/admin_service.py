"""
Admin endpoints for user management, audit logs, and token usage.
All endpoints require admin role unless noted.
"""
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from src.auth.auth import AuthUser, get_current_user, require_role, log_action
from src.core.errors import not_found
from src.core.database import db
from src.core.utils import now_iso
from src.core.logger import logger

router = APIRouter()

TOKEN_LIMIT_PER_USER = 500_000


class SetRoleRequest(BaseModel):
    role: Literal["user", "admin"]


# ── Current user ──────────────────────────────────────────────────────────────

@router.get("/users/me")
def get_me(user: AuthUser = Depends(get_current_user)):
    """Get current user's profile and role."""
    return {"uid": user.uid, "email": user.email, "role": user.role}


# ── Token usage ───────────────────────────────────────────────────────────────

@router.get("/token-usage")
def get_token_usage(admin: AuthUser = Depends(require_role("admin"))):
    """Aggregate token usage per user across agent runs and AI plan calls."""
    try:
        users_map: dict[str, dict] = {}
        for d in db.collection("users").stream():
            data = d.to_dict()
            uid = data.get("uid") or d.id
            users_map[uid] = {"email": data.get("email", ""), "role": data.get("role", "user")}

        stats: dict[str, dict] = {}

        def _ensure(uid: str):
            if uid not in stats:
                info = users_map.get(uid, {"email": uid, "role": "user"})
                stats[uid] = {
                    "uid": uid, "email": info["email"], "role": info["role"],
                    "totalTokens": 0, "callCount": 0, "lastCallAt": None,
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
            remaining = max(0, TOKEN_LIMIT_PER_USER - s["totalTokens"])
            result.append({
                **s,
                "limit": TOKEN_LIMIT_PER_USER,
                "remaining": remaining,
                "limitExceeded": s["totalTokens"] > TOKEN_LIMIT_PER_USER,
            })

        result.sort(key=lambda x: x["totalTokens"], reverse=True)
        return result
    except Exception as e:
        logger.error(f"Failed to fetch token usage: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch token usage")


@router.get("/token-usage/{uid}")
def get_user_token_calls(uid: str, limit: int = 50, admin: AuthUser = Depends(require_role("admin"))):
    """Get individual API calls with token counts for a specific user."""
    calls = []

    for d in db.collection("agentRuns").stream():
        data = d.to_dict()
        task_doc = db.collection("tasks").document(data.get("taskId", "")).get()
        if not task_doc.exists:
            continue
        if task_doc.to_dict().get("ownerId", "") != uid:
            continue
        calls.append({
            "id": d.id, "source": "agent",
            "agentType": data.get("agentType", ""),
            "prompt": data.get("prompt", ""),
            "tokensUsed": data.get("tokensUsed", 0) or 0,
            "status": data.get("status", ""),
            "createdAt": data.get("createdAt", ""),
        })

    for d in db.collection("aiPlanLogs").where("userId", "==", uid).stream():
        data = d.to_dict()
        calls.append({
            "id": d.id, "source": "plan", "agentType": "PLAN_GENERATOR",
            "prompt": data.get("prompt", ""),
            "tokensUsed": data.get("tokensUsed", 0) or 0,
            "status": "COMPLETED",
            "createdAt": data.get("createdAt", ""),
        })

    calls.sort(key=lambda x: x["createdAt"], reverse=True)
    return calls[:limit]


# ── User management ───────────────────────────────────────────────────────────

@router.get("/users")
def list_users(admin: AuthUser = Depends(require_role("admin"))):
    """List all users in the system."""
    try:
        return [
            {
                "id": d.id,
                "uid": d.to_dict().get("uid", ""),
                "email": d.to_dict().get("email", ""),
                "role": d.to_dict().get("role", "user"),
                "createdAt": d.to_dict().get("createdAt", ""),
            }
            for d in db.collection("users").stream()
        ]
    except Exception as e:
        logger.error(f"Failed to list users: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch users")


@router.patch("/users/{uid}/role")
async def update_user_role(uid: str, body: SetRoleRequest, admin: AuthUser = Depends(require_role("admin"))):
    """Change a user's role."""
    doc = db.collection("users").document(uid).get()
    if not doc.exists:
        raise not_found("User")

    db.collection("users").document(uid).update({"role": body.role, "updatedAt": now_iso()})
    await log_action(admin, "ROLE_CHANGE", {"targetUser": uid, "newRole": body.role})
    return {"uid": uid, "role": body.role}


@router.delete("/users/{uid}", status_code=204)
async def delete_user(uid: str, admin: AuthUser = Depends(require_role("admin"))):
    """Delete a user from the system."""
    doc = db.collection("users").document(uid).get()
    if not doc.exists:
        raise not_found("User")

    db.collection("users").document(uid).delete()
    await log_action(admin, "USER_DELETE", {"targetUser": uid})


@router.get("/users/{uid}/activity")
def get_user_activity(uid: str, limit: int = 50, admin: AuthUser = Depends(require_role("admin"))):
    """Get full activity history for a specific user."""
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

    return {
        "uid": uid,
        "email": user_data.get("email", ""),
        "role": user_data.get("role", "user"),
        "createdAt": user_data.get("createdAt", ""),
        "stats": {
            "projectCount": len(list(db.collection("projects").where("ownerId", "==", uid).stream())),
            "taskCount": len(list(db.collection("tasks").where("ownerId", "==", uid).stream())),
            "actionCount": len(logs),
        },
        "activity": [
            {"id": d.id, "action": d.to_dict().get("action", ""),
             "meta": d.to_dict().get("meta", {}), "createdAt": d.to_dict().get("createdAt", "")}
            for d in logs
        ],
    }


@router.get("/users/{uid}/projects")
def get_user_projects(uid: str, admin: AuthUser = Depends(require_role("admin"))):
    """Get all projects owned by a specific user, including task counts."""
    doc = db.collection("users").document(uid).get()
    if not doc.exists:
        raise not_found("User")

    projects = db.collection("projects").where("ownerId", "==", uid).order_by("createdAt", direction="DESCENDING").stream()
    result = []
    for p in projects:
        data = p.to_dict()
        task_count = len(list(db.collection("tasks").where("projectId", "==", p.id).stream()))
        result.append({
            "id": p.id,
            "name": data.get("name", ""),
            "description": data.get("description", ""),
            "createdAt": data.get("createdAt", ""),
            "updatedAt": data.get("updatedAt", ""),
            "taskCount": task_count,
        })
    return result


# ── All projects (admin view) ────────────────────────────────────────────────

@router.get("/projects")
def get_all_projects(admin: AuthUser = Depends(require_role("admin"))):
    """Return every project in the system with owner info and task count."""
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
            task_count = len(list(db.collection("tasks").where("projectId", "==", p.id).stream()))
            result.append({
                "id": p.id,
                "name": data.get("name", ""),
                "description": data.get("description", ""),
                "ownerId": owner_uid,
                "ownerEmail": users_map.get(owner_uid, owner_uid),
                "createdAt": data.get("createdAt", ""),
                "taskCount": task_count,
            })
        return result
    except Exception as e:
        logger.error(f"Failed to fetch all projects: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch projects")


# ── Audit logs ────────────────────────────────────────────────────────────────

@router.get("/audit-logs")
def get_audit_logs(limit: int = 100, userId: Optional[str] = None, admin: AuthUser = Depends(require_role("admin"))):
    """View audit trail of all user actions."""
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


# ── Platform stats ────────────────────────────────────────────────────────────

@router.get("/stats")
def get_platform_stats(admin: AuthUser = Depends(require_role("admin"))):
    """Aggregate platform-wide stats for the admin dashboard."""
    try:
        all_users = list(db.collection("users").stream())
        all_projects = list(db.collection("projects").stream())
        all_tasks = list(db.collection("tasks").stream())
        all_agent_runs = list(db.collection("agentRuns").stream())
        all_audit = list(db.collection("audit_logs").stream())

        total_tokens = sum(
            (d.to_dict().get("tokensUsed", 0) or 0)
            for d in db.collection("agentRuns").stream()
        ) + sum(
            (d.to_dict().get("tokensUsed", 0) or 0)
            for d in db.collection("aiPlanLogs").stream()
        )

        admin_count = sum(1 for d in all_users if d.to_dict().get("role") == "admin")
        completed_tasks = sum(1 for d in all_tasks if d.to_dict().get("status") == "COMPLETED")
        failed_runs = sum(1 for d in all_agent_runs if d.to_dict().get("status") == "FAILED")
        completed_runs = sum(1 for d in all_agent_runs if d.to_dict().get("status") == "COMPLETED")

        return {
            "users": {"total": len(all_users), "admins": admin_count, "regular": len(all_users) - admin_count},
            "projects": {"total": len(all_projects)},
            "tasks": {"total": len(all_tasks), "completed": completed_tasks},
            "agentRuns": {"total": len(all_agent_runs), "completed": completed_runs, "failed": failed_runs},
            "auditLogs": {"total": len(all_audit)},
            "tokens": {"total": total_tokens},
        }
    except Exception as e:
        logger.error(f"Failed to fetch platform stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch stats")


# ── Suspend / unsuspend user ──────────────────────────────────────────────────

class SuspendRequest(BaseModel):
    suspended: bool


@router.patch("/users/{uid}/suspend")
async def suspend_user(uid: str, body: SuspendRequest, admin: AuthUser = Depends(require_role("admin"))):
    """Suspend or unsuspend a user account."""
    doc = db.collection("users").document(uid).get()
    if not doc.exists:
        raise not_found("User")
    db.collection("users").document(uid).update({"suspended": body.suspended, "updatedAt": now_iso()})
    action = "USER_SUSPEND" if body.suspended else "USER_UNSUSPEND"
    await log_action(admin, action, {"targetUser": uid})
    return {"uid": uid, "suspended": body.suspended}


# ── System health ─────────────────────────────────────────────────────────────

@router.get("/system-health")
def get_system_health(admin: AuthUser = Depends(require_role("admin"))):
    """Check system health including database and queue status."""
    try:
        from src.queue.queue import task_queue

        # Check database health
        db_healthy = True
        db_error = None
        try:
            # Simple query to test DB connection
            list(db.collection("users").limit(1).stream())
        except Exception as e:
            db_healthy = False
            db_error = str(e)

        # Check queue health
        queue_depth = task_queue._queue.qsize() if hasattr(task_queue, '_queue') else 0
        active_jobs = len([j for j in task_queue._jobs.values() if j.state == "active"])
        waiting_jobs = len([j for j in task_queue._jobs.values() if j.state == "waiting"])
        failed_jobs = len([j for j in task_queue._jobs.values() if j.state == "failed"])

        return {
            "database": {
                "healthy": db_healthy,
                "error": db_error,
            },
            "queue": {
                "depth": queue_depth,
                "active_jobs": active_jobs,
                "waiting_jobs": waiting_jobs,
                "failed_jobs": failed_jobs,
            },
            "timestamp": now_iso(),
        }
    except Exception as e:
        logger.error(f"Failed to check system health: {e}")
        raise HTTPException(status_code=500, detail="Failed to check system health")
