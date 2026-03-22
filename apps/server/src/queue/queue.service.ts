import { taskQueue } from "./queue";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { notFound, badRequest } from "../lib/errors";

// ── Enqueue ──────────────────────────────────────────────────────────────────

export async function enqueueTask(taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { project: { select: { id: true, name: true } } },
  });

  if (!task) throw notFound("Task");

  if (task.status === "IN_PROGRESS") {
    throw badRequest("Task is already being processed");
  }
  if (task.status === "COMPLETED") {
    throw badRequest("Task is already completed");
  }

  // Reset to PENDING if re-enqueuing a failed task
  if (task.status === "FAILED") {
    await prisma.task.update({ where: { id: taskId }, data: { status: "PENDING" } });
  }

  const job = await taskQueue.add(
    "process-task",
    {
      taskId: task.id,
      projectId: task.projectId,
      title: task.title,
      attempt: 0,
    },
    {
      jobId: `task:${taskId}`, // idempotent — prevents duplicate jobs for same task
    },
  );

  logger.info("Task enqueued", {
    jobId: job.id,
    taskId,
    projectId: task.projectId,
    title: task.title,
  });

  return { jobId: job.id, taskId, status: "queued" };
}

// ── Job status ───────────────────────────────────────────────────────────────

export async function getJobStatus(taskId: string) {
  const jobId = `task:${taskId}`;
  const job = await taskQueue.getJob(jobId);

  if (!job) {
    return { jobId, taskId, state: "not_found", progress: 0 };
  }

  const state = await job.getState();
  const progress = job.progress as number;

  return {
    jobId: job.id,
    taskId,
    state,
    progress,
    attemptsMade: job.attemptsMade,
    maxAttempts: job.opts.attempts,
    failedReason: job.failedReason ?? null,
    processedOn: job.processedOn ? new Date(job.processedOn).toISOString() : null,
    finishedOn: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
    result: job.returnvalue ?? null,
  };
}

// ── Retry ────────────────────────────────────────────────────────────────────

export async function retryJob(taskId: string) {
  const jobId = `task:${taskId}`;
  const job = await taskQueue.getJob(jobId);

  if (!job) throw notFound("Job");

  const state = await job.getState();
  if (state !== "failed") {
    throw badRequest(`Job is in state "${state}" — only failed jobs can be retried`);
  }

  await job.retry();
  logger.info("Job manually retried", { jobId, taskId });

  return { jobId, taskId, status: "retried" };
}

// ── Metrics ──────────────────────────────────────────────────────────────────

export async function getQueueMetrics() {
  const counts = await taskQueue.getJobCounts(
    "waiting",
    "active",
    "completed",
    "failed",
    "delayed",
    "paused",
  );

  return {
    queue: taskQueue.name,
    counts,
    total: Object.values(counts).reduce((sum, n) => sum + n, 0),
  };
}
