import { Queue, QueueEvents } from "bullmq";
import { redisConnectionOptions } from "../lib/redis";

export const QUEUE_NAME = "task-queue";

// ── Job payload ──────────────────────────────────────────────────────────────
export interface TaskJobData {
  taskId: string;
  projectId: string;
  title: string;
  attempt: number;
}

// ── Job result ───────────────────────────────────────────────────────────────
export interface TaskJobResult {
  taskId: string;
  status: "COMPLETED" | "FAILED";
  processedAt: string;
  durationMs: number;
}

// ── Queue singleton ──────────────────────────────────────────────────────────
export const taskQueue = new Queue<TaskJobData, TaskJobResult>(QUEUE_NAME, {
  connection: redisConnectionOptions,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000, // 2s → 4s → 8s
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
  },
});

// ── Queue events (used by queue.service for metrics) ────────────────────────
export const taskQueueEvents = new QueueEvents(QUEUE_NAME, {
  connection: redisConnectionOptions,
});
