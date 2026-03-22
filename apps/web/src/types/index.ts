export type TaskStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED";

export interface Project {
  id: string;
  name: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { tasks: number };
}

export interface TaskDep {
  id: string;
  title: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  order: number;
  projectId: string;
  project?: { id: string; name: string };
  dependsOn?: TaskDep[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectPayload {
  name: string;
  description?: string;
}

export interface CreateTaskPayload {
  title: string;
  description?: string;
  projectId: string;
  status?: TaskStatus;
}

export interface DagNode {
  key: string;
  title: string;
  order: number;
}

export interface DagEdge {
  from: string;
  to: string;
}

export interface AiPlanResult {
  project: { id: string; name: string };
  tasks: Task[];
  dag: { nodes: DagNode[]; edges: DagEdge[] };
  meta: { taskCount: number };
}

export interface GeneratePlanPayload {
  projectId: string;
  description: string;
}

// ── Observability ─────────────────────────────────────────────────────────────

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";
export type AgentRunStatus = "RUNNING" | "COMPLETED" | "FAILED";
export type AgentType = "CODE_GENERATOR" | "TEST_GENERATOR" | "CODE_REVIEWER";

export interface ObsLog {
  id: string;
  level: LogLevel;
  source: string;
  message: string;
  taskId?: string | null;
  projectId?: string | null;
  agentRunId?: string | null;
  agentType?: string | null;
  durationMs?: number | null;
  meta?: string | null;
  createdAt: string;
}

export interface AgentRunRow {
  id: string;
  agentType: AgentType;
  status: AgentRunStatus;
  durationMs?: number | null;
  errorMsg?: string | null;
  createdAt: string;
  updatedAt: string;
  task: { id: string; title: string; projectId: string };
}

export interface TimelineStage {
  id: string;
  agentType: AgentType;
  status: AgentRunStatus;
  durationMs?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface TimelineRow {
  taskId: string;
  title: string;
  status: TaskStatus;
  project: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
  totalDurationMs: number;
  stages: TimelineStage[];
}

// ── File editor ───────────────────────────────────────────────────────────────

export interface ProjectFile {
  id: string;
  projectId: string;
  path: string;
  name: string;
  language: string;
  content: string;
  size: number;
  createdAt: string;
  updatedAt: string;
  _count?: { versions: number };
}

export interface FileVersion {
  id: string;
  fileId: string;
  content: string;
  size: number;
  label?: string | null;
  createdAt: string;
}

export interface FileVersionMeta {
  id: string;
  size: number;
  label?: string | null;
  createdAt: string;
}

export interface CreateFilePayload {
  projectId: string;
  path: string;
  name: string;
  language?: string;
  content?: string;
}

export interface UpdateFilePayload {
  content: string;
  createVersion?: boolean;
  versionLabel?: string;
}

export interface RenameFilePayload {
  path: string;
  name: string;
}

// ── CI/CD ─────────────────────────────────────────────────────────────────────

export type DeploymentStatus = "PENDING" | "RUNNING" | "SUCCESS" | "FAILED";

export interface CicdStageLog {
  stage: string;
  status: "running" | "passed" | "failed" | "skipped";
  durationMs?: number;
  detail?: string;
}

export interface Deployment {
  id: string;
  projectId: string;
  taskId?: string | null;
  status: DeploymentStatus;
  testDurationMs?: number | null;
  buildDurationMs?: number | null;
  previewUrl?: string | null;
  errorMsg?: string | null;
  log: CicdStageLog[];
  createdAt: string;
  updatedAt: string;
}

export interface SummaryStats {
  tasks: {
    total: number;
    byStatus: Partial<Record<TaskStatus, number>>;
  };
  agentRuns: {
    total: number;
    byStatus: Partial<Record<AgentRunStatus, number>>;
    avgDurationMs: number;
  };
  errors: {
    total: number;
    recent: Array<{ id: string; message: string; source: string; createdAt: string; agentType?: string | null }>;
  };
}
