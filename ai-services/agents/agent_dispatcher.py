import time
import asyncio
from dataclasses import dataclass
from typing import Optional
import sys
from pathlib import Path

# Robust path resolution — works regardless of cwd or how the process was started
_root = Path(__file__).resolve().parent.parent.parent  # repo root
for _p in (_root, _root / "backend", _root / "ai-services"):
    _s = str(_p)
    if _s not in sys.path:
        sys.path.insert(0, _s)

from core.database import db
from core.logger import logger
from core.errors import not_found
from core.utils import now_iso
from core.cache import task_cache, project_cache
from realtime import emitter
from realtime.events import AgentLogPayload, PipelineStagePayload, TaskUpdatedPayload
from agents.agent_registry import get_agent
from agents.agent_types import AgentType, AgentRunStatus, AgentContext, AgentResult
from backend.lib.mcp_server import build_project_context_text, get_project_snapshot


@dataclass
class DispatchResult:
    agentRunId: str
    taskId: str
    agentType: AgentType
    status: str             # "COMPLETED" | "FAILED"
    result: Optional[AgentResult] = None
    error: Optional[str] = None
    durationMs: int = 0


async def _persist_artifacts(project_id: str, results: list[DispatchResult], owner_id: str = "") -> None:
    for result in results:
        if result.status != "COMPLETED" or not result.result:
            continue
        for artifact in result.result.artifacts:
            if not artifact.filename:
                continue
            files_ref = db.collection("files")
            existing_docs = list(
                files_ref
                .where("projectId", "==", project_id)
                .where("path", "==", artifact.filename)
                .limit(1)
                .stream()
            )
            if existing_docs:
                doc = existing_docs[0]
                data = doc.to_dict()
                if data.get("content"):
                    if artifact.type == "review":
                        new_content = data["content"] + "\n\n---\n\n" + artifact.content
                    else:
                        db.collection("fileVersions").add({
                            "fileId": doc.id,
                            "content": data["content"],
                            "size": data.get("size", 0),
                            "label": f"Before agent overwrite ({result.agentType})",
                            "createdAt": now_iso(),
                        })
                        new_content = artifact.content
                else:
                    new_content = artifact.content
                doc.reference.update({
                    "content": new_content,
                    "path": artifact.filename,
                    "name": artifact.filename.split("/")[-1],
                    "size": len(new_content.encode("utf-8")),
                    "language": artifact.language,
                    "updatedAt": now_iso(),
                })
            else:
                files_ref.add({
                    "projectId": project_id,
                    "ownerId": owner_id,
                    "path": artifact.filename,
                    "name": artifact.filename.split("/")[-1],
                    "language": artifact.language,
                    "content": artifact.content,
                    "size": len(artifact.content.encode("utf-8")),
                    "createdAt": now_iso(),
                    "updatedAt": now_iso(),
                })


def _get_project(project_id: str) -> dict:
    cached = project_cache.get(project_id)
    if cached:
        return cached
    doc = db.collection("projects").document(project_id).get()
    if not doc.exists:
        raise not_found("Project")
    data = {"id": doc.id, **doc.to_dict()}
    project_cache.set(project_id, data)
    return data


def _get_task(task_id: str) -> dict:
    cached = task_cache.get(task_id)
    if cached:
        return cached
    task_doc = db.collection("tasks").document(task_id).get()
    if not task_doc.exists:
        raise not_found("Task")
    data = {"id": task_doc.id, **task_doc.to_dict()}
    task_cache.set(task_id, data)
    return data


