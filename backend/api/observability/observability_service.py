from fastapi import APIRouter, Depends, Query
from typing import Optional
from firebase_admin import firestore
from backend.core.database import db
from backend.core.errors import not_found
from backend.auth.auth import AuthUser, get_current_user

router = APIRouter()


def _verify_project(project_id: str, user: AuthUser) -> dict:
    doc = db.collection("projects").document(project_id).get()
    if not doc.exists:
        raise not_found("Project")
    project = doc.to_dict()
    if not user.can_access_resource(project.get("ownerId")):
        raise not_found("Project")
    return {"id": doc.id, **project}


def _user_project_ids(user: AuthUser) -> list[str]:
    docs = db.collection("projects").where(filter=("ownerId", "==", user.uid)).stream()
    return [d.id for d in docs]


# ── /summary ──────────────────────────────────────────────────────────────────

@router.get("/summary")
async def get_observability_summary(
    projectId: Optional[str] = Query(None),
    user: AuthUser = Depends(get_current_user),
):
    """
    Returns SummaryStats shape:
    {
      tasks: { total, byStatus: { PENDING, IN_PROGRESS, COMPLETED, FAILED } },
      agentRuns: { total, byStatus: { RUNNING, COMPLETED, FAILED }, avgDurationMs },
      errors: { total, recent: [...] }
    }
    """
    if projectId:
        _verify_project(projectId, user)
        task_docs = list(db.collection("tasks").where(filter=("projectId", "==", projectId)).stream())
        run_docs  = list(db.collection("agentRuns").where(filter=("projectId", "==", projectId)).stream())
        err_docs  = list(
            db.collection("observabilityLogs")
            .where(filter=("projectId", "==", projectId))
            .where(filter=("level", "==", "error"))
            .order_by("createdAt", direction=firestore.Query.DESCENDING)
            .limit(5)
            .stream()
        )
    else:
        project_ids = _user_project_ids(user)
        if not project_ids:
            return {
                "tasks":     {"total": 0, "byStatus": {}},
                "agentRuns": {"total": 0, "byStatus": {}, "avgDurationMs": 0},
                "errors":    {"total": 0, "recent": []},
            }
        task_docs = list(db.collection("tasks").where(filter=("ownerId", "==", user.uid)).stream())
        # agentRuns don't have ownerId — collect across all user projects
        run_docs = []
        err_docs = []
        for pid in project_ids[:10]:  # cap to avoid too many reads
            run_docs += list(db.collection("agentRuns").where(filter=("projectId", "==", pid)).stream())
            err_docs += list(
                db.collection("observabilityLogs")
                .where(filter=("projectId", "==", pid))
                .where(filter=("level", "==", "error"))
                .limit(3)
                .stream()
            )

    # Task counts
    by_status: dict[str, int] = {"PENDING": 0, "IN_PROGRESS": 0, "COMPLETED": 0, "FAILED": 0}
    for doc in task_docs:
        s = doc.to_dict().get("status", "PENDING")
        if s in by_status:
            by_status[s] += 1

    # Agent run counts + avg duration
    run_by_status: dict[str, int] = {"RUNNING": 0, "COMPLETED": 0, "FAILED": 0}
    durations: list[int] = []
    for doc in run_docs:
        data = doc.to_dict()
        s = data.get("status", "")
        if s in run_by_status:
            run_by_status[s] += 1
        d = data.get("durationMs")
        if d:
            durations.append(int(d))
    avg_duration = round(sum(durations) / len(durations)) if durations else 0

    # Recent errors
    recent_errors = []
    for doc in err_docs[:5]:
        data = doc.to_dict()
        recent_errors.append({
            "id":        doc.id,
            "message":   data.get("message", ""),
            "source":    data.get("source", ""),
            "createdAt": data.get("createdAt", ""),
            "agentType": data.get("agentType"),
        })

    return {
        "tasks": {
            "total":    len(task_docs),
            "byStatus": by_status,
        },
        "agentRuns": {
            "total":        len(run_docs),
            "byStatus":     run_by_status,
            "avgDurationMs": avg_duration,
        },
        "errors": {
            "total":  len(err_docs),
            "recent": recent_errors,
        },
    }


