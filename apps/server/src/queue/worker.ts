import { taskQueue, TaskJobData, Job } from "./queue";
import { logger } from "../lib/logger";
import { db } from "../lib/firestore";
import { dispatchPipeline } from "../agents/agent.dispatcher";
import { bootstrapAgents } from "../agents/agent.service";
import { runCicdPipeline } from "../modules/cicd/cicd.service";

// register all agents before the queue starts processing
bootstrapAgents();

async function processJob(data: TaskJobData): Promise<void> {
  const { taskId, projectId, title } = data;
  const startedAt = Date.now();

  logger.info("Task job started", { taskId, projectId, title });

  const taskDoc = await db.collection("tasks").doc(taskId).get();
  if (!taskDoc.exists) {
    logger.error("Task not found in Firestore — skipping", { taskId });
    return;
  }

  const task = taskDoc.data()!;
  if (task.status === "COMPLETED") {
    logger.warn("Task already completed, skipping", { taskId });
    return;
  }

  await db.collection("tasks").doc(taskId).update({
    status: "IN_PROGRESS",
    updatedAt: new Date().toISOString(),
  });

  const pipelineResults = await dispatchPipeline(taskId);
  const allPassed = pipelineResults.every((r) => r.status === "COMPLETED");

  // auto-trigger CI/CD when the full pipeline passes
  if (allPassed) {
    runCicdPipeline(projectId, taskId).catch((err) =>
      logger.error("CI/CD auto-trigger failed", { taskId, error: (err as Error).message }),
    );
  }

  const durationMs = Date.now() - startedAt;
  logger.info("Task job finished", { taskId, status: allPassed ? "COMPLETED" : "FAILED", durationMs });
}

// listen for jobs added to the in-memory queue and process them
taskQueue.on("job:added", async (job: Job) => {
  taskQueue.updateJob(job.id, { state: "active", processedOn: Date.now() });
  logger.info("Job active", { jobId: job.id, taskId: job.data.taskId });

  try {
    await processJob(job.data);
    taskQueue.updateJob(job.id, { state: "completed", finishedOn: Date.now() });
    logger.info("Job completed", { jobId: job.id, taskId: job.data.taskId });
  } catch (err) {
    const errorMsg = (err as Error).message;
    taskQueue.updateJob(job.id, { state: "failed", failedReason: errorMsg, finishedOn: Date.now() });
    logger.error("Job failed", { jobId: job.id, taskId: job.data.taskId, error: errorMsg });

    // mark the task as failed in Firestore so the UI reflects it
    await db.collection("tasks").doc(job.data.taskId).update({
      status: "FAILED",
      updatedAt: new Date().toISOString(),
    }).catch((dbErr) =>
      logger.error("Failed to mark task as FAILED", {
        taskId: job.data.taskId,
        error: (dbErr as Error).message,
      }),
    );
  }
});

logger.info("Task worker started (in-memory queue)");
