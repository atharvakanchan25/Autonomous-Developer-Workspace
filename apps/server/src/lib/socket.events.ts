import type { TaskStatus } from "@prisma/client";

// ── Server → Client events ────────────────────────────────────────────────────

export interface TaskUpdatedPayload {
  taskId: string;
  projectId: string;
  status: TaskStatus;
  title: string;
  updatedAt: string;
}

export interface AgentLogPayload {
  taskId: string;
  projectId: string;
  agentRunId: string;
  agentType: string;
  level: "info" | "warn" | "error";
  message: string;
  meta?: Record<string, unknown>;
  timestamp: string;
}

export interface JobProgressPayload {
  taskId: string;
  projectId: string;
  jobId: string;
  progress: number;
}

export interface PipelineStagePayload {
  taskId: string;
  projectId: string;
  agentType: string;
  stage: "started" | "completed" | "failed";
  durationMs?: number;
  summary?: string;
  error?: string;
  timestamp: string;
}

// ── Typed maps for Socket.io generics ────────────────────────────────────────

export interface ServerToClientEvents {
  "task:updated": (payload: TaskUpdatedPayload) => void;
  "agent:log": (payload: AgentLogPayload) => void;
  "job:progress": (payload: JobProgressPayload) => void;
  "pipeline:stage": (payload: PipelineStagePayload) => void;
}

export interface ClientToServerEvents {
  "room:join": (projectId: string) => void;
  "room:leave": (projectId: string) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  projectIds: string[];
}
