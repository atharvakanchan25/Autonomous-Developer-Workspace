import { EventEmitter } from "events";

export interface TaskJobData {
  taskId: string;
  projectId: string;
  title: string;
}

export interface TaskJobResult {
  taskId: string;
  status: "COMPLETED" | "FAILED";
  processedAt: string;
  durationMs: number;
}

export interface Job {
  id: string;
  data: TaskJobData;
  state: "waiting" | "active" | "completed" | "failed";
  progress: number;
  result?: TaskJobResult;
  failedReason?: string;
  processedOn?: number;
  finishedOn?: number;
  attemptsMade: number;
}

// lightweight in-memory queue — no Redis needed
// for production scale, swap this out for a proper queue (BullMQ, Cloud Tasks, etc.)
class InMemoryQueue extends EventEmitter {
  readonly name = "task-queue";
  private jobs = new Map<string, Job>();

  async add(jobId: string, data: TaskJobData): Promise<Job> {
    // idempotent — don't re-queue a job that's already running or waiting
    const existing = this.jobs.get(jobId);
    if (existing && existing.state !== "failed") return existing;

    const job: Job = { id: jobId, data, state: "waiting", progress: 0, attemptsMade: 0 };
    this.jobs.set(jobId, job);
    this.emit("job:added", job);
    return job;
  }

  async getJob(jobId: string): Promise<Job | null> {
    return this.jobs.get(jobId) ?? null;
  }

  updateJob(jobId: string, updates: Partial<Job>): void {
    const job = this.jobs.get(jobId);
    if (job) this.jobs.set(jobId, { ...job, ...updates });
  }

  async getJobCounts(): Promise<Record<"waiting" | "active" | "completed" | "failed", number>> {
    const counts = { waiting: 0, active: 0, completed: 0, failed: 0 };
    for (const job of this.jobs.values()) {
      if (job.state in counts) counts[job.state as keyof typeof counts]++;
    }
    return counts;
  }

  async close(): Promise<void> {
    // nothing to tear down for an in-memory queue
  }
}

export const taskQueue = new InMemoryQueue();
