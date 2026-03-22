from fastapi import APIRouter, Query
from typing import Optional

from src.lib.firestore import db

router = APIRouter()


@router.get("/summary")
def get_summary_stats():
    tasks_snap = list(db.collection("tasks").stream())
    agent_runs_snap = list(db.collection("agentRuns").stream())

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

    error_snap = list(
        db.collection("observabilityLogs")
        .where("level", "==", "ERROR")
        .order_by("createdAt", direction="DESCENDING")
        .limit(5)
        .stream()
    )

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
):
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
def get_agent_activity(limit: int = Query(50, le=200)):
    snap = (
        db.collection("agentRuns")
        .order_by("createdAt", direction="DESCENDING")
        .limit(limit)
        .stream()
    )
    return [{"id": d.id, **d.to_dict()} for d in snap]


@router.get("/timeline")
def get_execution_timeline(
    projectId: Optional[str] = Query(None),
    limit: int = Query(20, le=100),
):
    q = (
        db.collection("tasks")
        .where("status", "in", ["COMPLETED", "FAILED", "IN_PROGRESS"])
        .order_by("updatedAt", direction="DESCENDING")
    )
    if projectId:
        q = q.where("projectId", "==", projectId)

    timeline = []
    for d in q.limit(limit).stream():
        task = {"id": d.id, **d.to_dict()}
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
def get_errors(limit: int = Query(50, le=200)):
    snap = (
        db.collection("observabilityLogs")
        .where("level", "==", "ERROR")
        .order_by("createdAt", direction="DESCENDING")
        .limit(limit)
        .stream()
    )
    return [{"id": d.id, **d.to_dict()} for d in snap]
