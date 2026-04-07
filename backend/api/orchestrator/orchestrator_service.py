"""
Orchestrator API — exposes all new architecture endpoints.

Routes:
  POST /api/orchestrator/run              — run full project via orchestrator
  GET  /api/orchestrator/session/{pid}    — get active/last session
  POST /api/orchestrator/plan             — generate execution plan (v2 planner)
  GET  /api/orchestrator/registry         — list registered agents
  POST /api/orchestrator/registry         — register a marketplace agent
  GET  /api/orchestrator/registry/{id}    — get agent capability
  POST /api/orchestrator/registry/discover — discover agents by capability query
  POST /api/orchestrator/sandbox/run-tests — run tests in Docker sandbox
  POST /api/orchestrator/git/commit       — commit files to GitHub
  GET  /api/orchestrator/memory/search    — semantic code search
  GET  /api/orchestrator/sessions         — list all sessions for a project
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

_root = Path(__file__).resolve().parent.parent.parent
for _p in (_root, _root / "backend", _root / "ai-services"):
    _s = str(_p)
    if _s not in sys.path:
        sys.path.insert(0, _s)

from backend.auth.auth import AuthUser, get_current_user
from backend.core.database import db
from backend.core.errors import not_found, bad_request
from backend.core.logger import logger

from orchestrator.orchestrator_core import run_project, get_session
from orchestrator.planner_agent import generate_plan
from orchestrator import agent_registry as registry
from orchestrator.sandbox import run_tests, run_command, build_project
from orchestrator.git_integration import commit_project_files
from orchestrator.memory import ProjectMemory

router = APIRouter()


# ── Request / Response models ─────────────────────────────────────────────────

class RunProjectRequest(BaseModel):
    projectId: str

class PlanRequest(BaseModel):
    projectId: str
    goal: str
    language: Optional[str] = "python"

class RegisterAgentRequest(BaseModel):
    agent_id: str
    display_name: str
    description: str
    version: str = "1.0.0"
    owner: str = "marketplace"
    skills: list[str] = []
    tools: list[str] = []
    tags: list[str] = []

class DiscoverRequest(BaseModel):
    skills: Optional[list[str]] = None
    tools: Optional[list[str]] = None
    tags: Optional[list[str]] = None

class SandboxRunRequest(BaseModel):
    projectId: str
    taskId: Optional[str] = ""
    language: str = "python"
    files: dict[str, str]
    command: Optional[str] = None

class GitCommitRequest(BaseModel):
    projectId: str
    taskId: str
    taskTitle: str
    repo: str          # "owner/repo"
    files: dict[str, str]

class MemorySearchRequest(BaseModel):
    projectId: str
    query: str
    topK: Optional[int] = 5


# ── Orchestrator endpoints ────────────────────────────────────────────────────

@router.post("/run")
async def run_orchestrator(body: RunProjectRequest, user: AuthUser = Depends(get_current_user)):
    """Launch the orchestrator for a project. Returns immediately; runs in background."""
    project_doc = db.collection("projects").document(body.projectId).get()
    if not project_doc.exists:
        raise not_found("Project")
    project = project_doc.to_dict()
    if not user.can_access_resource(project.get("ownerId")):
        raise not_found("Project")

    existing = get_session(body.projectId)
    if existing and existing.status == "RUNNING":
        return {"message": "Orchestrator already running", "session": existing.to_dict()}

    asyncio.create_task(run_project(body.projectId, owner_id=user.uid))
    return {"message": "Orchestrator started", "projectId": body.projectId}


@router.get("/session/{project_id}")
async def get_orchestrator_session(project_id: str, user: AuthUser = Depends(get_current_user)):
    """Get the active or most recent orchestrator session for a project."""
    project_doc = db.collection("projects").document(project_id).get()
    if not project_doc.exists:
        raise not_found("Project")
    if not user.can_access_resource(project_doc.to_dict().get("ownerId")):
        raise not_found("Project")

    session = get_session(project_id)
    if session:
        return session.to_dict()

    # Fall back to Firestore
    docs = (
        db.collection("orchestratorSessions")
        .where(filter=("projectId", "==", project_id))
        .limit(1)
        .stream()
    )
    if docs:
        return {"id": docs[0].id, **docs[0].to_dict()}
    return {"message": "No session found", "projectId": project_id}


@router.get("/sessions")
async def list_sessions(
    projectId: str = Query(...),
    user: AuthUser = Depends(get_current_user),
):
    """List all orchestrator sessions for a project."""
    project_doc = db.collection("projects").document(projectId).get()
    if not project_doc.exists:
        raise not_found("Project")
    if not user.can_access_resource(project_doc.to_dict().get("ownerId")):
        raise not_found("Project")

    docs = (
        db.collection("orchestratorSessions")
        .where(filter=("projectId", "==", projectId))
        .limit(20)
        .stream()
    )
    return [{"id": d.id, **d.to_dict()} for d in docs]


# ── Planner endpoints ─────────────────────────────────────────────────────────

@router.post("/plan")
async def create_plan(body: PlanRequest, user: AuthUser = Depends(get_current_user)):
    """
    Generate an execution plan (v2 planner) and persist tasks.
    Automatically launches the orchestrator after planning.
    """
    project_doc = db.collection("projects").document(body.projectId).get()
    if not project_doc.exists:
        raise not_found("Project")
    project = project_doc.to_dict()
    if not user.can_access_resource(project.get("ownerId")):
        raise not_found("Project")

    if not body.goal or not body.goal.strip():
        raise bad_request("goal is required")

    plan = await generate_plan(
        project_id=body.projectId,
        goal=body.goal.strip(),
        user_id=user.uid,
        user_email=user.email,
        language=body.language or project.get("language", "python"),
    )

    # Auto-launch orchestrator
    asyncio.create_task(run_project(body.projectId, owner_id=user.uid))

    return {
        "projectId": plan.project_id,
        "goal": plan.goal,
        "plannerVersion": plan.planner_version,
        "tokensUsed": plan.tokens_used,
        "taskCount": len(plan.tasks),
        "tasks": [
            {
                "title": t.title,
                "description": t.description,
                "agentId": t.agent_id,
                "language": t.language,
                "priority": t.priority,
                "complexity": t.complexity,
                "dependsOn": t.depends_on_titles,
                "tags": t.tags,
            }
            for t in plan.tasks
        ],
        "meta": {"autoRun": True, "orchestrator": "v2"},
    }


# ── Agent Registry endpoints ──────────────────────────────────────────────────

@router.get("/registry")
async def list_registry(user: AuthUser = Depends(get_current_user)):
    """List all registered agents."""
    return [
        {
            "agentId": c.agent_id,
            "displayName": c.display_name,
            "description": c.description,
            "version": c.version,
            "owner": c.owner,
            "skills": c.skills,
            "tools": c.tools,
            "tags": c.tags,
            "isActive": c.is_active,
        }
        for c in registry.list_all()
    ]


@router.get("/registry/{agent_id}")
async def get_registry_entry(agent_id: str, user: AuthUser = Depends(get_current_user)):
    """Get a specific agent capability by ID."""
    cap = registry.get(agent_id)
    if not cap:
        raise not_found("Agent")
    return {
        "agentId": cap.agent_id,
        "displayName": cap.display_name,
        "description": cap.description,
        "version": cap.version,
        "owner": cap.owner,
        "skills": cap.skills,
        "tools": cap.tools,
        "tags": cap.tags,
        "isActive": cap.is_active,
        "registeredAt": cap.registered_at,
    }


@router.post("/registry")
async def register_agent(body: RegisterAgentRequest, user: AuthUser = Depends(get_current_user)):
    """Register a new marketplace agent."""
    cap = registry.AgentCapability(
        agent_id=body.agent_id,
        display_name=body.display_name,
        description=body.description,
        version=body.version,
        owner=user.uid,
        skills=body.skills,
        tools=body.tools,
        tags=body.tags,
    )
    registry.register(cap)
    return {"message": f"Agent '{body.agent_id}' registered", "agentId": body.agent_id}


@router.post("/registry/discover")
async def discover_agents(body: DiscoverRequest, user: AuthUser = Depends(get_current_user)):
    """Discover agents matching a capability query."""
    query: dict[str, Any] = {}
    if body.skills:
        query["skills"] = body.skills
    if body.tools:
        query["tools"] = body.tools
    if body.tags:
        query["tags"] = body.tags

    matches = registry.discover(query)
    return [
        {
            "agentId": c.agent_id,
            "displayName": c.display_name,
            "skills": c.skills,
            "tools": c.tools,
            "tags": c.tags,
            "version": c.version,
        }
        for c in matches
    ]


# ── Sandbox endpoints ─────────────────────────────────────────────────────────

@router.post("/sandbox/run-tests")
async def sandbox_run_tests(body: SandboxRunRequest, user: AuthUser = Depends(get_current_user)):
    """Run tests for a project's files inside the Docker sandbox."""
    project_doc = db.collection("projects").document(body.projectId).get()
    if not project_doc.exists:
        raise not_found("Project")
    if not user.can_access_resource(project_doc.to_dict().get("ownerId")):
        raise not_found("Project")

    result = await run_tests(
        project_id=body.projectId,
        files=body.files,
        language=body.language,
        task_id=body.taskId or "",
    )
    return {
        "success": result.success,
        "exitCode": result.exit_code,
        "stdout": result.stdout[:3000],
        "stderr": result.stderr[:1000],
        "durationMs": result.duration_ms,
        "dryRun": result.dry_run,
    }


