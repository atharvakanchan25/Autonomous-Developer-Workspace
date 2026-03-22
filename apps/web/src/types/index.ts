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
