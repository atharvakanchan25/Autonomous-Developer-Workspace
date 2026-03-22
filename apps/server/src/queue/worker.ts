import "dotenv/config";
import { Worker, Job, UnrecoverableError } from "bullmq";
import { redisConnectionOptions } from "../lib/redis";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { QUEUE_NAME, TaskJobData, TaskJobResult } from "./queue";

// ── Task processor ───────────────────────────────────────────────────────────

async function processTask(job: Job<TaskJobData, TaskJobResult>): Promise<TaskJobResult> {
  const { taskId, projectId, title } = job.data;
  const startedAt = Date.now();

  logger.info("Task job started", {
    jobId: job.id,
    taskId,
    projectId,
    title,
    attempt: job.attemptsMade + 1,
    maxAttempts: job.opts.attempts,
  });

  // ── 1. Transition: PENDING → IN_PROGRESS ──────────────────────────────────
  const task = await prisma.task.findUnique({ where: { id: taskId } });

  if (!task) {
    // Task deleted between enqueue and processing — no point retrying
    throw new UnrecoverableError(`Task ${taskId} not found in database`);
  }

  if (task.status === "COMPLETED") {
    logger.warn("Task already completed, skipping", { jobId: job.id, taskId });
    return {
      taskId,
      status: "COMPLETED",
      processedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
    };
  }

  await prisma.task.update({
    where: { id: taskId },
    data: { status: "IN_PROGRESS" },
  });

  await job.updateProgress(10);
  logger.info("Task marked IN_PROGRESS", { jobId: job.id, taskId });

  // ── 2. Simulate async work (replace with real logic) ──────────────────────
  // In production: call an LLM, run a build, deploy, etc.
  await job.updateProgress(50);
  await simulateWork(job);
  await job.updateProgress(90);

  // ── 3. Transition: IN_PROGRESS → COMPLETED ────────────────────────────────
  await prisma.task.update({
    where: { id: taskId },
    data: { status: "COMPLETED" },
  });

  await job.updateProgress(100);

  const durationMs = Date.now() - startedAt;
  logger.info("Task job completed", { jobId: job.id, taskId, durationMs });

  return {
    taskId,
    status: "COMPLETED",
    processedAt: new Date().toISOString(),
    durationMs,
  };
}

// Simulates async work — replace with real task execution logic
async function simulateWork(_job: Job<TaskJobData>): Promise<void> {
  const delay = 1000 + Math.random() * 2000; // 1–3 s
  await new Promise((resolve) => setTimeout(resolve, delay));

  // Simulate ~10% failure rate to exercise retry logic
  if (Math.random() < 0.1) {
    throw new Error("Simulated transient failure — will retry");
  }
}

// ── Worker instance ──────────────────────────────────────────────────────────

const worker = new Worker<TaskJobData, TaskJobResult>(QUEUE_NAME, processTask, {
  connection: redisConnectionOptions,
  concurrency: 5,
  limiter: {
    max: 20,          // max 20 jobs
    duration: 10_000, // per 10 seconds
  },
});

// ── Event hooks ──────────────────────────────────────────────────────────────

worker.on("active", (job) => {
  logger.info("Job active", { jobId: job.id, taskId: job.data.taskId });
});

worker.on("progress", (job, progress) => {
  logger.debug("Job progress", { jobId: job.id, taskId: job.data.taskId, progress });
});

worker.on("completed", (job, result) => {
  logger.info("Job completed", {
    jobId: job.id,
    taskId: result.taskId,
    durationMs: result.durationMs,
  });
});

worker.on("failed", async (job, err) => {
  if (!job) return;

  const isLastAttempt = job.attemptsMade >= (job.opts.attempts ?? 1);

  logger.error("Job failed", {
    jobId: job.id,
    taskId: job.data.taskId,
    attempt: job.attemptsMade,
    maxAttempts: job.opts.attempts,
    willRetry: !isLastAttempt,
    error: err.message,
  });

  // Only mark FAILED in DB on the final attempt — intermediate failures retry
  if (isLastAttempt) {
    try {
      await prisma.task.update({
        where: { id: job.data.taskId },
        data: { status: "FAILED" },
      });
      logger.warn("Task marked FAILED after exhausting retries", {
        jobId: job.id,
        taskId: job.data.taskId,
      });
    } catch (dbErr) {
      logger.error("Failed to update task status to FAILED", {
        taskId: job.data.taskId,
        error: (dbErr as Error).message,
      });
    }
  }
});

worker.on("stalled", (jobId: string) => {
  logger.warn("Job stalled — will be re-queued", { jobId });
});

worker.on("error", (err) => {
  logger.error("Worker error", { error: err.message, stack: err.stack });
});

// ── Graceful shutdown ────────────────────────────────────────────────────────

async function shutdown(signal: string) {
  logger.info(`Worker received ${signal} — shutting down gracefully`);
  await worker.close();
  await prisma.$disconnect();
  logger.info("Worker shut down cleanly");
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// ── Startup ──────────────────────────────────────────────────────────────────

logger.info("Task worker started", {
  queue: QUEUE_NAME,
  concurrency: 5,
  pid: process.pid,
});

export default worker;
