from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from firebase_admin import firestore

from backend.core.database import db
from backend.core.errors import not_found, bad_request
from backend.auth.auth import AuthUser, get_current_user, require_role, log_action
from backend.core.utils import now_iso
from backend.core.logger import logger
from backend.task_queue.queue import task_queue

router = APIRouter()

TOKEN_LIMIT = 1_000_000


def _list_docs(collection: str, order_by: str | None = None, descending: bool = False) -> list[dict[str, Any]]:
    query = db.collection(collection)
    if order_by:
        direction = firestore.Query.DESCENDING if descending else firestore.Query.ASCENDING
        query = query.order_by(order_by, direction=direction)
    return [{"id": doc.id, **doc.to_dict()} for doc in query.stream()]


def _normalize_role(value: Any) -> str:
    role = str(value or "user").strip().lower()
    return "admin" if role == "admin" else "user"


def _all_user_docs() -> list[dict[str, Any]]:
    return [{"id": doc.id, **doc.to_dict()} for doc in db.collection("users").stream()]


def _canonical_users() -> list[dict[str, Any]]:
    canonical: dict[str, dict[str, Any]] = {}

    for doc in _all_user_docs():
        uid = doc.get("uid")
        email = str(doc.get("email", "")).strip().lower()
        key = str(uid or email or doc["id"])

        normalized = {
            "id": doc["id"],
            "uid": str(uid or doc["id"]),
            "email": doc.get("email", ""),
            "role": _normalize_role(doc.get("role")),
            "createdAt": doc.get("createdAt", ""),
            "updatedAt": doc.get("updatedAt", ""),
            "suspended": bool(doc.get("suspended", False)),
        }

        existing = canonical.get(key)
        if not existing:
            canonical[key] = normalized
            continue

        # Prefer docs that are keyed by uid and have richer data.
        existing_score = int(existing["id"] == existing["uid"]) + int(bool(existing.get("createdAt"))) + int(bool(existing.get("email")))
        new_score = int(normalized["id"] == normalized["uid"]) + int(bool(normalized.get("createdAt"))) + int(bool(normalized.get("email")))
        if new_score >= existing_score:
            canonical[key] = normalized

    return sorted(
        canonical.values(),
        key=lambda item: item.get("createdAt") or item.get("email") or item.get("uid"),
        reverse=True,
    )


def _resolve_user_doc(user_identifier: str):
    direct = db.collection("users").document(user_identifier).get()
    if direct.exists:
        return direct

    for field in ("uid", "email"):
        matches = list(db.collection("users").where(field, "==", user_identifier).limit(1).stream())
        if matches:
            return matches[0]

    raise not_found("User")


def _safe_task_count(project_id: str) -> int:
    return len(list(db.collection("tasks").where("projectId", "==", project_id).stream()))


def _safe_project_count(owner_id: str) -> int:
    return len(list(db.collection("projects").where("ownerId", "==", owner_id).stream()))


def _token_calls_for_user(uid: str) -> list[dict[str, Any]]:
    tasks = {
        doc.id: doc.to_dict()
        for doc in db.collection("tasks").where("ownerId", "==", uid).stream()
    }

    calls: list[dict[str, Any]] = []

    for doc in db.collection("agentRuns").order_by("createdAt", direction=firestore.Query.DESCENDING).stream():
        run = doc.to_dict()
        task = tasks.get(run.get("taskId"))
        if not task:
            continue
        calls.append({
            "id": doc.id,
            "source": "agent",
            "agentType": run.get("agentType", "UNKNOWN"),
            "prompt": run.get("prompt", ""),
            "tokensUsed": int(run.get("tokensUsed", 0) or 0),
            "status": run.get("status", "UNKNOWN"),
            "createdAt": run.get("createdAt", ""),
        })

    for doc in db.collection("aiPlanRuns").where("uid", "==", uid).stream():
        run = doc.to_dict()
        calls.append({
            "id": doc.id,
            "source": "plan",
            "agentType": "LANGGRAPH_PLANNER",
            "prompt": run.get("prompt", ""),
            "tokensUsed": int(run.get("tokensUsed", 0) or 0),
            "status": run.get("status", "COMPLETED"),
            "createdAt": run.get("createdAt", ""),
        })

    calls.sort(key=lambda item: item.get("createdAt", ""), reverse=True)
    return calls


