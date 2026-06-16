"""
LangGraph pipeline for the 3-agent code generation workflow.

Replaces the manual PIPELINE_ORDER loop in agent_dispatcher.py with a
typed StateGraph so each stage transition is explicit and easy to extend
(e.g. add retry nodes, human-in-the-loop gates, or score-based branching).

Return type is identical to dispatch_pipeline() — callers need no changes.
"""
from __future__ import annotations

import asyncio
from typing import Any, TypedDict
import sys
from pathlib import Path

# Add backend and orchestrator to Python path
_repo_root = Path(__file__).parent.parent.parent
for _p in (_repo_root, _repo_root / "backend"):
    _s = str(_p)
    if _s not in sys.path:
        sys.path.insert(0, _s)

import json
from langgraph.graph import StateGraph, END

from agents.agent_dispatcher import (
    dispatch_agent, DispatchResult, _get_task,
    _persist_artifacts, _maybe_run_scaffold, _maybe_run_frontend_generator,
)
from agents.agent_types import AgentType, AgentResult
from core.database import db
from core.logger import logger
from core.utils import now_iso
from core.cache import task_cache
from realtime import emitter
from realtime.events import TaskUpdatedPayload, AgentLogPayload
from backend.orchestrator.memory import ProjectMemory


# ── State schema ──────────────────────────────────────────────────────────────

class PipelineState(TypedDict):
    task_id: str
    project_id: str
    task_title: str
    previous_outputs: dict[AgentType, AgentResult]
    results: list[DispatchResult]
    failed: bool
    memory_context: list[dict]  # top-k similar code chunks from ProjectMemory
    iteration_count: int        # number of full code_generator→reviewer cycles completed


# ── Node factories ─────────────────────────────────────────────────────────────

MAX_REVIEW_ITERATIONS = 2  # max full re-runs triggered by a low reviewer score
REVIEW_SCORE_THRESHOLD = 6  # score < 6 out of 10 triggers a re-run


def _make_agent_node(agent_type: AgentType, memory: ProjectMemory):
    async def node(state: PipelineState) -> PipelineState:
        if state["failed"]:
            return state

        key = agent_type.value
        iteration_count = state["iteration_count"]

        # Enrich previous_outputs with memory context before dispatching
        memory_hits = await asyncio.get_running_loop().run_in_executor(
            None, lambda: memory.search_similar_code(state["task_title"])
        )
        enriched_outputs = dict(state["previous_outputs"])
        enriched_outputs["memory_context"] = memory_hits  # type: ignore[assignment]

        try:
            result = await dispatch_agent(
                state["task_id"],
                agent_type,
                enriched_outputs,
            )
        except Exception as exc:
            error_msg = str(exc)
            if "rate_limit_exceeded" in error_msg or "429" in error_msg:
                logger.warning(f"Agent {key} hit rate limit: {error_msg} task={state['task_id']}")
            else:
                logger.error(f"Agent {key} raised exception: {error_msg} task={state['task_id']}", exc_info=True)
            error_result = DispatchResult(
                agentRunId="",
                taskId=state["task_id"],
                agentType=agent_type,
                status="FAILED",
                error=error_msg,
            )
            return {**state, "results": state["results"] + [error_result], "failed": True}

        new_outputs = dict(state["previous_outputs"])

        if result.status == "FAILED":
            logger.error(f"Agent {key} returned FAILED, halting pipeline task={state['task_id']}")
            return {**state, "results": state["results"] + [result], "failed": True}

        if result.result:
            new_outputs[agent_type] = result.result

        if agent_type == AgentType.CODE_REVIEWER:
            iteration_count += 1

        return {
            **state,
            "results": state["results"] + [result],
            "previous_outputs": new_outputs,
            "memory_context": memory_hits,
            "iteration_count": iteration_count,
        }

    node.__name__ = agent_type.value.lower()
    return node


# ── Per-agent routing functions ───────────────────────────────────────────────

def _route_after_code_generator(state: PipelineState) -> str:
    return END if state["failed"] else "test_generator"


def _route_after_test_generator(state: PipelineState) -> str:
    return END if state["failed"] else "code_reviewer"


def _route_after_code_reviewer(state: PipelineState) -> str:
    if state["failed"]:
        return END

    # Find the most recent reviewer result
    reviewer_results = [
        r for r in state["results"]
        if r.agentType == AgentType.CODE_REVIEWER and r.status == "COMPLETED"
    ]
    if not reviewer_results:
        return END

    last_review = reviewer_results[-1]
    score = _extract_review_score(last_review)

    if score is not None and score < REVIEW_SCORE_THRESHOLD:
        if state["iteration_count"] < MAX_REVIEW_ITERATIONS:
            logger.info(
                f"Reviewer score {score}/10 below threshold {REVIEW_SCORE_THRESHOLD}, "
                f"re-running pipeline (iteration {state['iteration_count'] + 1}/{MAX_REVIEW_ITERATIONS}) "
                f"task={state['task_id']}"
            )
            return "code_generator"
        logger.warning(
            f"Reviewer score {score}/10 still below threshold after {MAX_REVIEW_ITERATIONS} "
            f"iterations, accepting result for task={state['task_id']}"
        )

    return END


