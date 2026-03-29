from fastapi import APIRouter, Depends, Query, HTTPException
from typing import Optional

from src.core.database import db
from src.auth.auth import AuthUser, get_current_user, require_role

router = APIRouter()


@router.get("/summary")
def get_summary_stats(projectId: Optional[str] = Query(None), user: AuthUser = Depends(get_current_user)):
    # Non-admins only see their own projects
    if not user.is_admin():
        owned_ids = [d.id for d in db.collection("projects").where("ownerId", "==", user.uid).stream()]
        if projectId and projectId not in owned_ids:
            raise HTTPException(status_code=403, detail="Access denied")
        if not projectId and not owned_ids:
            return {"tasks": {"total": 0, "byStatus": {}}, "agentRuns": {"total": 0, "byStatus": {}, "avgDurationMs": 0}, "errors": {"total": 0, "recent": []}}

    tasks_query = db.collection("tasks")
    if projectId:
        tasks_query = tasks_query.where("projectId", "==", projectId)
    elif not user.is_admin():
        tasks_query = tasks_query.where("projectId", "in", owned_ids)
    tasks_snap = list(tasks_query.stream())
    
    agent_runs_query = db.collection("agentRuns")
    agent_runs_snap = list(agent_runs_query.stream())
    
    # Filter agent runs by project if specified
    if projectId:
        task_ids = [d.id for d in tasks_snap]
        agent_runs_snap = [d for d in agent_runs_snap if d.to_dict().get("taskId") in task_ids]

    tasks_by_status: dict[str, int] = {}
    for d in tasks_snap:
        s = d.to_dict().get("status", "UNKNOWN")
        tasks_by_status[s] = tasks_by_status.get(s, 0) + 1

    agent_runs_by_status: dict[str, int] = {}
    total_duration = 0
    completed_count = 0
    for d in agent_runs_snap:
        data = d.to_dict()
        s = data.get("status", "UNKNOWN")
        agent_runs_by_status[s] = agent_runs_by_status.get(s, 0) + 1
        if s == "COMPLETED" and data.get("durationMs"):
            total_duration += data["durationMs"]
            completed_count += 1

    error_query = (
        db.collection("observabilityLogs")
        .where("level", "==", "ERROR")
        .order_by("createdAt", direction="DESCENDING")
        .limit(5)
    )
    if projectId:
        error_query = error_query.where("projectId", "==", projectId)
    error_snap = list(error_query.stream())

    return {
        "tasks": {"total": len(tasks_snap), "byStatus": tasks_by_status},
        "agentRuns": {
            "total": len(agent_runs_snap),
            "byStatus": agent_runs_by_status,
            "avgDurationMs": round(total_duration / completed_count) if completed_count else 0,
        },
        "errors": {
            "total": len(error_snap),
            "recent": [{"id": d.id, **d.to_dict()} for d in error_snap],
        },
    }


@router.get("/logs")
def get_logs(
    level: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    projectId: Optional[str] = Query(None),
    taskId: Optional[str] = Query(None),
    limit: int = Query(100, le=500),
    cursor: Optional[str] = Query(None),
    user: AuthUser = Depends(require_role("admin")),
):
    """Get system logs. Admin only."""
    q = db.collection("observabilityLogs").order_by("createdAt", direction="DESCENDING")
    if level:
        q = q.where("level", "==", level.upper())
    if source:
        q = q.where("source", "==", source)
    if projectId:
        q = q.where("projectId", "==", projectId)
    if taskId:
        q = q.where("taskId", "==", taskId)
    if cursor:
        q = q.where("createdAt", "<", cursor)

    docs = list(q.limit(limit).stream())
    logs = [{"id": d.id, **d.to_dict()} for d in docs]
    next_cursor = logs[-1]["createdAt"] if len(logs) == limit else None
    return {"logs": logs, "nextCursor": next_cursor}