def _token_summary_for_user(user_doc: dict[str, Any]) -> dict[str, Any]:
    calls = _token_calls_for_user(user_doc["uid"])
    total_tokens = sum(int(call.get("tokensUsed", 0) or 0) for call in calls)
    agent_tokens = sum(int(call.get("tokensUsed", 0) or 0) for call in calls if call.get("source") == "agent")
    planner_tokens = total_tokens - agent_tokens
    agent_calls = sum(1 for call in calls if call.get("source") == "agent")
    planner_calls = len(calls) - agent_calls
    last_call_at = calls[0]["createdAt"] if calls else None
    return {
        "uid": user_doc["uid"],
        "email": user_doc.get("email", ""),
        "role": user_doc.get("role", "user"),
        "totalTokens": total_tokens,
        "agentTokens": agent_tokens,
        "plannerTokens": planner_tokens,
        "callCount": len(calls),
        "agentCalls": agent_calls,
        "plannerCalls": planner_calls,
        "lastCallAt": last_call_at,
        "limit": TOKEN_LIMIT,
        "remaining": max(TOKEN_LIMIT - total_tokens, 0),
        "limitExceeded": total_tokens > TOKEN_LIMIT,
        "usagePercent": round((total_tokens / TOKEN_LIMIT) * 100, 2) if TOKEN_LIMIT else 0,
        "isActive": bool(calls),
    }


def _task_counts_by_project() -> dict[str, int]:
    counts: dict[str, int] = {}
    for doc in db.collection("tasks").stream():
        project_id = doc.to_dict().get("projectId")
        if not project_id:
            continue
        counts[project_id] = counts.get(project_id, 0) + 1
    return counts


def _token_usage_by_user() -> dict[str, dict[str, Any]]:
    task_owner_by_id: dict[str, str] = {}
    usage: dict[str, dict[str, Any]] = {}

    for doc in db.collection("tasks").stream():
        data = doc.to_dict()
        owner_id = data.get("ownerId")
        if owner_id:
            task_owner_by_id[doc.id] = owner_id

    for doc in db.collection("agentRuns").stream():
        run = doc.to_dict()
        owner_id = task_owner_by_id.get(run.get("taskId"))
        if not owner_id:
            continue
        entry = usage.setdefault(owner_id, {
            "totalTokens": 0,
            "agentTokens": 0,
            "plannerTokens": 0,
            "callCount": 0,
            "agentCalls": 0,
            "plannerCalls": 0,
            "lastCallAt": None,
        })
        tokens = int(run.get("tokensUsed", 0) or 0)
        created_at = run.get("createdAt")
        entry["totalTokens"] += tokens
        entry["agentTokens"] += tokens
        entry["callCount"] += 1
        entry["agentCalls"] += 1
        if created_at and (not entry["lastCallAt"] or created_at > entry["lastCallAt"]):
            entry["lastCallAt"] = created_at

    for doc in db.collection("aiPlanRuns").stream():
        run = doc.to_dict()
        owner_id = run.get("uid")
        if not owner_id:
            continue
        entry = usage.setdefault(owner_id, {
            "totalTokens": 0,
            "agentTokens": 0,
            "plannerTokens": 0,
            "callCount": 0,
            "agentCalls": 0,
            "plannerCalls": 0,
            "lastCallAt": None,
        })
        tokens = int(run.get("tokensUsed", 0) or 0)
        created_at = run.get("createdAt")
        entry["totalTokens"] += tokens
        entry["plannerTokens"] += tokens
        entry["callCount"] += 1
        entry["plannerCalls"] += 1
        if created_at and (not entry["lastCallAt"] or created_at > entry["lastCallAt"]):
            entry["lastCallAt"] = created_at

    return usage