def _extract_review_score(result: DispatchResult) -> int | None:
    """Parse the numeric score from a reviewer DispatchResult artifact."""
    try:
        if result.result and result.result.artifacts:
            parsed = json.loads(result.result.artifacts[0].content)
            return int(parsed["score"])
    except (json.JSONDecodeError, KeyError, ValueError, TypeError):
        pass
    return None


# ── Graph definition ───────────────────────────────────────────────────────────

def _build_graph(memory: ProjectMemory) -> StateGraph:
    graph = StateGraph(PipelineState)

    graph.add_node("code_generator", _make_agent_node(AgentType.CODE_GENERATOR, memory))
    graph.add_node("test_generator", _make_agent_node(AgentType.TEST_GENERATOR, memory))
    graph.add_node("code_reviewer",  _make_agent_node(AgentType.CODE_REVIEWER,  memory))

    graph.set_entry_point("code_generator")

    graph.add_conditional_edges("code_generator", _route_after_code_generator, {
        "test_generator": "test_generator",
        END: END,
    })
    graph.add_conditional_edges("test_generator", _route_after_test_generator, {
        "code_reviewer": "code_reviewer",
        END: END,
    })
    graph.add_conditional_edges("code_reviewer", _route_after_code_reviewer, {
        "code_generator": "code_generator",
        END: END,
    })

    return graph.compile()



# ── Public entry point ─────────────────────────────────────────────────────────

async def run_langgraph_pipeline(task_id: str) -> list[DispatchResult]:
    """
    Execute the full 3-agent pipeline via LangGraph.
    Drop-in replacement for dispatch_pipeline().
    """
    task = _get_task(task_id)
    project_id: str = task["projectId"]

    # Build memory for this project and index existing files
    memory = ProjectMemory(project_id)
    await asyncio.get_running_loop().run_in_executor(None, memory.index_project_files)

    ts = now_iso()
    db.collection("tasks").document(task_id).update({"status": "IN_PROGRESS", "updatedAt": ts})
    task_cache.delete(task_id)

    await emitter.emit_task_updated(TaskUpdatedPayload(
        taskId=task_id, projectId=project_id, status="IN_PROGRESS",
        title=task["title"], updatedAt=ts,
    ))
    await emitter.emit_agent_log(AgentLogPayload(
        taskId=task_id, projectId=project_id, agentRunId="",
        agentType="PIPELINE", level="info",
        message=f'LangGraph pipeline started for "{task["title"]}"', timestamp=ts,
    ))
    logger.info(f"LangGraph pipeline started: task={task_id}")

    pipeline = _build_graph(memory)

    initial_state: PipelineState = {
        "task_id": task_id,
        "project_id": project_id,
        "task_title": task["title"],
        "previous_outputs": {},
        "results": [],
        "failed": False,
        "memory_context": [],
        "iteration_count": 0,
    }

    final_state: PipelineState = await pipeline.ainvoke(initial_state)
    results: list[DispatchResult] = final_state["results"]
    # Count only the last iteration's results (3 agents per full cycle)
    expected_stages = 3
    all_passed = (
        not final_state["failed"]
        and len(results) >= expected_stages
        and all(r.status == "COMPLETED" for r in results[-expected_stages:])
    )

    ts = now_iso()
    final_status = "COMPLETED" if all_passed else "FAILED"
    db.collection("tasks").document(task_id).update({"status": final_status, "updatedAt": ts})
    task_cache.delete(task_id)

    await emitter.emit_task_updated(TaskUpdatedPayload(
        taskId=task_id, projectId=project_id, status=final_status,
        title=task["title"], updatedAt=ts,
    ))

    if all_passed:
        await emitter.emit_agent_log(AgentLogPayload(
            taskId=task_id, projectId=project_id, agentRunId="",
            agentType="PIPELINE", level="info",
            message=f'LangGraph pipeline completed for "{task["title"]}" — {len(results)} agents passed',
            timestamp=ts,
        ))
        try:
            await _persist_artifacts(project_id, results)
        except Exception as err:
            logger.error(f"Failed to persist artifacts: {err}", exc_info=True)

        asyncio.create_task(_maybe_run_scaffold(project_id))
        asyncio.create_task(_maybe_run_frontend_generator(project_id))

    logger.info(f"LangGraph pipeline finished: task={task_id} status={final_status} stages={len(results)}")
    return results
