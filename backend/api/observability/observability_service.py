from fastapi import APIRouter, Depends, Query
from typing import Optional
from firebase_admin import firestore
from backend.core.database import db
from backend.core.errors import not_found
from backend.auth.auth import AuthUser, get_current_user

router = APIRouter()

@router.get("/summary")
async def get_observability_summary(
    projectId: str = Query(...),
    user: AuthUser = Depends(get_current_user)
):
    """Get observability summary for a project."""
    # Verify project access
    project_doc = db.collection("projects").document(projectId).get()
    if not project_doc.exists:
        raise not_found("Project")
    project = project_doc.to_dict()
    if not user.can_access_resource(project.get("ownerId")):
        raise not_found("Project")
    
    # Get task counts by status
    tasks = db.collection("tasks").where("projectId", "==", projectId).stream()
    task_list = [t.to_dict() for t in tasks]
    
    status_counts = {
        "PENDING": 0,
        "IN_PROGRESS": 0,
        "COMPLETED": 0,
        "FAILED": 0
    }
    
    for task in task_list:
        status = task.get("status", "PENDING")
        if status in status_counts:
            status_counts[status] += 1
    
    # Get recent agent runs
    agent_runs = db.collection("agentRuns").where("projectId", "==", projectId).limit(10).stream()
    recent_runs = [{"id": r.id, **r.to_dict()} for r in agent_runs]
    
    return {
        "projectId": projectId,
        "taskCounts": status_counts,
        "totalTasks": len(task_list),
        "recentAgentRuns": len(recent_runs),
    }

@router.get("/agents")
async def get_agent_logs(
    projectId: str = Query(...),
    limit: int = Query(100),
    user: AuthUser = Depends(get_current_user)
):
    """Get agent execution logs for a project."""
    # Verify project access
    project_doc = db.collection("projects").document(projectId).get()
    if not project_doc.exists:
        raise not_found("Project")
    project = project_doc.to_dict()
    if not user.can_access_resource(project.get("ownerId")):
        raise not_found("Project")
    
    logs = db.collection("observabilityLogs").where("projectId", "==", projectId).where("source", "==", "agent").order_by("createdAt", direction=firestore.Query.DESCENDING).limit(limit).stream()
    return [{"id": log.id, **log.to_dict()} for log in logs]

@router.get("/errors")
async def get_error_logs(
    projectId: str = Query(...),
    limit: int = Query(50),
    user: AuthUser = Depends(get_current_user)
):
    """Get error logs for a project."""
    # Verify project access
    project_doc = db.collection("projects").document(projectId).get()
    if not project_doc.exists:
        raise not_found("Project")
    project = project_doc.to_dict()
    if not user.can_access_resource(project.get("ownerId")):
        raise not_found("Project")
    
    errors = db.collection("observabilityLogs").where("projectId", "==", projectId).where("level", "==", "ERROR").order_by("createdAt", direction=firestore.Query.DESCENDING).limit(limit).stream()
    return [{"id": err.id, **err.to_dict()} for err in errors]

@router.get("/timeline")
async def get_project_timeline(
    projectId: str = Query(...),
    user: AuthUser = Depends(get_current_user)
):
    """Get project activity timeline."""
    # Verify project access
    project_doc = db.collection("projects").document(projectId).get()
    if not project_doc.exists:
        raise not_found("Project")
    project = project_doc.to_dict()
    if not user.can_access_resource(project.get("ownerId")):
        raise not_found("Project")
    
    # Get recent activities
    tasks = db.collection("tasks").where("projectId", "==", projectId).order_by("updatedAt", direction=firestore.Query.DESCENDING).limit(20).stream()
    timeline = []
    
    for task in tasks:
        task_data = task.to_dict()
        timeline.append({
            "type": "task",
            "id": task.id,
            "title": task_data.get("title"),
            "status": task_data.get("status"),
            "timestamp": task_data.get("updatedAt"),
        })
    
    return sorted(timeline, key=lambda x: x.get("timestamp", ""), reverse=True)