@router.get("/users/me")
async def get_current_user_info(user: AuthUser = Depends(get_current_user)):
    """Get current user information."""
    doc = db.collection("users").document(user.uid).get()
    if not doc.exists:
        raise not_found("User")

    user_data = doc.to_dict()
    return {
        "id": doc.id,
        "uid": user.uid,
        "email": user.email,
        "role": user.role,
        "createdAt": user_data.get("createdAt"),
        "updatedAt": user_data.get("updatedAt"),
        "suspended": user_data.get("suspended", False),
    }


@router.get("/users")
async def list_users(user: AuthUser = Depends(require_role("admin"))):
    return _canonical_users()


class UpdateUserRoleRequest(BaseModel):
    role: str


class UpdateUserSuspensionRequest(BaseModel):
    suspended: bool


@router.patch("/users/{user_id}/role")
async def update_user_role(
    user_id: str,
    body: UpdateUserRoleRequest,
    user: AuthUser = Depends(require_role("admin")),
):
    if body.role not in ["user", "admin"]:
        raise bad_request("Invalid role")

    doc = _resolve_user_doc(user_id)

    doc.reference.update({
        "role": _normalize_role(body.role),
        "updatedAt": now_iso(),
    })
    await log_action(user, "ROLE_CHANGE", {"targetUser": doc.id, "newRole": _normalize_role(body.role)})
    logger.info(f"User role updated: {doc.id} -> {body.role} by {user.email}")
    updated_doc = doc.reference.get()
    return {"id": updated_doc.id, **updated_doc.to_dict()}


@router.patch("/users/{user_id}/suspend")
async def suspend_user(
    user_id: str,
    body: UpdateUserSuspensionRequest,
    user: AuthUser = Depends(require_role("admin")),
):
    doc = _resolve_user_doc(user_id)

    doc.reference.update({
        "suspended": body.suspended,
        "updatedAt": now_iso(),
    })
    await log_action(user, "USER_SUSPEND" if body.suspended else "USER_UNSUSPEND", {"targetUser": doc.id})
    updated_doc = doc.reference.get()
    return {"id": updated_doc.id, **updated_doc.to_dict()}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    user: AuthUser = Depends(require_role("admin")),
):
    doc = _resolve_user_doc(user_id)

    doc.reference.delete()
    await log_action(user, "USER_DELETE", {"targetUser": doc.id})
    return {"message": "User deleted successfully"}


@router.get("/stats")
async def get_admin_stats(user: AuthUser = Depends(require_role("admin"))):
    users = _canonical_users()
    projects = _list_docs("projects")
    tasks = _list_docs("tasks")
    agent_runs = _list_docs("agentRuns")
    audit_logs = _list_docs("audit_logs")
    plan_runs = _list_docs("aiPlanRuns")

    completed_tasks = sum(1 for task in tasks if task.get("status") == "COMPLETED")
    completed_runs = sum(1 for run in agent_runs if run.get("status") == "COMPLETED")
    failed_runs = sum(1 for run in agent_runs if run.get("status") == "FAILED")
    total_tokens = sum(int(run.get("tokensUsed", 0) or 0) for run in agent_runs + plan_runs)

    return {
        "users": {
            "total": len(users),
            "admins": sum(1 for item in users if item.get("role") == "admin"),
            "regular": sum(1 for item in users if item.get("role") != "admin"),
        },
        "projects": {"total": len(projects)},
        "tasks": {"total": len(tasks), "completed": completed_tasks},
        "agentRuns": {"total": len(agent_runs), "completed": completed_runs, "failed": failed_runs},
        "auditLogs": {"total": len(audit_logs)},
        "tokens": {"total": total_tokens},
    }


@router.get("/system-health")
async def get_system_health(user: AuthUser = Depends(require_role("admin"))):
    db_health = {"healthy": True}
    try:
        list(db.collection("_health").limit(1).stream())
    except Exception as err:
        db_health = {"healthy": False, "error": str(err)}

    queue_stats = {
        "depth": int(getattr(task_queue, "depth", 0) or 0),
        "active_jobs": int(getattr(task_queue, "active_jobs", 0) or 0),
        "waiting_jobs": int(getattr(task_queue, "waiting_jobs", 0) or 0),
        "failed_jobs": int(getattr(task_queue, "failed_jobs", 0) or 0),
    }

    return {
        "database": db_health,
        "queue": queue_stats,
        "timestamp": now_iso(),
    }


