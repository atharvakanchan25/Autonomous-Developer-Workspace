import { AgentType, AgentRunStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { notFound } from "../lib/errors";
import { emitter } from "../lib/emitter";
import { getAgent } from "./agent.registry";
import { AgentContext, AgentResult, DispatchRequest, DispatchResult } from "./agent.types";

const PIPELINE_ORDER: AgentType[] = [
  AgentType.CODE_GENERATOR,
  AgentType.TEST_GENERATOR,
  AgentType.CODE_REVIEWER,
];

// ── Single agent dispatch ─────────────────────────────────────────────────────

export async function dispatchAgent(
  req: DispatchRequest,
  previousOutputs: Partial<Record<AgentType, AgentResult>> = {},
): Promise<DispatchResult> {
  const { taskId, agentType } = req;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { project: { select: { id: true } } },
  });
  if (!task) throw notFound("Task");

  const projectId = task.projectId;

  const ctx: AgentContext = {
    taskId: task.id,
    projectId,
    taskTitle: task.title,
    taskDescription: task.description ?? task.title,
    previousOutputs,
  };

  const agentRun = await prisma.agentRun.create({
    data: { taskId, agentType, status: AgentRunStatus.RUNNING, input: JSON.stringify(ctx) },
  });

  const startedAt = Date.now();

  // ── Emit: agent started ───────────────────────────────────────────────────
  emitter.pipelineStage({
    taskId,
    projectId,
    agentType,
    stage: "started",
    timestamp: new Date().toISOString(),
  });

  emitter.agentLog({
    taskId,
    projectId,
    agentRunId: agentRun.id,
    agentType,
    level: "info",
    message: `Agent ${agentType} started`,
    meta: { taskTitle: task.title },
    timestamp: new Date().toISOString(),
  });

  logger.info("Agent dispatched", { agentRunId: agentRun.id, taskId, agentType });

  try {
    const agent = getAgent(agentType);
    const result = await agent.run(ctx);
    const durationMs = Date.now() - startedAt;

    await prisma.agentRun.update({
      where: { id: agentRun.id },
      data: { status: AgentRunStatus.COMPLETED, output: JSON.stringify(result), durationMs },
    });

    // ── Emit: agent completed ───────────────────────────────────────────────
    emitter.pipelineStage({
      taskId,
      projectId,
      agentType,
      stage: "completed",
      durationMs,
      summary: result.summary,
      timestamp: new Date().toISOString(),
    });

    emitter.agentLog({
      taskId,
      projectId,
      agentRunId: agentRun.id,
      agentType,
      level: "info",
      message: result.summary,
      meta: { durationMs, tokensUsed: result.tokensUsed, artifacts: result.artifacts.length },
      timestamp: new Date().toISOString(),
    });

    logger.info("Agent completed", { agentRunId: agentRun.id, taskId, agentType, durationMs });

    return { agentRunId: agentRun.id, taskId, agentType, status: "COMPLETED", result, durationMs };
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const errorMsg = (err as Error).message;

    await prisma.agentRun.update({
      where: { id: agentRun.id },
      data: { status: AgentRunStatus.FAILED, errorMsg, durationMs },
    });

    // ── Emit: agent failed ──────────────────────────────────────────────────
    emitter.pipelineStage({
      taskId,
      projectId,
      agentType,
      stage: "failed",
      durationMs,
      error: errorMsg,
      timestamp: new Date().toISOString(),
    });

    emitter.agentLog({
      taskId,
      projectId,
      agentRunId: agentRun.id,
      agentType,
      level: "error",
      message: `Agent ${agentType} failed: ${errorMsg}`,
      meta: { durationMs },
      timestamp: new Date().toISOString(),
    });

    logger.error("Agent failed", { agentRunId: agentRun.id, taskId, agentType, error: errorMsg });

    return { agentRunId: agentRun.id, taskId, agentType, status: "FAILED", error: errorMsg, durationMs };
  }
}

// ── Pipeline dispatch ─────────────────────────────────────────────────────────

export async function dispatchPipeline(taskId: string): Promise<DispatchResult[]> {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw notFound("Task");

  const projectId = task.projectId;

  logger.info("Pipeline started", { taskId, stages: PIPELINE_ORDER });

  await prisma.task.update({ where: { id: taskId }, data: { status: "IN_PROGRESS" } });

  // Emit task status change
  emitter.taskUpdated({
    taskId,
    projectId,
    status: "IN_PROGRESS",
    title: task.title,
    updatedAt: new Date().toISOString(),
  });

  emitter.agentLog({
    taskId,
    projectId,
    agentRunId: "",
    agentType: "PIPELINE",
    level: "info",
    message: `Pipeline started for "${task.title}"`,
    meta: { stages: PIPELINE_ORDER },
    timestamp: new Date().toISOString(),
  });

  const results: DispatchResult[] = [];
  const previousOutputs: Partial<Record<AgentType, AgentResult>> = {};

  for (const agentType of PIPELINE_ORDER) {
    const result = await dispatchAgent({ taskId, agentType }, previousOutputs);
    results.push(result);

    if (result.status === "FAILED") {
      await prisma.task.update({ where: { id: taskId }, data: { status: "FAILED" } });

      emitter.taskUpdated({
        taskId,
        projectId,
        status: "FAILED",
        title: task.title,
        updatedAt: new Date().toISOString(),
      });

      emitter.agentLog({
        taskId,
        projectId,
        agentRunId: result.agentRunId,
        agentType,
        level: "error",
        message: `Pipeline aborted at ${agentType}`,
        timestamp: new Date().toISOString(),
      });

      logger.error("Pipeline aborted", { taskId, agentType });
      return results;
    }

    if (result.result) previousOutputs[agentType] = result.result;
  }

  await prisma.task.update({ where: { id: taskId }, data: { status: "COMPLETED" } });

  emitter.taskUpdated({
    taskId,
    projectId,
    status: "COMPLETED",
    title: task.title,
    updatedAt: new Date().toISOString(),
  });

  emitter.agentLog({
    taskId,
    projectId,
    agentRunId: "",
    agentType: "PIPELINE",
    level: "info",
    message: `Pipeline completed for "${task.title}" — all ${results.length} agents passed`,
    timestamp: new Date().toISOString(),
  });

  logger.info("Pipeline completed", { taskId, stages: results.length });
  return results;
}
