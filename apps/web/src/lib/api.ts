import type {
  Project,
  Task,
  CreateProjectPayload,
  CreateTaskPayload,
  AiPlanResult,
  GeneratePlanPayload,
  SummaryStats,
  ObsLog,
  AgentRunRow,
  TimelineRow,
  ProjectFile,
  FileVersionMeta,
  FileVersion,
  CreateFilePayload,
  UpdateFilePayload,
  RenameFilePayload,
  Deployment,
} from "@/types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Request failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export const api = {
  projects: {
    list: () => request<Project[]>("/api/projects"),
    get: (id: string) => request<Project>(`/api/projects/${id}`),
    create: (data: CreateProjectPayload) =>
      request<Project>("/api/projects", { method: "POST", body: JSON.stringify(data) }),
  },
  tasks: {
    list: (projectId?: string) =>
      request<Task[]>(`/api/tasks${projectId ? `?projectId=${projectId}` : ""}`),
    listWithDeps: (projectId: string) =>
      request<Task[]>(`/api/tasks?projectId=${projectId}`),
    get: (id: string) => request<Task>(`/api/tasks/${id}`),
    create: (data: CreateTaskPayload) =>
      request<Task>("/api/tasks", { method: "POST", body: JSON.stringify(data) }),
    updateStatus: (id: string, status: Task["status"]) =>
      request<Task>(`/api/tasks/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
  },
  ai: {
    generatePlan: (data: GeneratePlanPayload) =>
      request<AiPlanResult>("/api/ai/plan", { method: "POST", body: JSON.stringify(data) }),
  },
  observe: {
    summary: () => request<SummaryStats>("/api/observe/summary"),
    logs: (params?: Record<string, string>) => {
      const qs = params ? "?" + new URLSearchParams(params).toString() : "";
      return request<{ logs: ObsLog[]; nextCursor: string | null }>(`/api/observe/logs${qs}`);
    },
    agents: (limit?: number) =>
      request<AgentRunRow[]>(`/api/observe/agents${limit ? `?limit=${limit}` : ""}`),
    timeline: (projectId?: string) =>
      request<TimelineRow[]>(`/api/observe/timeline${projectId ? `?projectId=${projectId}` : ""}`),
    errors: (limit?: number) =>
      request<ObsLog[]>(`/api/observe/errors${limit ? `?limit=${limit}` : ""}`),
  },
  files: {
    list: (projectId: string) =>
      request<ProjectFile[]>(`/api/files?projectId=${projectId}`),
    get: (id: string) => request<ProjectFile>(`/api/files/${id}`),
    create: (data: CreateFilePayload) =>
      request<ProjectFile>("/api/files", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: UpdateFilePayload) =>
      request<ProjectFile>(`/api/files/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    rename: (id: string, data: RenameFilePayload) =>
      request<ProjectFile>(`/api/files/${id}/rename`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<void>(`/api/files/${id}`, { method: "DELETE" }),
    listVersions: (id: string) =>
      request<FileVersionMeta[]>(`/api/files/${id}/versions`),
    getVersion: (id: string, versionId: string) =>
      request<FileVersion>(`/api/files/${id}/versions/${versionId}`),
    restoreVersion: (id: string, versionId: string) =>
      request<ProjectFile>(`/api/files/${id}/versions/${versionId}/restore`, { method: "POST" }),
  },
  cicd: {
    trigger: (projectId: string, taskId?: string) =>
      request<{ message: string }>("/api/cicd/deploy", {
        method: "POST",
        body: JSON.stringify({ projectId, taskId }),
      }),
    list: (projectId: string) =>
      request<Deployment[]>(`/api/cicd/deployments?projectId=${projectId}`),
    get: (id: string) => request<Deployment>(`/api/cicd/deployments/${id}`),
  },
};
