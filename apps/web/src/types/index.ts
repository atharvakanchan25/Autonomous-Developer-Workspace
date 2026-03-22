export type TaskStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED";

export interface Project {
  id: string;
  name: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { tasks: number };
}

export interface Task {
  id: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  projectId: string;
  project?: { id: string; name: string };
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
