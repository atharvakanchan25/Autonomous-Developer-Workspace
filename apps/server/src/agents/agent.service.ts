import { AgentType } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { notFound, badRequest } from "../lib/errors";
import { registerAgent, listAgents } from "./agent.registry";
import { dispatchAgent, dispatchPipeline } from "./agent.dispatcher";
import { CodeGeneratorAgent } from "./agents/codeGenerator.agent";
import { TestGeneratorAgent } from "./agents/testGenerator.agent";
import { CodeReviewerAgent } from "./agents/codeReviewer.agent";
import { logger } from "../lib/logger";

// ── Bootstrap — call once at server startup ───────────────────────────────────
export function bootstrapAgents(): void {
  registerAgent(new CodeGeneratorAgent());
  registerAgent(new TestGeneratorAgent());
  registerAgent(new CodeReviewerAgent());
  logger.info("All agents registered", {
    agents: listAgents().map((a) => ({ type: a.type, name: a.displayName })),
  });
}

// ── Zod schemas ───────────────────────────────────────────────────────────────
export const runAgentSchema = z.object({
  taskId: z.string().cuid("Invalid task ID"),
  agentType: z.nativeEnum(AgentType).optional(),
  pipeline: z.boolean().optional().default(false),
});

export type RunAgentInput = z.infer<typeof runAgentSchema>;

// ── Public service methods ────────────────────────────────────────────────────

export async function runAgent(input: RunAgentInput) {
  if (input.pipeline) {
    return dispatchPipeline(input.taskId);
  }

  if (!input.agentType) {
    throw badRequest("agentType is required when pipeline is false");
  }

  return dispatchAgent({ taskId: input.taskId, agentType: input.agentType });
}

export async function getAgentRun(agentRunId: string) {
  const run = await prisma.agentRun.findUnique({ where: { id: agentRunId } });
  if (!run) throw notFound("AgentRun");

  return {
    ...run,
    input: JSON.parse(run.input) as unknown,
    output: run.output ? (JSON.parse(run.output) as unknown) : null,
  };
}

export async function listAgentRunsForTask(taskId: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true } });
  if (!task) throw notFound("Task");

  const runs = await prisma.agentRun.findMany({
    where: { taskId },
    orderBy: { createdAt: "asc" },
  });

  return runs.map((r) => ({
    ...r,
    input: JSON.parse(r.input) as unknown,
    output: r.output ? (JSON.parse(r.output) as unknown) : null,
  }));
}

export function getRegisteredAgents() {
  return listAgents().map((a) => ({
    type: a.type,
    displayName: a.displayName,
    description: a.description,
  }));
}
