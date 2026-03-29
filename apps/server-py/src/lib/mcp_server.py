"""
MCP (Model Context Protocol) server for Autonomous Developer Workspace.

Exposes ADW capabilities as MCP tools and resources so any MCP-compatible
client (Claude Desktop, Cursor, etc.) can trigger pipelines, read generated
files, and inspect task history.

Mount point: /mcp  (see main.py)
"""
from __future__ import annotations

import asyncio
from typing import Optional

from mcp.server.fastmcp import FastMCP

from src.core.database import db
from src.core.logger import logger
from src.core.cache import project_cache, task_cache

mcp = FastMCP(
    name="autonomous-developer-workspace",
    instructions=(
        "ADW gives you tools to generate code, run agent pipelines, and inspect "
        "project files. Use run_pipeline to execute the full 3-agent pipeline for "
        "a task, or call individual agents via generate_code / generate_tests / "
        "review_code. Use the resource URIs to read generated files and task history."
    ),
)


# ── helpers (return None on miss — MCP callers check before use) ──────────────

def _get_project(project_id: str) -> Optional[dict]:
    cached = project_cache.get(project_id)
    if cached:
        return cached
    doc = db.collection("projects").document(project_id).get()
    if not doc.exists:
        return None
    data = {"id": doc.id, **doc.to_dict()}
    project_cache.set(project_id, data)
    return data


def _get_task(task_id: str) -> Optional[dict]:
    cached = task_cache.get(task_id)
    if cached:
        return cached
    doc = db.collection("tasks").document(task_id).get()
    if not doc.exists:
        return None
    data = {"id": doc.id, **doc.to_dict()}
    task_cache.set(task_id, data)
    return data


# ── Tools ─────────────────────────────────────────────────────────────────────

@mcp.tool()
async def run_pipeline(task_id: str) -> dict:
    """
    Run the full 3-agent pipeline (code → tests → review) for a task.

    Args:
        task_id: The document ID of the task to run.
    """
    from src.agents.langgraph_pipeline import run_langgraph_pipeline

    task = _get_task(task_id)
    if not task:
        return {"error": f"Task {task_id} not found"}

    logger.info(f"[MCP] run_pipeline called for task={task_id}")
    results = await run_langgraph_pipeline(task_id)

    return {
        "taskId": task_id,
        "title": task.get("title"),
        "stages": [
            {
                "agent": r.agentType.value,
                "status": r.status,
                "durationMs": r.durationMs,
                "summary": r.result.summary if r.result else None,
                "error": r.error,
            }
            for r in results
        ],
        "overall": "COMPLETED" if all(r.status == "COMPLETED" for r in results) else "FAILED",
    }


@mcp.tool()
async def generate_code(task_id: str) -> dict:
    """
    Run only the Code Generator agent for a task.

    Args:
        task_id: The document ID of the task.
    """
    from src.agents.agent_dispatcher import dispatch_agent
    from src.agents.agent_types import AgentType

    task = _get_task(task_id)
    if not task:
        return {"error": f"Task {task_id} not found"}

    logger.info(f"[MCP] generate_code called for task={task_id}")
    result = await dispatch_agent(task_id, AgentType.CODE_GENERATOR)

    if result.status == "FAILED":
        return {"error": result.error}

    artifacts = [
        {"filename": a.filename, "language": a.language, "content": a.content}
        for a in (result.result.artifacts if result.result else [])
    ]
    return {"taskId": task_id, "status": "COMPLETED", "artifacts": artifacts}


@mcp.tool()
async def generate_tests(task_id: str, code: Optional[str] = None) -> dict:
    """
    Run only the Test Generator agent for a task.

    Args:
        task_id: The document ID of the task.
        code: Optional implementation code to generate tests for.
    """
    from src.agents.agent_dispatcher import dispatch_agent
    from src.agents.agent_types import AgentType, AgentResult, Artifact

    task = _get_task(task_id)
    if not task:
        return {"error": f"Task {task_id} not found"}

    previous_outputs = {}
    if code:
        previous_outputs[AgentType.CODE_GENERATOR] = AgentResult(
            agentType=AgentType.CODE_GENERATOR,
            summary="Provided by MCP caller",
            artifacts=[Artifact(type="code", filename="provided.py", content=code, language="python")],
            rawLlmOutput=code,
        )

    logger.info(f"[MCP] generate_tests called for task={task_id}")
    result = await dispatch_agent(task_id, AgentType.TEST_GENERATOR, previous_outputs)

    if result.status == "FAILED":
        return {"error": result.error}

    artifacts = [
        {"filename": a.filename, "language": a.language, "content": a.content}
        for a in (result.result.artifacts if result.result else [])
    ]
    return {"taskId": task_id, "status": "COMPLETED", "artifacts": artifacts}