async def dispatch_agent(
    task_id: str,
    agent_type: AgentType,
    previous_outputs: dict[AgentType, AgentResult] | None = None,
) -> DispatchResult:
    previous_outputs = previous_outputs or {}

    task = _get_task(task_id)
    project_id: str = task["projectId"]
    project = _get_project(project_id)
    snapshot = get_project_snapshot(project_id, include_contents=True)
    mcp_context = build_project_context_text(snapshot)

    ctx = AgentContext(
        taskId=task["id"],
        projectId=project_id,
        projectName=project.get("name", ""),
        projectDescription=project.get("description", ""),
        language=task.get("language", project.get("language", "python")).lower(),
        framework=project.get("framework", ""),
        taskTitle=task["title"],
        taskDescription=task.get("description", task["title"]),
        mcpContext=mcp_context,
        previousOutputs=previous_outputs,
    )

    prompt = f"{ctx.taskTitle}\n\n{ctx.taskDescription}"
    run_ref = db.collection("agentRuns").add({
        "taskId": task_id,
        "projectId": project_id,
        "agentType": agent_type.value,
        "status": AgentRunStatus.RUNNING.value,
        "prompt": prompt,
        "tokensUsed": 0,
        "createdAt": now_iso(),
        "updatedAt": now_iso(),
    })[1]

    started_at = time.monotonic()
    ts = now_iso()

    await emitter.emit_pipeline_stage(PipelineStagePayload(
        taskId=task_id, projectId=project_id, agentType=agent_type.value,
        stage="started", timestamp=ts,
    ))
    await emitter.emit_agent_log(AgentLogPayload(
        taskId=task_id, projectId=project_id, agentRunId=run_ref.id,
        agentType=agent_type.value, level="info",
        message=f"Agent {agent_type.value} started", timestamp=ts,
    ))
    logger.info(f"Agent dispatched: run={run_ref.id} task={task_id} agent={agent_type.value}")

    try:
        agent = get_agent(agent_type)
        result = await agent.run(ctx)  # type: ignore[attr-defined]
        duration_ms = int((time.monotonic() - started_at) * 1000)

        run_ref.update({
            "status": AgentRunStatus.COMPLETED.value,
            "output": str(result),
            "tokensUsed": result.tokensUsed if result else 0,
            "durationMs": duration_ms,
            "updatedAt": now_iso(),
        })
        ts = now_iso()
        await emitter.emit_pipeline_stage(PipelineStagePayload(
            taskId=task_id, projectId=project_id, agentType=agent_type.value,
            stage="completed", durationMs=duration_ms, summary=result.summary, timestamp=ts,
        ))
        await emitter.emit_agent_log(AgentLogPayload(
            taskId=task_id, projectId=project_id, agentRunId=run_ref.id,
            agentType=agent_type.value, level="info", message=result.summary, timestamp=ts,
        ))
        logger.info(f"Agent completed: run={run_ref.id} duration={duration_ms}ms")

        # Persist artifacts immediately after each agent so files are saved even if later agents fail
        dispatch_result = DispatchResult(
            agentRunId=run_ref.id, taskId=task_id, agentType=agent_type,
            status="COMPLETED", result=result, durationMs=duration_ms,
        )
        try:
            await _persist_artifacts(project_id, [dispatch_result], owner_id=task.get("ownerId", ""))
        except Exception as persist_err:
            logger.error(f"Failed to persist artifacts for agent={agent_type.value}: {persist_err}", exc_info=True)

        return dispatch_result

    except Exception as err:
        duration_ms = int((time.monotonic() - started_at) * 1000)
        error_msg = str(err)
        logger.error(f"Agent failed: run={run_ref.id} error={error_msg}", exc_info=True)
        run_ref.update({
            "status": AgentRunStatus.FAILED.value,
            "errorMsg": error_msg,
            "durationMs": duration_ms,
            "updatedAt": now_iso(),
        })
        ts = now_iso()
        await emitter.emit_pipeline_stage(PipelineStagePayload(
            taskId=task_id, projectId=project_id, agentType=agent_type.value,
            stage="failed", durationMs=duration_ms, error=error_msg, timestamp=ts,
        ))
        await emitter.emit_agent_log(AgentLogPayload(
            taskId=task_id, projectId=project_id, agentRunId=run_ref.id,
            agentType=agent_type.value, level="error",
            message=f"Agent {agent_type.value} failed: {error_msg}", timestamp=ts,
        ))
        return DispatchResult(
            agentRunId=run_ref.id, taskId=task_id, agentType=agent_type,
            status="FAILED", error=error_msg, durationMs=duration_ms,
        )



async def _maybe_run_frontend_generator(project_id: str) -> None:
    """Generate a single-file HTML/CSS/JS frontend once per project after all tasks complete."""
    try:
        existing = list(
            db.collection("files")
            .where("projectId", "==", project_id)
            .where("path", "==", "frontend/index.html")
            .limit(1)
            .stream()
        )
        if existing:
            return

        all_tasks = list(db.collection("tasks").where("projectId", "==", project_id).stream())
        if not all_tasks or not all(t.to_dict().get("status") == "COMPLETED" for t in all_tasks):
            return

        project = _get_project(project_id)
        ctx = AgentContext(
            taskId="frontend",
            projectId=project_id,
            projectName=project.get("name", ""),
            projectDescription=project.get("description", ""),
            language="html",
            framework="",
            taskTitle="Frontend UI",
            taskDescription="Generate a single-file HTML/CSS/JS frontend",
            mcpContext="",
        )

        from agents.runners.frontend_generator import FrontendGeneratorAgent
        result = await FrontendGeneratorAgent().run(ctx)

        for artifact in result.artifacts:
            db.collection("files").add({
                "projectId": project_id,
                "path": artifact.filename,
                "name": artifact.filename.split("/")[-1],
                "language": artifact.language,
                "content": artifact.content,
                "size": len(artifact.content.encode("utf-8")),
                "createdAt": now_iso(),
                "updatedAt": now_iso(),
            })
        logger.info(f"Frontend generated for project={project_id}")
    except Exception as err:
        logger.error(f"Frontend generation failed for project={project_id}: {err}", exc_info=True)


