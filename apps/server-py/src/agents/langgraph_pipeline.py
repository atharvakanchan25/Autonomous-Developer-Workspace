"""
LangGraph pipeline for the 3-agent code generation workflow.

Replaces the manual PIPELINE_ORDER loop in agent_dispatcher.py with a
typed StateGraph so each stage transition is explicit and easy to extend
(e.g. add retry nodes, human-in-the-loop gates, or score-based branching).

Return type is identical to dispatch_pipeline() — callers need no changes.
"""
from __future__ import annotations

import asyncio
from typing import TypedDict, Optional

from langgraph.graph import StateGraph, END

from src.agents.agent_dispatcher import (
    dispatch_agent, DispatchResult, _get_task,
    _persist_artifacts, _maybe_run_scaffold,
)
from src.agents.agent_types import AgentType, AgentResult
from src.core.database import db
from src.core.logger import logger
from src.core.utils import now_iso
from src.core.cache import task_cache
from src.realtime import emitter
from src.realtime.events import TaskUpdatedPayload, AgentLogPayload


# ── State schema ──────────────────────────────────────────────────────────────

class PipelineState(TypedDict):
    task_id: str
    project_id: str
    task_title: str
    previous_outputs: dict[AgentType, AgentResult]
    results: list[DispatchResult]
    failed: bool


# ── Node factories ─────────────────────────────────────────────────────────────

def _make_agent_node(agent_type: AgentType):
    async def node(state: PipelineState) -> PipelineState:
        if state["failed"]:
            return state

        result = await dispatch_agent(
            state["task_id"],
            agent_type,
            state["previous_outputs"],
        )

        new_results = state["results"] + [result]
        new_outputs = dict(state["previous_outputs"])

        if result.status == "FAILED":
            return {**state, "results": new_results, "failed": True}

        if result.result:
            new_outputs[agent_type] = result.result

        return {**state, "results": new_results, "previous_outputs": new_outputs}

    node.__name__ = agent_type.value.lower()
    return node


def _should_continue(state: PipelineState) -> str:
    return END if state["failed"] else "continue"


# ── Graph definition ───────────────────────────────────────────────────────────

def _build_graph() -> StateGraph:
    graph = StateGraph(PipelineState)

    graph.add_node("code_generator", _make_agent_node(AgentType.CODE_GENERATOR))
    graph.add_node("test_generator", _make_agent_node(AgentType.TEST_GENERATOR))
    graph.add_node("code_reviewer",  _make_agent_node(AgentType.CODE_REVIEWER))

    graph.set_entry_point("code_generator")

    graph.add_conditional_edges("code_generator", _should_continue, {
        "continue": "test_generator",
        END: END,
    })
    graph.add_conditional_edges("test_generator", _should_continue, {
        "continue": "code_reviewer",
        END: END,
    })
    graph.add_edge("code_reviewer", END)

    return graph.compile()


_pipeline = _build_graph()


# ── Public entry point ─────────────────────────────────────────────────────────

async def run_langgraph_pipeline(task_id: str) -> list[DispatchResult]:
    """
    Execute the full 3-agent pipeline via LangGraph.
    Drop-in replacement for dispatch_pipeline().
    """
    task = _get_task(task_id)
    project_id: str = task["projectId"]

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

    initial_state: PipelineState = {
        "task_id": task_id,
        "project_id": project_id,
        "task_title": task["title"],
        "previous_outputs": {},
        "results": [],
        "failed": False,
    }

    final_state: PipelineState = await _pipeline.ainvoke(initial_state)
    results: list[DispatchResult] = final_state["results"]
    all_passed = not final_state["failed"] and all(r.status == "COMPLETED" for r in results)

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

    logger.info(f"LangGraph pipeline finished: task={task_id} status={final_status} stages={len(results)}")
    return results