# ── /agents ───────────────────────────────────────────────────────────────────

@router.get("/agents")
async def get_agent_runs(
    projectId: Optional[str] = Query(None),
    limit: int = Query(100),
    user: AuthUser = Depends(get_current_user),
):
    """
    Returns AgentRunRow[]:
    [{ id, agentType, status, durationMs, errorMsg, createdAt, updatedAt,
       task: { id, title, projectId } }]
    """
    if projectId:
        _verify_project(projectId, user)
        run_docs = list(
            db.collection("agentRuns")
            .where(filter=("projectId", "==", projectId))
            .order_by("createdAt", direction=firestore.Query.DESCENDING)
            .limit(limit)
            .stream()
        )
    else:
        project_ids = _user_project_ids(user)
        run_docs = []
        for pid in project_ids[:10]:
            run_docs += list(
                db.collection("agentRuns")
                .where(filter=("projectId", "==", pid))
                .order_by("createdAt", direction=firestore.Query.DESCENDING)
                .limit(limit)
                .stream()
            )
        run_docs = sorted(run_docs, key=lambda d: d.to_dict().get("createdAt", ""), reverse=True)[:limit]

    # Batch-fetch tasks for the run docs
    task_ids = list({d.to_dict().get("taskId") for d in run_docs if d.to_dict().get("taskId")})
    tasks_by_id: dict[str, dict] = {}
    for tid in task_ids:
        tdoc = db.collection("tasks").document(tid).get()
        if tdoc.exists:
            tasks_by_id[tid] = {"id": tdoc.id, **tdoc.to_dict()}

    rows = []
    for doc in run_docs:
        data = doc.to_dict()
        tid = data.get("taskId", "")
        task = tasks_by_id.get(tid)
        rows.append({
            "id":         doc.id,
            "agentType":  data.get("agentType", ""),
            "status":     data.get("status", ""),
            "durationMs": data.get("durationMs"),
            "errorMsg":   data.get("errorMsg"),
            "createdAt":  data.get("createdAt", ""),
            "updatedAt":  data.get("updatedAt", ""),
            "task": {
                "id":        tid,
                "title":     task.get("title", "") if task else "",
                "projectId": task.get("projectId", "") if task else data.get("projectId", ""),
            },
        })
    return rows


# ── /timeline ─────────────────────────────────────────────────────────────────

@router.get("/timeline")
async def get_project_timeline(
    projectId: Optional[str] = Query(None),
    user: AuthUser = Depends(get_current_user),
):
    """
    Returns TimelineRow[]:
    [{ taskId, title, status, project: {id, name},
       createdAt, updatedAt, totalDurationMs,
       stages: [{ id, agentType, status, durationMs, createdAt, updatedAt }] }]
    """
    if projectId:
        _verify_project(projectId, user)
        project_ids = [projectId]
    else:
        project_ids = _user_project_ids(user)

    # Fetch projects for name lookup
    projects_by_id: dict[str, dict] = {}
    for pid in project_ids:
        pdoc = db.collection("projects").document(pid).get()
        if pdoc.exists:
            projects_by_id[pid] = {"id": pdoc.id, **pdoc.to_dict()}

    rows = []
    for pid in project_ids[:10]:
        task_docs = list(
            db.collection("tasks")
            .where(filter=("projectId", "==", pid))
            .order_by("updatedAt", direction=firestore.Query.DESCENDING)
            .limit(20)
            .stream()
        )
        for tdoc in task_docs:
            tdata = tdoc.to_dict()

            # Fetch agent runs for this task as stages
            run_docs = list(
                db.collection("agentRuns")
                .where(filter=("taskId", "==", tdoc.id))
                .order_by("createdAt")
                .stream()
            )
            stages = []
            total_ms = 0
            for rdoc in run_docs:
                rdata = rdoc.to_dict()
                dm = rdata.get("durationMs") or 0
                total_ms += int(dm)
                stages.append({
                    "id":         rdoc.id,
                    "agentType":  rdata.get("agentType", ""),
                    "status":     rdata.get("status", ""),
                    "durationMs": rdata.get("durationMs"),
                    "createdAt":  rdata.get("createdAt", ""),
                    "updatedAt":  rdata.get("updatedAt", ""),
                })

            proj = projects_by_id.get(pid, {})
            rows.append({
                "taskId":         tdoc.id,
                "title":          tdata.get("title", ""),
                "status":         tdata.get("status", "PENDING"),
                "project":        {"id": pid, "name": proj.get("name", "")},
                "createdAt":      tdata.get("createdAt", ""),
                "updatedAt":      tdata.get("updatedAt", ""),
                "totalDurationMs": total_ms,
                "stages":         stages,
            })

    rows.sort(key=lambda r: r.get("updatedAt", ""), reverse=True)
    return rows[:50]


