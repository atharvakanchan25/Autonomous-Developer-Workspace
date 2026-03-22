import { AgentType, AgentRunStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { notFound } from "../lib/errors";
import { getAgent } from "./agent.registry";
import { AgentContext, AgentResult, DispatchRequest, DispatchResult } from "./agent.types";

// Full pipeline order — CODE_GENERATOR feeds TEST_GENERATOR feeds CODE_REVIEWER
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

  // Load task from DB
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { project: { select: { id: true } } },
  });
  if (!task) throw notFound("Task");

  const ctx: AgentContext = {
    taskId: task.id,
    projectId: task.projectId,
    taskTitle: task.title,
    taskDescription: task.description ?? task.title,
    previousOutputs,
  };

  // Create AgentRun record in RUNNING state
  const agentRun = await prisma.agentRun.create({
    data: {
      taskId,
      agentType,
      status: AgentRunStatus.RUNNING,
      input: JSON.stringify(ctx),
    },
  });

  const startedAt = Date.now();

  logger.info("Agent dispatched", {
    agentRunId: agentRun.id,
    taskId,
    agentType,
    taskTitle: task.title,
  });

  try {
    const agent = getAgent(agentType);
    const result = await agent.run(ctx);
    const durationMs = Date.now() - startedAt;

    // Persist result
    await prisma.agentRun.update({
      where: { id: agentRun.id },
      data: {
        status: AgentRunStatus.COMPLETED,
        output: JSON.stringify(result),
        durationMs,
      },
    });

    logger.info("Agent completed", {
      agentRunId: agentRun.id,
      taskId,
      agentType,
      durationMs,
      summary: result.summary,
      tokensUsed: result.tokensUsed,
    });

    return {
      agentRunId: agentRun.id,
      taskId,
      agentType,
      status: "COMPLETED",
      result,
      durationMs,
    };
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const errorMsg = (err as Error).message;

    await prisma.agentRun.update({
      where: { id: agentRun.id },
      data: {
        status: AgentRunStatus.FAILED,
        errorMsg,
        durationMs,
      },
    });

    logger.error("Agent failed", {
      agentRunId: agentRun.id,
      taskId,
      agentType,
      durationMs,
      error: errorMsg,
    });

    return {
      agentRunId: agentRun.id,
      taskId,
      agentType,
      status: "FAILED",
      error: errorMsg,
      durationMs,
    };
  }
}

// ── Pipeline dispatch ─────────────────────────────────────────────────────────
// Runs CODE_GENERATOR → TEST_GENERATOR → CODE_REVIEWER in sequence.
// Each agent receives the outputs of all previous agents.
// Task status: PENDING → IN_PROGRESS → COMPLETED / FAILED

export async function dispatchPipeline(taskId: string): Promise<DispatchResult[]> {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw notFound("Task");

  logger.info("Pipeline started", { taskId, stages: PIPELINE_ORDER });

  // Mark task IN_PROGRESS
  await prisma.task.update({ where: { id: taskId }, data: { status: "IN_PROGRESS" } });

  const results: DispatchResult[] = [];
  const previousOutputs: Partial<Record<AgentType, AgentResult>> = {};

  for (const agentType of PIPELINE_ORDER) {
    const result = await dispatchAgent({ taskId, agentType }, previousOutputs);
    results.push(result);

    if (result.status === "FAILED") {
      // Abort pipeline on first failure
      await prisma.task.update({ where: { id: taskId }, data: { status: "FAILED" } });
      logger.error("Pipeline aborted — agent failed", { taskId, agentType });
      return results;
    }

    // Pass this agent's output to the next one
    if (result.result) {
      previousOutputs[agentType] = result.result;
    }
  }

  // All stages passed
  await prisma.task.update({ where: { id: taskId }, data: { status: "COMPLETED" } });
  logger.info("Pipeline completed", { taskId, stages: results.length });

  return results;
}