@router.get("/audit-logs")
async def list_audit_logs(
    limit: int = Query(200, ge=1, le=1000),
    user: AuthUser = Depends(require_role("admin")),
):
    logs = (
        db.collection("audit_logs")
        .order_by("createdAt", direction=firestore.Query.DESCENDING)
        .limit(limit)
        .stream()
    )
    return [{"id": doc.id, **doc.to_dict()} for doc in logs]


@router.get("/projects")
async def list_projects(user: AuthUser = Depends(require_role("admin"))):
    task_counts = _task_counts_by_project()
    projects = sorted(
        _list_docs("projects"),
        key=lambda project: project.get("createdAt", ""),
        reverse=True,
    )
    return [
        {
            **project,
            "ownerEmail": project.get("ownerEmail", ""),
            "taskCount": task_counts.get(project["id"], 0),
        }
        for project in projects
    ]


@router.delete("/projects/{project_id}")
async def admin_delete_project(
    project_id: str,
    user: AuthUser = Depends(require_role("admin")),
):
    doc = db.collection("projects").document(project_id).get()
    if not doc.exists:
        raise not_found("Project")

    project = doc.to_dict()

    deleted_counts = {
        "tasks": 0,
        "files": 0,
        "legacyFiles": 0,
        "fileVersions": 0,
        "agentRuns": 0,
        "deployments": 0,
        "observabilityLogs": 0,
        "aiPlanRuns": 0,
        "auditLogs": 0,
    }

    tasks = list(db.collection("tasks").where("projectId", "==", project_id).stream())
    deleted_counts["tasks"] = len(tasks)
    for idx in range(0, len(tasks), 400):
        batch = db.batch()
        for task in tasks[idx:idx + 400]:
            batch.delete(task.reference)
        batch.commit()

    files = list(db.collection("files").where("projectId", "==", project_id).stream())
    deleted_counts["files"] = len(files)
    for idx in range(0, len(files), 400):
        batch = db.batch()
        for file_doc in files[idx:idx + 400]:
            batch.delete(file_doc.reference)
        batch.commit()

    legacy_files = list(db.collection("projectFiles").where("projectId", "==", project_id).stream())
    deleted_counts["legacyFiles"] = len(legacy_files)
    for idx in range(0, len(legacy_files), 400):
        batch = db.batch()
        for file_doc in legacy_files[idx:idx + 400]:
            batch.delete(file_doc.reference)
        batch.commit()

    file_ids = [doc.id for doc in files] + [doc.id for doc in legacy_files]
    file_versions = []
    for file_id in file_ids:
        file_versions.extend(list(db.collection("fileVersions").where("fileId", "==", file_id).stream()))
    deleted_counts["fileVersions"] = len(file_versions)
    for idx in range(0, len(file_versions), 400):
        batch = db.batch()
        for version_doc in file_versions[idx:idx + 400]:
            batch.delete(version_doc.reference)
        batch.commit()

    for key, collection in [
        ("agentRuns", "agentRuns"),
        ("deployments", "deployments"),
        ("observabilityLogs", "observabilityLogs"),
        ("aiPlanRuns", "aiPlanRuns"),
    ]:
        docs = list(db.collection(collection).where("projectId", "==", project_id).stream())
        deleted_counts[key] = len(docs)
        for idx in range(0, len(docs), 400):
            batch = db.batch()
            for item in docs[idx:idx + 400]:
                batch.delete(item.reference)
            batch.commit()

    audit_logs = []
    for audit_doc in db.collection("audit_logs").stream():
        meta = audit_doc.to_dict().get("meta", {}) or {}
        if meta.get("projectId") == project_id:
            audit_logs.append(audit_doc)
    deleted_counts["auditLogs"] = len(audit_logs)
    for idx in range(0, len(audit_logs), 400):
        batch = db.batch()
        for item in audit_logs[idx:idx + 400]:
            batch.delete(item.reference)
        batch.commit()

    db.collection("projects").document(project_id).delete()
    await log_action(user, "PROJECT_DELETE", {"name": project.get("name", ""), "resourceType": "project", "adminOverride": True})
    logger.info(f"Admin deleted project permanently: {project_id} by {user.email} cleanup={deleted_counts}")
    return {"message": "Project deleted successfully"}