# ── /errors ───────────────────────────────────────────────────────────────────

@router.get("/errors")
async def get_error_logs(
    projectId: Optional[str] = Query(None),
    limit: int = Query(50),
    user: AuthUser = Depends(get_current_user),
):
    """Returns ObsLog[] filtered to error-level entries."""
    if projectId:
        _verify_project(projectId, user)
        # stored as lowercase "error" by emitter.py
        docs = list(
            db.collection("observabilityLogs")
            .where(filter=("projectId", "==", projectId))
            .where(filter=("level", "==", "error"))
            .order_by("createdAt", direction=firestore.Query.DESCENDING)
            .limit(limit)
            .stream()
        )
    else:
        project_ids = _user_project_ids(user)
        docs = []
        for pid in project_ids[:10]:
            docs += list(
                db.collection("observabilityLogs")
                .where(filter=("projectId", "==", pid))
                .where(filter=("level", "==", "error"))
                .order_by("createdAt", direction=firestore.Query.DESCENDING)
                .limit(limit)
                .stream()
            )
        docs = sorted(docs, key=lambda d: d.to_dict().get("createdAt", ""), reverse=True)[:limit]

    return [_to_obs_log(d) for d in docs]


# ── /logs ─────────────────────────────────────────────────────────────────────

@router.get("/logs")
async def get_logs(
    projectId: Optional[str] = Query(None),
    limit: int = Query(200),
    cursor: Optional[str] = Query(None),
    user: AuthUser = Depends(get_current_user),
):
    """
    Returns { logs: ObsLog[], nextCursor: string | null }
    Admin-only in the UI but endpoint is auth-gated normally.
    """
    if projectId:
        _verify_project(projectId, user)
        query = (
            db.collection("observabilityLogs")
            .where(filter=("projectId", "==", projectId))
            .order_by("createdAt", direction=firestore.Query.DESCENDING)
            .limit(limit)
        )
        docs = list(query.stream())
    else:
        project_ids = _user_project_ids(user)
        docs = []
        for pid in project_ids[:10]:
            docs += list(
                db.collection("observabilityLogs")
                .where(filter=("projectId", "==", pid))
                .order_by("createdAt", direction=firestore.Query.DESCENDING)
                .limit(limit)
                .stream()
            )
        docs = sorted(docs, key=lambda d: d.to_dict().get("createdAt", ""), reverse=True)[:limit]

    return {
        "logs": [_to_obs_log(d) for d in docs],
        "nextCursor": None,
    }


# ── helpers ───────────────────────────────────────────────────────────────────

def _to_obs_log(doc) -> dict:
    data = doc.to_dict()
    return {
        "id":         doc.id,
        "level":      (data.get("level") or "info").upper(),
        "source":     data.get("source", ""),
        "message":    data.get("message", ""),
        "taskId":     data.get("taskId"),
        "projectId":  data.get("projectId"),
        "agentRunId": data.get("agentRunId"),
        "agentType":  data.get("agentType"),
        "durationMs": data.get("durationMs"),
        "meta":       None,
        "createdAt":  data.get("createdAt", ""),
    }
