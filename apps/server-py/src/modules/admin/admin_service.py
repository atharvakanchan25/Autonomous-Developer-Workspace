"""
Admin endpoints for user management and audit logs.
All endpoints require admin role.
"""
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from src.lib.auth import AuthUser, get_current_user, require_role, log_action
from src.lib.errors import not_found
from src.lib.firestore import db
from src.lib.utils import now_iso

router = APIRouter()


class SetRoleRequest(BaseModel):
    role: Literal["user", "admin"]


@router.get("/users/me")
def get_me(user: AuthUser = Depends(get_current_user)):
    """Get current user's profile and role."""
    return {"uid": user.uid, "email": user.email, "role": user.role}


TOKEN_LIMIT_PER_USER = 500_000  # configurable soft limit


@router.get("/token-usage")
def get_token_usage(admin: AuthUser = Depends(require_role("admin"))):
    """Aggregate token usage per user across agent runs and AI plan calls."""
    try:
        # Collect all users for email lookup
        users_map: dict[str, dict] = {}
        for d in db.collection("users").stream():
            data = d.to_dict()
            uid = data.get("uid") or d.id
            users_map[uid] = {"email": data.get("email", ""), "role": data.get("role", "user")}

        stats: dict[str, dict] = {}  # uid -> aggregated stats

        def _ensure(uid: str):
            if uid not in stats:
                info = users_map.get(uid, {"email": uid, "role": "user"})
                stats[uid] = {
                    "uid": uid,
                    "email": info["email"],
                    "role": info["role"],
                    "totalTokens": 0,
                    "callCount": 0,
                    "lastCallAt": None,
                }

        # Agent runs
        for d in db.collection("agentRuns").stream():
            data = d.to_dict()
            tokens = data.get("tokensUsed", 0) or 0
            if tokens == 0:
                continue
            # Resolve uid via task -> ownerId
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

        # AI plan logs
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
        from src.lib.logger import logger
        logger.error(f"Failed to fetch token usage: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch token usage")


@router.get("/token-usage/{uid}")
def get_user_token_calls(
    uid: str,
    limit: int = 50,
    admin: AuthUser = Depends(require_role("admin")),
):
    """Get individual API calls with prompts and token counts for a specific user."""
    calls = []

    # Agent runs — resolve uid via task ownerId
    for d in db.collection("agentRuns").stream():
        data = d.to_dict()
        task_doc = db.collection("tasks").document(data.get("taskId", "")).get()
        if not task_doc.exists:
            continue
        owner = task_doc.to_dict().get("ownerId", "")
        if owner != uid:
            continue
        calls.append({
            "id": d.id,
            "source": "agent",
            "agentType": data.get("agentType", ""),
            "prompt": data.get("prompt", ""),
            "tokensUsed": data.get("tokensUsed", 0) or 0,
            "status": data.get("status", ""),
            "createdAt": data.get("createdAt", ""),
        })

    # AI plan logs
    for d in db.collection("aiPlanLogs").where("userId", "==", uid).stream():
        data = d.to_dict()
        calls.append({
            "id": d.id,
            "source": "plan",
            "agentType": "PLAN_GENERATOR",
            "prompt": data.get("prompt", ""),
            "tokensUsed": data.get("tokensUsed", 0) or 0,
            "status": "COMPLETED",
            "createdAt": data.get("createdAt", ""),
        })

    calls.sort(key=lambda x: x["createdAt"], reverse=True)
    return calls[:limit]


@router.get("/users")
def list_users(admin: AuthUser = Depends(require_role("admin"))):
    """List all users in the system."""
    try:
        users = list(db.collection("users").stream())
        result = []
        for d in users:
            user_data = d.to_dict()
            result.append({
                "id": d.id,
                "uid": user_data.get("uid", ""),
                "email": user_data.get("email", ""),
                "role": user_data.get("role", "user"),
                "createdAt": user_data.get("createdAt", ""),
            })
        return result
    except Exception as e:
        from src.lib.logger import logger
        logger.error(f"Failed to list users: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch users")


@router.patch("/users/{uid}/role")
async def update_user_role(
    uid: str,
    body: SetRoleRequest,
    admin: AuthUser = Depends(require_role("admin"))
):
    """Change a user's role."""
    doc = db.collection("users").document(uid).get()
    if not doc.exists:
        raise not_found("User")
    
    db.collection("users").document(uid).update({
        "role": body.role,
        "updatedAt": now_iso()
    })
    
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


@router.get("/audit-logs")
def get_audit_logs(
    limit: int = 100,
    userId: Optional[str] = None,
    admin: AuthUser = Depends(require_role("admin")),
):
    """View audit trail of all user actions."""
    try:
        query = db.collection("audit_logs").order_by("createdAt", direction="DESCENDING")
        if userId:
            query = query.where("userId", "==", userId)
        logs = list(query.limit(limit).stream())
        result = []
        for d in logs:
            log_data = d.to_dict()
            result.append({
                "id": d.id,
                "userId": log_data.get("userId", ""),
                "email": log_data.get("email", ""),
                "role": log_data.get("role", "user"),
                "action": log_data.get("action", ""),
                "meta": log_data.get("meta", {}),
                "createdAt": log_data.get("createdAt", ""),
            })
        return result
    except Exception as e:
        from src.lib.logger import logger
        logger.error(f"Failed to fetch audit logs: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch audit logs")


@router.get("/users/{uid}/activity")
def get_user_activity(
    uid: str,
    limit: int = 50,
    admin: AuthUser = Depends(require_role("admin")),
):
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

    # Count projects owned by this user
    projects = list(db.collection("projects").where("ownerId", "==", uid).stream())
    project_count = len(projects)

    # Count tasks owned by this user
    tasks = list(db.collection("tasks").where("ownerId", "==", uid).stream())
    task_count = len(tasks)

    return {
        "uid": uid,
        "email": user_data.get("email", ""),
        "role": user_data.get("role", "user"),
        "createdAt": user_data.get("createdAt", ""),
        "stats": {
            "projectCount": project_count,
            "taskCount": task_count,
            "actionCount": len(logs),
        },
        "activity": [
            {
                "id": d.id,
                "action": d.to_dict().get("action", ""),
                "meta": d.to_dict().get("meta", {}),
                "createdAt": d.to_dict().get("createdAt", ""),
            }
            for d in logs
        ],
    }
