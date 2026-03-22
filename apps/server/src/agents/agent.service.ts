import { z } from "zod";
import { db } from "../lib/firestore";
import { notFound, badRequest } from "../lib/errors";
import { registerAgent, listAgents } from "./agent.registry";
import { dispatchAgent, dispatchPipeline } from "./agent.dispatcher";
import { CodeGeneratorAgent } from "./runners/codeGenerator.agent";
import { TestGeneratorAgent } from "./runners/testGenerator.agent";
import { CodeReviewerAgent } from "./runners/codeReviewer.agent";
import { AgentType } from "./agent.types";
import { logger } from "../lib/logger";

export function bootstrapAgents(): void {
  registerAgent(new CodeGeneratorAgent());
  registerAgent(new TestGeneratorAgent());
  registerAgent(new CodeReviewerAgent());
  logger.info("All agents registered", {
    agents: listAgents().map((a) => ({ type: a.type, name: a.displayName })),
  });
}

export const runAgentSchema = z.object({
  taskId: z.string().min(1, "Invalid task ID"),
  agentType: z.nativeEnum(AgentType).optional(),
  pipeline: z.boolean().optional().default(false),
});

export type RunAgentInput = z.infer<typeof runAgentSchema>;

export async function runAgent(input: RunAgentInput) {
  if (input.pipeline) return dispatchPipeline(input.taskId);
  if (!input.agentType) throw badRequest("agentType is required when pipeline is false");
  return dispatchAgent({ taskId: input.taskId, agentType: input.agentType });
}

export async function getAgentRun(agentRunId: string) {
  const doc = await db.collection("agentRuns").doc(agentRunId).get();
  if (!doc.exists) throw notFound("AgentRun");
  const run = { id: doc.id, ...doc.data() } as Record<string, unknown>;
  return {
    ...run,
    input: JSON.parse(run.input as string) as unknown,
    output: run.output ? (JSON.parse(run.output as string) as unknown) : null,
  };
}

export async function listAgentRunsForTask(taskId: string) {
  const taskDoc = await db.collection("tasks").doc(taskId).get();
  if (!taskDoc.exists) throw notFound("Task");

  const snap = await db.collection("agentRuns")
    .where("taskId", "==", taskId)
    .orderBy("createdAt", "asc")
    .get();

  return snap.docs.map((d) => {
    const r = { id: d.id, ...d.data() } as Record<string, unknown>;
    return {
      ...r,
      input: JSON.parse(r.input as string) as unknown,
      output: r.output ? (JSON.parse(r.output as string) as unknown) : null,
    };
  });
}

export function getRegisteredAgents() {
  return listAgents().map((a) => ({
    type: a.type,
    displayName: a.displayName,
    description: a.description,
  }));
}
