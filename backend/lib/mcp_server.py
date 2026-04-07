"""MCP server and shared project-context helpers for Autonomous Developer Workspace."""

from __future__ import annotations

from typing import Any

from mcp.server.fastmcp import FastMCP

from backend.core.database import db


mcp = FastMCP(name="autonomous-developer-workspace")

_FILE_COLLECTIONS = ("files", "projectFiles")
_MAX_CONTEXT_FILES = 12
_MAX_FILE_SNIPPET_CHARS = 1600
_MAX_TOTAL_CONTEXT_CHARS = 10_000


def _serialize_project(project_id: str, data: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": project_id,
        "name": data.get("name", ""),
        "description": data.get("description", ""),
        "language": data.get("language", "python"),
        "framework": data.get("framework", ""),
        "techStack": data.get("techStack", []),
        "ownerId": data.get("ownerId"),
        "updatedAt": data.get("updatedAt"),
    }


def _serialize_task(task_id: str, data: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": task_id,
        "title": data.get("title", ""),
        "description": data.get("description", ""),
        "status": data.get("status", "PENDING"),
        "order": data.get("order", 0),
        "agent": data.get("agent", ""),
        "dependsOn": data.get("dependsOn", []),
        "updatedAt": data.get("updatedAt"),
    }


def _load_project(project_id: str) -> dict[str, Any]:
    doc = db.collection("projects").document(project_id).get()
    if not doc.exists:
        raise ValueError(f"Project not found: {project_id}")
    return _serialize_project(doc.id, doc.to_dict())


def _load_project_tasks(project_id: str) -> list[dict[str, Any]]:
    docs = (
        db.collection("tasks")
        .where(filter=("projectId", "==", project_id))
        .stream()
    )
    tasks = [_serialize_task(doc.id, doc.to_dict()) for doc in docs]
    return sorted(tasks, key=lambda task: (task.get("order", 0), task.get("title", "")))


def _load_project_files(
    project_id: str,
    *,
    include_contents: bool,
    limit: int,
    snippet_chars: int,
) -> list[dict[str, Any]]:
    for collection_name in _FILE_COLLECTIONS:
        docs = list(
            db.collection(collection_name)
            .where(filter=("projectId", "==", project_id))
            .stream()
        )
        if not docs:
            continue

        files: list[dict[str, Any]] = []
        remaining_chars = _MAX_TOTAL_CONTEXT_CHARS
        for doc in sorted(docs, key=lambda item: item.to_dict().get("path", ""))[:limit]:
            data = doc.to_dict()
            item = {
                "id": doc.id,
                "path": data.get("path", ""),
                "name": data.get("name") or data.get("path", "").split("/")[-1],
                "language": data.get("language", "text"),
                "updatedAt": data.get("updatedAt"),
            }
            if include_contents:
                content = data.get("content", "") or ""
                allowed = min(snippet_chars, max(remaining_chars, 0))
                snippet = content[:allowed]
                item["content"] = snippet
                item["truncated"] = len(snippet) < len(content)
                remaining_chars -= len(snippet)
            files.append(item)
        return files

    return []


def get_project_snapshot(
    project_id: str,
    *,
    include_contents: bool = True,
    limit_files: int = _MAX_CONTEXT_FILES,
) -> dict[str, Any]:
    project = _load_project(project_id)
    tasks = _load_project_tasks(project_id)
    files = _load_project_files(
        project_id,
        include_contents=include_contents,
        limit=limit_files,
        snippet_chars=_MAX_FILE_SNIPPET_CHARS,
    )
    return {"project": project, "tasks": tasks, "files": files}


def build_project_context_text(snapshot: dict[str, Any]) -> str:
    project = snapshot.get("project", {})
    tasks = snapshot.get("tasks", [])
    files = snapshot.get("files", [])

    lines = [
        "MCP Workspace Context",
        f"Project: {project.get('name', '')}",
        f"Description: {project.get('description', '')}",
        f"Language: {project.get('language', 'python')}",
        f"Framework: {project.get('framework', '')}",
    ]

    if tasks:
        lines.append("Tasks:")
        for task in tasks[:8]:
            lines.append(
                f"- [{task.get('status', 'PENDING')}] #{task.get('order', 0)} "
                f"{task.get('title', '')}"
            )

    if files:
        lines.append("Files:")
        for file in files:
            path = file.get("path", "")
            lines.append(f"- {path} ({file.get('language', 'text')})")
            content = file.get("content")
            if content:
                snippet = str(content).strip()
                if snippet:
                    lines.append(f"```{file.get('language', 'text')}\n{snippet}\n```")

    return "\n".join(lines).strip()


@mcp.tool()
async def list_projects() -> list[dict[str, Any]]:
    """List all projects in the workspace."""
    docs = db.collection("projects").stream()
    projects = [_serialize_project(doc.id, doc.to_dict()) for doc in docs]
    return sorted(projects, key=lambda project: project.get("name", ""))


@mcp.tool()
async def get_project_context(project_id: str) -> dict[str, Any]:
    """Get a project snapshot containing project, tasks, and representative files."""
    return get_project_snapshot(project_id, include_contents=True)


@mcp.tool()
async def list_project_tasks(project_id: str) -> list[dict[str, Any]]:
    """List tasks for a project in execution order."""
    return _load_project_tasks(project_id)


@mcp.tool()
async def list_project_files(project_id: str) -> list[dict[str, Any]]:
    """List files for a project with short content snippets."""
    return _load_project_files(
        project_id,
        include_contents=True,
        limit=_MAX_CONTEXT_FILES,
        snippet_chars=600,
    )