@mcp.tool()
async def review_code(task_id: str) -> dict:
    """
    Run only the Code Reviewer agent for a task.

    Args:
        task_id: The document ID of the task.
    """
    from src.agents.agent_dispatcher import dispatch_agent
    from src.agents.agent_types import AgentType, AgentResult, Artifact

    task = _get_task(task_id)
    if not task:
        return {"error": f"Task {task_id} not found"}

    project_id = task.get("projectId", "")
    files = list(db.collection("projectFiles").where("projectId", "==", project_id).stream())

    previous_outputs = {}
    base = task.get("title", "").lower().replace(" ", "_")[:50]

    code_file = next((f for f in files if f.to_dict().get("path", "").endswith(f"{base}.py")), None)
    test_file = next((f for f in files if f.to_dict().get("path", "").startswith("tests/test_")), None)

    if code_file:
        d = code_file.to_dict()
        previous_outputs[AgentType.CODE_GENERATOR] = AgentResult(
            agentType=AgentType.CODE_GENERATOR, summary="Fetched from DB",
            artifacts=[Artifact(type="code", filename=d["path"], content=d["content"], language=d.get("language", "python"))],
            rawLlmOutput=d["content"],
        )
    if test_file:
        d = test_file.to_dict()
        previous_outputs[AgentType.TEST_GENERATOR] = AgentResult(
            agentType=AgentType.TEST_GENERATOR, summary="Fetched from DB",
            artifacts=[Artifact(type="test", filename=d["path"], content=d["content"], language=d.get("language", "python"))],
            rawLlmOutput=d["content"],
        )

    logger.info(f"[MCP] review_code called for task={task_id}")
    result = await dispatch_agent(task_id, AgentType.CODE_REVIEWER, previous_outputs)

    if result.status == "FAILED":
        return {"error": result.error}

    review = result.result.artifacts[0].content if result.result and result.result.artifacts else ""
    return {"taskId": task_id, "status": "COMPLETED", "review": review}


@mcp.tool()
async def list_projects() -> list[dict]:
    """List all projects with their task counts and status."""
    projects = list(db.collection("projects").stream())
    result = []
    for p in projects:
        data = p.to_dict()
        tasks = list(db.collection("tasks").where("projectId", "==", p.id).stream())
        completed = sum(1 for t in tasks if t.to_dict().get("status") == "COMPLETED")
        result.append({
            "id": p.id,
            "name": data.get("name"),
            "language": data.get("language", "python"),
            "taskCount": len(tasks),
            "completedTasks": completed,
            "createdAt": data.get("createdAt"),
        })
    return result


@mcp.tool()
async def get_task_status(task_id: str) -> dict:
    """
    Get the current status and agent run history for a task.

    Args:
        task_id: The document ID of the task.
    """
    task = _get_task(task_id)
    if not task:
        return {"error": f"Task {task_id} not found"}

    runs = list(db.collection("agentRuns").where("taskId", "==", task_id).stream())

    return {
        "id": task_id,
        "title": task.get("title"),
        "status": task.get("status"),
        "agentRuns": [
            {
                "agentType": r.to_dict().get("agentType"),
                "status": r.to_dict().get("status"),
                "durationMs": r.to_dict().get("durationMs"),
            }
            for r in runs
        ],
    }


# ── Resources ─────────────────────────────────────────────────────────────────

@mcp.resource("project://{project_id}/files")
async def get_project_files(project_id: str) -> str:
    """List all generated files for a project."""
    files = list(db.collection("projectFiles").where("projectId", "==", project_id).stream())
    lines = [f"# Files for project {project_id}\n"]
    for f in files:
        d = f.to_dict()
        lines.append(f"- {d.get('path')} ({d.get('language', 'unknown')}, {d.get('size', 0)} bytes)")
    return "\n".join(lines)


@mcp.resource("project://{project_id}/file/{file_path}")
async def get_file_content(project_id: str, file_path: str) -> str:
    """Read the content of a specific generated file."""
    files = list(
        db.collection("projectFiles")
        .where("projectId", "==", project_id)
        .where("path", "==", file_path)
        .limit(1)
        .stream()
    )
    if not files:
        return f"File not found: {file_path}"
    return files[0].to_dict().get("content", "")


@mcp.resource("task://{task_id}/review")
async def get_task_review(task_id: str) -> str:
    """Read the code review report for a task."""
    task = _get_task(task_id)
    if not task:
        return f"Task {task_id} not found"

    project_id = task.get("projectId", "")
    files = list(db.collection("projectFiles").where("projectId", "==", project_id).stream())
    review = next(
        (f.to_dict().get("content", "") for f in files
         if f.to_dict().get("path", "").endswith("_review.md")),
        None,
    )
    return review or f"No review found for task {task_id}"


@mcp.resource("project://{project_id}/agent-runs")
async def get_agent_runs(project_id: str) -> str:
    """Get all agent run history for a project."""
    tasks = list(db.collection("tasks").where("projectId", "==", project_id).stream())
    lines = [f"# Agent Runs for project {project_id}\n"]
    for task in tasks:
        runs = list(db.collection("agentRuns").where("taskId", "==", task.id).stream())
        for r in runs:
            d = r.to_dict()
            lines.append(
                f"- [{d.get('agentType')}] task={task.id} "
                f"status={d.get('status')} duration={d.get('durationMs')}ms"
            )
    return "\n".join(lines)