@router.get("/agents")
def get_agent_activity(projectId: Optional[str] = Query(None), limit: int = Query(50, le=200), user: AuthUser = Depends(get_current_user)):
    # Determine allowed project IDs for non-admins
    allowed_project_ids: Optional[list] = None
    if not user.is_admin():
        allowed_project_ids = [d.id for d in db.collection("projects").where("ownerId", "==", user.uid).stream()]
        if projectId and projectId not in allowed_project_ids:
            raise HTTPException(status_code=403, detail="Access denied")
        if not allowed_project_ids:
            return []

    query = (
        db.collection("agentRuns")
        .order_by("createdAt", direction="DESCENDING")
        .limit(limit)
    )

    snap = query.stream()
    results = []
    for d in snap:
        agent_run = {"id": d.id, **d.to_dict()}
        task_id = agent_run.get("taskId")
        if task_id:
            task_doc = db.collection("tasks").document(task_id).get()
            if task_doc.exists:
                task_data = task_doc.to_dict()
                task_project_id = task_data.get("projectId")
                if projectId and task_project_id != projectId:
                    continue
                if allowed_project_ids is not None and task_project_id not in allowed_project_ids:
                    continue
                agent_run["task"] = {"id": task_doc.id, "title": task_data.get("title", "Unknown Task"), "status": task_data.get("status", "UNKNOWN")}
            else:
                if projectId or allowed_project_ids is not None:
                    continue
                agent_run["task"] = {"id": task_id, "title": "Unknown Task", "status": "UNKNOWN"}
        else:
            if projectId or allowed_project_ids is not None:
                continue
            agent_run["task"] = {"id": "", "title": "Unknown Task", "status": "UNKNOWN"}
        results.append(agent_run)
    return results


@router.get("/timeline")
def get_execution_timeline(
    projectId: Optional[str] = Query(None),
    limit: int = Query(20, le=100),
    user: AuthUser = Depends(get_current_user),
):
    # Non-admins only see their own projects
    if not user.is_admin():
        owned_ids = [d.id for d in db.collection("projects").where("ownerId", "==", user.uid).stream()]
        if projectId and projectId not in owned_ids:
            raise HTTPException(status_code=403, detail="Access denied")
        if not owned_ids:
            return []

    q = (
        db.collection("tasks")
        .where("status", "in", ["COMPLETED", "FAILED", "IN_PROGRESS"])
        .order_by("updatedAt", direction="DESCENDING")
    )
    if projectId:
        q = q.where("projectId", "==", projectId)
    elif not user.is_admin():
        q = q.where("projectId", "in", owned_ids)

    timeline = []
    for d in q.limit(limit).stream():
        task = {"id": d.id, **d.to_dict()}
        
        # Fetch project info
        project_id = task.get("projectId")
        if project_id:
            project_doc = db.collection("projects").document(project_id).get()
            if project_doc.exists:
                task["project"] = {"id": project_doc.id, "name": project_doc.to_dict().get("name", "Unknown")}
            else:
                task["project"] = {"id": project_id, "name": "Unknown"}
        else:
            task["project"] = {"id": "", "name": "Unknown"}
        
        stages = [
            {"id": r.id, **r.to_dict()}
            for r in db.collection("agentRuns")
            .where("taskId", "==", d.id)
            .order_by("createdAt")
            .stream()
        ]
        total_ms = sum(s.get("durationMs", 0) for s in stages)
        timeline.append({**task, "stages": stages, "totalDurationMs": total_ms})

    return timeline


@router.get("/errors")
def get_errors(projectId: Optional[str] = Query(None), limit: int = Query(50, le=200), user: AuthUser = Depends(get_current_user)):
    """Get error logs. Accessible to all users (filtered by their projects)."""
    # Non-admins only see errors from their own projects
    allowed_project_ids: Optional[list] = None
    if not user.is_admin():
        allowed_project_ids = [d.id for d in db.collection("projects").where("ownerId", "==", user.uid).stream()]
        if projectId and projectId not in allowed_project_ids:
            raise HTTPException(status_code=403, detail="Access denied")
        if not allowed_project_ids:
            return []
    
    query = (
        db.collection("observabilityLogs")
        .where("level", "==", "ERROR")
        .order_by("createdAt", direction="DESCENDING")
        .limit(limit)
    )
    if projectId:
        query = query.where("projectId", "==", projectId)
    elif allowed_project_ids is not None:
        # For non-admins without specific projectId, filter by their projects
        query = query.where("projectId", "in", allowed_project_ids)
    
    snap = query.stream()
    return [{"id": d.id, **d.to_dict()} for d in snap]