@router.post("/sandbox/run-command")
async def sandbox_run_command(body: SandboxRunRequest, user: AuthUser = Depends(get_current_user)):
    """Run an arbitrary command in the Docker sandbox."""
    if not body.command:
        raise bad_request("command is required")
    project_doc = db.collection("projects").document(body.projectId).get()
    if not project_doc.exists:
        raise not_found("Project")
    if not user.can_access_resource(project_doc.to_dict().get("ownerId")):
        raise not_found("Project")

    result = await run_command(
        project_id=body.projectId,
        files=body.files,
        language=body.language,
        command=body.command,
        task_id=body.taskId or "",
    )
    return {
        "success": result.success,
        "exitCode": result.exit_code,
        "stdout": result.stdout[:3000],
        "stderr": result.stderr[:1000],
        "durationMs": result.duration_ms,
        "dryRun": result.dry_run,
    }


@router.post("/sandbox/build")
async def sandbox_build(body: SandboxRunRequest, user: AuthUser = Depends(get_current_user)):
    """Install dependencies and build the project in the sandbox."""
    project_doc = db.collection("projects").document(body.projectId).get()
    if not project_doc.exists:
        raise not_found("Project")
    if not user.can_access_resource(project_doc.to_dict().get("ownerId")):
        raise not_found("Project")

    result = await build_project(
        project_id=body.projectId,
        files=body.files,
        language=body.language,
        task_id=body.taskId or "",
    )
    return {
        "success": result.success,
        "exitCode": result.exit_code,
        "stdout": result.stdout[:3000],
        "durationMs": result.duration_ms,
        "dryRun": result.dry_run,
    }


