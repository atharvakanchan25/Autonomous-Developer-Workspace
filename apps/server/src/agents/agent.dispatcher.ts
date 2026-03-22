import { db } from "../lib/firestore";
import { logger } from "../lib/logger";
import { notFound } from "../lib/errors";
import { emitter } from "../lib/emitter";
import { getAgent } from "./agent.registry";
import { AgentType, AgentRunStatus, AgentContext, AgentResult, DispatchRequest, DispatchResult } from "./agent.types";

const PIPELINE_ORDER: AgentType[] = [
  AgentType.CODE_GENERATOR,
  AgentType.TEST_GENERATOR,
  AgentType.CODE_REVIEWER,
];

// ── Helpers ───────────────────────────────────────────────────────────────────

async function persistArtifacts(projectId: string, results: DispatchResult[]): Promise<void> {
  for (const result of results) {
    if (result.status !== "COMPLETED" || !result.result) continue;
    for (const artifact of result.result.artifacts) {
      const path = artifact.filename;
      const filesRef = db.collection("projectFiles");
      const existing = await filesRef
        .where("projectId", "==", projectId)
        .where("path", "==", path)
        .limit(1)
        .get();

      if (!existing.empty) {
        const doc = existing.docs[0]!;
        const data = doc.data();
        if (data.content) {
          await db.collection("fileVersions").add({
            fileId: doc.id,
            content: data.content,
            size: data.size,
            label: `Before agent overwrite (${result.agentType})`,
            createdAt: new Date().toISOString(),
          });
        }
        await doc.ref.update({
          content: artifact.content,
          size: Buffer.byteLength(artifact.content, "utf8"),
          language: artifact.language ?? "plaintext",
          updatedAt: new Date().toISOString(),
        });
      } else {
        await filesRef.add({
          projectId,
          path,
          name: artifact.filename,
          language: artifact.language ?? "plaintext",
          content: artifact.content,
          size: Buffer.byteLength(artifact.content, "utf8"),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    }
  }
}

// ── Single agent dispatch ─────────────────────────────────────────────────────

export async function dispatchAgent(
  req: DispatchRequest,
  previousOutputs: Partial<Record<AgentType, AgentResult>> = {},
): Promise<DispatchResult> {
  const { taskId, agentType } = req;

  const taskDoc = await db.collection("tasks").doc(taskId).get();
  if (!taskDoc.exists) throw notFound("Task");
  const task = { id: taskDoc.id, ...taskDoc.data() } as { id: string; projectId: string; title: string; description?: string };

  const projectId = task.projectId;

  const ctx: AgentContext = {
    taskId: task.id,
    projectId,
    taskTitle: task.title,
    taskDescription: task.description ?? task.title,
    previousOutputs,
  };

  const agentRunRef = await db.collection("agentRuns").add({
    taskId,
    agentType,
    status: AgentRunStatus.RUNNING,
    input: JSON.stringify(ctx),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const startedAt = Date.now();

  emitter.pipelineStage({ taskId, projectId, agentType, stage: "started", timestamp: new Date().toISOString() });
  emitter.agentLog({
    taskId, projectId, agentRunId: agentRunRef.id, agentType, level: "info",
    message: `Agent ${agentType} started`, meta: { taskTitle: task.title }, timestamp: new Date().toISOString(),
  });
  logger.info("Agent dispatched", { agentRunId: agentRunRef.id, taskId, agentType });

  try {
    const agent = getAgent(agentType);
    const result = await agent.run(ctx);
    const durationMs = Date.now() - startedAt;

    await agentRunRef.update({
      status: AgentRunStatus.COMPLETED,
      output: JSON.stringify(result),
      durationMs,
      updatedAt: new Date().toISOString(),
    });

    emitter.pipelineStage({ taskId, projectId, agentType, stage: "completed", durationMs, summary: result.summary, timestamp: new Date().toISOString() });
    emitter.agentLog({
      taskId, projectId, agentRunId: agentRunRef.id, agentType, level: "info",
      message: result.summary, meta: { durationMs, tokensUsed: result.tokensUsed, artifacts: result.artifacts.length },
      timestamp: new Date().toISOString(),
    });
    logger.info("Agent completed", { agentRunId: agentRunRef.id, taskId, agentType, durationMs });

    return { agentRunId: agentRunRef.id, taskId, agentType, status: "COMPLETED", result, durationMs };
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const errorMsg = (err as Error).message;

    await agentRunRef.update({
      status: AgentRunStatus.FAILED,
      errorMsg,
      durationMs,
      updatedAt: new Date().toISOString(),
    });

    emitter.pipelineStage({ taskId, projectId, agentType, stage: "failed", durationMs, error: errorMsg, timestamp: new Date().toISOString() });
    emitter.agentLog({
      taskId, projectId, agentRunId: agentRunRef.id, agentType, level: "error",
      message: `Agent ${agentType} failed: ${errorMsg}`, meta: { durationMs }, timestamp: new Date().toISOString(),
    });
    logger.error("Agent failed", { agentRunId: agentRunRef.id, taskId, agentType, error: errorMsg });

    return { agentRunId: agentRunRef.id, taskId, agentType, status: "FAILED", error: errorMsg, durationMs };
  }
}

// ── Pipeline dispatch ─────────────────────────────────────────────────────────

export async function dispatchPipeline(taskId: string): Promise<DispatchResult[]> {
  const taskDoc = await db.collection("tasks").doc(taskId).get();
  if (!taskDoc.exists) throw notFound("Task");
  const task = { id: taskDoc.id, ...taskDoc.data() } as { id: string; projectId: string; title: string };

  const projectId = task.projectId;
  const now = new Date().toISOString();

  logger.info("Pipeline started", { taskId, stages: PIPELINE_ORDER });

  await db.collection("tasks").doc(taskId).update({ status: "IN_PROGRESS", updatedAt: now });
  emitter.taskUpdated({ taskId, projectId, status: "IN_PROGRESS", title: task.title, updatedAt: now });
  emitter.agentLog({
    taskId, projectId, agentRunId: "", agentType: "PIPELINE", level: "info",
    message: `Pipeline started for "${task.title}"`, meta: { stages: PIPELINE_ORDER }, timestamp: now,
  });

  const results: DispatchResult[] = [];
  const previousOutputs: Partial<Record<AgentType, AgentResult>> = {};

  for (const agentType of PIPELINE_ORDER) {
    const result = await dispatchAgent({ taskId, agentType }, previousOutputs);
    results.push(result);

    if (result.status === "FAILED") {
      const ts = new Date().toISOString();
      await db.collection("tasks").doc(taskId).update({ status: "FAILED", updatedAt: ts });
      emitter.taskUpdated({ taskId, projectId, status: "FAILED", title: task.title, updatedAt: ts });
      emitter.agentLog({
        taskId, projectId, agentRunId: result.agentRunId, agentType, level: "error",
        message: `Pipeline aborted at ${agentType}`, timestamp: ts,
      });
      logger.error("Pipeline aborted", { taskId, agentType });
      return results;
    }

    if (result.result) previousOutputs[agentType] = result.result;
  }

  const ts = new Date().toISOString();
  await db.collection("tasks").doc(taskId).update({ status: "COMPLETED", updatedAt: ts });
  emitter.taskUpdated({ taskId, projectId, status: "COMPLETED", title: task.title, updatedAt: ts });
  emitter.agentLog({
    taskId, projectId, agentRunId: "", agentType: "PIPELINE", level: "info",
    message: `Pipeline completed for "${task.title}" — all ${results.length} agents passed`, timestamp: ts,
  });

  await persistArtifacts(projectId, results).catch((err) =>
    logger.error("Failed to persist artifacts", { taskId, error: (err as Error).message }),
  );

  logger.info("Pipeline completed", { taskId, stages: results.length });
  return results;
}