@router.get("/token-usage")
async def list_token_usage(user: AuthUser = Depends(require_role("admin"))):
    users = _canonical_users()
    usage = _token_usage_by_user()
    return [
        {
            "uid": item.get("uid", item["id"]),
            "email": item.get("email", ""),
            "role": _normalize_role(item.get("role", "user")),
            "totalTokens": usage.get(item.get("uid", item["id"]), {}).get("totalTokens", 0),
            "agentTokens": usage.get(item.get("uid", item["id"]), {}).get("agentTokens", 0),
            "plannerTokens": usage.get(item.get("uid", item["id"]), {}).get("plannerTokens", 0),
            "callCount": usage.get(item.get("uid", item["id"]), {}).get("callCount", 0),
            "agentCalls": usage.get(item.get("uid", item["id"]), {}).get("agentCalls", 0),
            "plannerCalls": usage.get(item.get("uid", item["id"]), {}).get("plannerCalls", 0),
            "lastCallAt": usage.get(item.get("uid", item["id"]), {}).get("lastCallAt"),
            "limit": TOKEN_LIMIT,
            "remaining": max(TOKEN_LIMIT - usage.get(item.get("uid", item["id"]), {}).get("totalTokens", 0), 0),
            "limitExceeded": usage.get(item.get("uid", item["id"]), {}).get("totalTokens", 0) > TOKEN_LIMIT,
            "usagePercent": round((usage.get(item.get("uid", item["id"]), {}).get("totalTokens", 0) / TOKEN_LIMIT) * 100, 2) if TOKEN_LIMIT else 0,
            "isActive": usage.get(item.get("uid", item["id"]), {}).get("callCount", 0) > 0,
        }
        for item in users
    ]


@router.get("/token-usage/{user_id}")
async def get_token_usage_details(
    user_id: str,
    user: AuthUser = Depends(require_role("admin")),
):
    return _token_calls_for_user(user_id)


@router.get("/users/{user_id}/activity")
async def get_user_activity(
    user_id: str,
    user: AuthUser = Depends(require_role("admin")),
):
    doc = _resolve_user_doc(user_id)

    user_doc = doc.to_dict()
    projects = list(db.collection("projects").where("ownerId", "==", user_id).stream())
    tasks = list(db.collection("tasks").where("ownerId", "==", user_id).stream())
    logs = sorted(
        [{"id": log.id, **log.to_dict()} for log in db.collection("audit_logs").where("userId", "==", user_id).stream()],
        key=lambda item: item.get("createdAt", ""),
        reverse=True,
    )[:25]

    return {
        "uid": user_id,
        "email": user_doc.get("email", ""),
        "role": user_doc.get("role", "user"),
        "createdAt": user_doc.get("createdAt", ""),
        "stats": {
            "projectCount": len(projects),
            "taskCount": len(tasks),
            "actionCount": len(list(db.collection("audit_logs").where("userId", "==", user_id).stream())),
        },
        "activity": logs,
    }


@router.get("/users/{user_id}/projects")
async def get_user_projects(
    user_id: str,
    user: AuthUser = Depends(require_role("admin")),
):
    doc = _resolve_user_doc(user_id)

    projects = sorted(
        list(db.collection("projects").where("ownerId", "==", user_id).stream()),
        key=lambda project: project.to_dict().get("createdAt", ""),
        reverse=True,
    )
    return [
        {
            "id": project.id,
            "name": data.get("name", ""),
            "description": data.get("description", ""),
            "createdAt": data.get("createdAt", ""),
            "updatedAt": data.get("updatedAt", ""),
            "taskCount": _safe_task_count(project.id),
        }
        for project in projects
        for data in [project.to_dict()]
    ]