# ── Git endpoints ─────────────────────────────────────────────────────────────

@router.post("/git/commit")
async def git_commit(body: GitCommitRequest, user: AuthUser = Depends(get_current_user)):
    """Commit generated files to GitHub and open a PR."""
    project_doc = db.collection("projects").document(body.projectId).get()
    if not project_doc.exists:
        raise not_found("Project")
    if not user.can_access_resource(project_doc.to_dict().get("ownerId")):
        raise not_found("Project")

    result = await commit_project_files(
        project_id=body.projectId,
        task_id=body.taskId,
        repo_full_name=body.repo,
        files=body.files,
        task_title=body.taskTitle,
    )
    return {
        "success": result.success,
        "branch": result.branch,
        "commitSha": result.commit_sha,
        "prUrl": result.pr_url,
        "message": result.message,
        "stub": result.stub,
    }


@router.get("/git/commits")
async def list_git_commits(
    projectId: str = Query(...),
    user: AuthUser = Depends(get_current_user),
):
    """List all Git commits for a project."""
    project_doc = db.collection("projects").document(projectId).get()
    if not project_doc.exists:
        raise not_found("Project")
    if not user.can_access_resource(project_doc.to_dict().get("ownerId")):
        raise not_found("Project")

    docs = (
        db.collection("gitCommits")
        .where(filter=("projectId", "==", projectId))
        .limit(50)
        .stream()
    )
    return [{"id": d.id, **d.to_dict()} for d in docs]


# ── Memory endpoints ──────────────────────────────────────────────────────────

@router.post("/memory/search")
async def memory_search(body: MemorySearchRequest, user: AuthUser = Depends(get_current_user)):
    """Semantic search over project code artifacts."""
    project_doc = db.collection("projects").document(body.projectId).get()
    if not project_doc.exists:
        raise not_found("Project")
    if not user.can_access_resource(project_doc.to_dict().get("ownerId")):
        raise not_found("Project")

    memory = ProjectMemory(body.projectId)
    results = memory.search_similar_code(body.query, top_k=body.topK or 5)
    return {"query": body.query, "results": results}


@router.get("/memory/graph")
async def memory_graph(
    projectId: str = Query(...),
    user: AuthUser = Depends(get_current_user),
):
    """Get the task dependency and file relationship graph for a project."""
    project_doc = db.collection("projects").document(projectId).get()
    if not project_doc.exists:
        raise not_found("Project")
    if not user.can_access_resource(project_doc.to_dict().get("ownerId")):
        raise not_found("Project")

    nodes = list(
        db.collection("graphNodes").where(filter=("projectId", "==", projectId)).stream()
    )
    edges = list(
        db.collection("graphEdges").where(filter=("projectId", "==", projectId)).stream()
    )
    return {
        "nodes": [{"id": d.id, **d.to_dict()} for d in nodes],
        "edges": [{"id": d.id, **d.to_dict()} for d in edges],
    }