async def _maybe_run_scaffold(project_id: str) -> None:
    """Run the scaffold agent once when every task in the project is COMPLETED."""
    try:
        all_tasks = list(db.collection("tasks").where("projectId", "==", project_id).stream())
        if not all_tasks:
            return
        statuses = [t.to_dict().get("status") for t in all_tasks]
        if not all(s == "COMPLETED" for s in statuses):
            return

        existing = list(
            db.collection("files")
            .where("projectId", "==", project_id)
            .where("path", "==", "README.md")
            .limit(1)
            .stream()
        )
        if existing:
            return

        logger.info(f"All tasks complete — running scaffold for project={project_id}")
        project = _get_project(project_id)

        file_docs = list(db.collection("files").where("projectId", "==", project_id).stream())

        run_docs = list(
            db.collection("agentRuns")
            .where("projectId", "==", project_id)
            .where("status", "==", "COMPLETED")
            .stream()
        )

        review_artifacts = []
        code_artifacts = []
        test_artifacts = []
        from agents.agent_types import Artifact, AgentResult as AR

        for doc in file_docs:
            data = doc.to_dict()
            path = data.get("path", "")
            lang = data.get("language", "")
            content = data.get("content", "")
            if path.startswith("src/") or path.startswith("pkg/") or path.startswith("lib/"):
                code_artifacts.append(Artifact(type="code", filename=path, content=content, language=lang))
            elif path.startswith("tests/") or path.startswith("spec/"):
                test_artifacts.append(Artifact(type="test", filename=path, content=content, language=lang))

        reviewer_runs = [d for d in run_docs if d.to_dict().get("agentType") == "CODE_REVIEWER"]
        for run in reviewer_runs:
            output = run.to_dict().get("output", "")
            if output and len(output) > 50:
                review_artifacts.append(Artifact(type="review", filename="", content=output, language="markdown"))

        synthetic_code   = AR(agentType=AgentType.CODE_GENERATOR, summary="", artifacts=code_artifacts,   rawLlmOutput="", tokensUsed=0)
        synthetic_test   = AR(agentType=AgentType.TEST_GENERATOR,  summary="", artifacts=test_artifacts,   rawLlmOutput="", tokensUsed=0)
        synthetic_review = AR(agentType=AgentType.CODE_REVIEWER,   summary="", artifacts=review_artifacts, rawLlmOutput="", tokensUsed=0)

        ctx = AgentContext(
            taskId="scaffold",
            projectId=project_id,
            projectName=project.get("name", ""),
            projectDescription=project.get("description", ""),
            language=project.get("language", "python").lower(),
            framework=project.get("framework", ""),
            taskTitle="Project Scaffold",
            taskDescription="Generate README and dependency file",
            mcpContext=build_project_context_text(get_project_snapshot(project_id, include_contents=True)),
            previousOutputs={
                AgentType.CODE_GENERATOR: synthetic_code,
                AgentType.TEST_GENERATOR: synthetic_test,
                AgentType.CODE_REVIEWER:  synthetic_review,
            },
        )

        scaffold = get_agent(AgentType.SCAFFOLD)
        result = await scaffold.run(ctx)  # type: ignore[attr-defined]

        for artifact in result.artifacts:
            db.collection("files").add({
                "projectId": project_id,
                "path": artifact.filename,
                "name": artifact.filename.split("/")[-1],
                "language": artifact.language,
                "content": artifact.content,
                "size": len(artifact.content.encode("utf-8")),
                "createdAt": now_iso(),
                "updatedAt": now_iso(),
            })

        logger.info(f"Scaffold complete for project={project_id}: {[a.filename for a in result.artifacts]}")
    except Exception as err:
        logger.error(f"Scaffold failed for project={project_id}: {err}", exc_info=True)
