import { taskQueue } from "./queue";
import { db } from "../lib/firestore";
import { logger } from "../lib/logger";
import { notFound, badRequest } from "../lib/errors";

export async function enqueueTask(taskId: string) {
  const taskDoc = await db.collection("tasks").doc(taskId).get();
  if (!taskDoc.exists) throw notFound("Task");

  const task = { id: taskDoc.id, ...taskDoc.data() } as {
    id: string; projectId: string; title: string; status: string;
  };

  if (task.status === "IN_PROGRESS") throw badRequest("Task is already being processed");
  if (task.status === "COMPLETED")   throw badRequest("Task is already completed");

  // reset a failed task so it can be re-queued
  if (task.status === "FAILED") {
    await db.collection("tasks").doc(taskId).update({
      status: "PENDING",
      updatedAt: new Date().toISOString(),
    });
  }

  const job = await taskQueue.add(`task:${taskId}`, {
    taskId: task.id,
    projectId: task.projectId,
    title: task.title,
  });

  logger.info("Task enqueued", { jobId: job.id, taskId, projectId: task.projectId });
  return { jobId: job.id, taskId, status: "queued" };
}

export async function getJobStatus(taskId: string) {
  const jobId = `task:${taskId}`;
  const job = await taskQueue.getJob(jobId);
  if (!job) return { jobId, taskId, state: "not_found", progress: 0 };

  return {
    jobId: job.id,
    taskId,
    state: job.state,
    progress: job.progress,
    attemptsMade: job.attemptsMade,
    failedReason: job.failedReason ?? null,
    processedOn: job.processedOn ? new Date(job.processedOn).toISOString() : null,
    finishedOn: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
    result: job.result ?? null,
  };
}

export async function retryJob(taskId: string) {
  const jobId = `task:${taskId}`;
  const job = await taskQueue.getJob(jobId);
  if (!job) throw notFound("Job");
  if (job.state !== "failed") throw badRequest(`Job is in state "${job.state}" — only failed jobs can be retried`);

  taskQueue.updateJob(jobId, { state: "waiting", failedReason: undefined });
  taskQueue.emit("job:added", job);
  logger.info("Job manually retried", { jobId, taskId });
  return { jobId, taskId, status: "retried" };
}

export async function getQueueMetrics() {
  const counts = await taskQueue.getJobCounts();
  return {
    queue: taskQueue.name,
    counts,
    total: Object.values(counts).reduce((sum, n) => sum + n, 0),
  };
}
