import { webConfig } from "./config";
import { auth } from "./firebase";
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

const BASE = webConfig.apiUrl;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    headers,
    ...init,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string; error?: string }).detail ?? (body as { error?: string }).error ?? `Request failed: ${res.status}`);
  }

  // 204 No Content — return undefined
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  projects: {
    list: () => request<Project[]>("/api/projects/"),
    get: (id: string) => request<Project>(`/api/projects/${id}`),
    create: (data: CreateProjectPayload) =>
      request<Project>("/api/projects/", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: CreateProjectPayload) =>
      request<Project>(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<void>(`/api/projects/${id}`, { method: "DELETE" }),
  },
  tasks: {
    list: (projectId?: string) =>
      request<Task[]>(`/api/tasks/${projectId ? `?projectId=${projectId}` : ""}`),
    listWithDeps: (projectId: string) =>
      request<Task[]>(`/api/tasks/?projectId=${projectId}`),
    get: (id: string) => request<Task>(`/api/tasks/${id}`),
    create: (data: CreateTaskPayload) =>
      request<Task>("/api/tasks/", { method: "POST", body: JSON.stringify(data) }),
    updateStatus: (id: string, status: Task["status"]) =>
      request<Task>(`/api/tasks/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    assign: (id: string, assignedTo: string) =>
      request<Task>(`/api/tasks/${id}/assign`, {
        method: "PATCH",
        body: JSON.stringify({ assignedTo }),
      }),
    delete: (id: string) =>
      request<void>(`/api/tasks/${id}`, { method: "DELETE" }),
  },
  ai: {
    generatePlan: (data: GeneratePlanPayload) =>
      request<AiPlanResult>("/api/ai/generate-plan", { method: "POST", body: JSON.stringify(data) }),
  },
  agents: {
    run: (data: { taskId: string; pipeline: boolean; agentType?: string }) =>
      request<any>("/api/agents/run", { method: "POST", body: JSON.stringify(data) }),
  },
  observe: {
    summary: (projectId?: string) => {
      const qs = projectId ? `?projectId=${projectId}` : "";
      return request<SummaryStats>(`/api/observe/summary${qs}`);
    },
    logs: (params?: Record<string, string>) => {
      const qs = params ? "?" + new URLSearchParams(params).toString() : "";
      return request<{ logs: ObsLog[]; nextCursor: string | null }>(`/api/observe/logs${qs}`);
    },
    agents: (limit?: number, projectId?: string) => {
      const params = new URLSearchParams();
      if (limit) params.set("limit", limit.toString());
      if (projectId) params.set("projectId", projectId);
      const qs = params.toString() ? `?${params.toString()}` : "";
      return request<AgentRunRow[]>(`/api/observe/agents${qs}`);
    },
    timeline: (projectId?: string) =>
      request<TimelineRow[]>(`/api/observe/timeline${projectId ? `?projectId=${projectId}` : ""}`),
    errors: (limit?: number, projectId?: string) => {
      const params = new URLSearchParams();
      if (limit) params.set("limit", limit.toString());
      if (projectId) params.set("projectId", projectId);
      const qs = params.toString() ? `?${params.toString()}` : "";
      return request<ObsLog[]>(`/api/observe/errors${qs}`);
    },
  },
  files: {
    list: (projectId: string) =>
      request<ProjectFile[]>(`/api/files/?projectId=${projectId}`),
    get: (id: string) => request<ProjectFile>(`/api/files/${id}`),
    create: (data: CreateFilePayload) =>
      request<ProjectFile>("/api/files/", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: UpdateFilePayload) =>
      request<ProjectFile>(`/api/files/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    rename: (id: string, data: RenameFilePayload) =>
      request<ProjectFile>(`/api/files/${id}/rename`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<void>(`/api/files/${id}`, { method: "DELETE" }),
    listVersions: (id: string) =>
      request<FileVersionMeta[]>(`/api/files/${id}/versions`),
    getVersion: (_id: string, versionId: string) =>
      request<FileVersion>(`/api/files/versions/${versionId}`),
    restoreVersion: (id: string, versionId: string) =>
      request<ProjectFile>(`/api/files/${id}/versions/${versionId}/restore`, { method: "POST" }),
    download: (projectId: string) => {
      // Direct download - returns blob
      window.open(`${BASE}/api/files/download/${projectId}`, '_blank');
    },
  },
  cicd: {
    trigger: (projectId: string, taskId?: string, creds?: { githubToken: string; vercelToken: string; repoName: string; vercelOrgId?: string }) =>
      request<{ message: string }>("/api/cicd/deploy", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          taskId,
          githubToken: creds?.githubToken ?? "",
          vercelToken: creds?.vercelToken ?? "",
          repoName: creds?.repoName ?? "",
          vercelOrgId: creds?.vercelOrgId ?? null,
        }),
      }),
    list: (projectId: string) =>
      request<Deployment[]>(`/api/cicd/deployments?projectId=${projectId}`),
    get: (id: string) => request<Deployment>(`/api/cicd/deployments/${id}`),
  },
  dev: {
    chat: (data: {
      instruction: string;
      fileContent: string;
      filePath: string;
      language: string;
      projectId: string;
      conversationHistory: { role: string; content: string }[];
    }) => request<{ explanation: string; editedCode: string; changes: string[] }>(
      "/api/dev/chat", { method: "POST", body: JSON.stringify(data) }
    ),
    apply: (fileId: string, newContent: string) =>
      request<ProjectFile>("/api/dev/apply", {
        method: "POST",
        body: JSON.stringify({ fileId, newContent }),
      }),
  },
  admin: {
    stats: () => request<import("@/types").SystemStats>("/api/admin/stats"),
    projects: () => request<Array<Project & { ownerEmail: string; taskCount: number; completedTasks: number }>>("/api/admin/projects"),
    deleteProject: (id: string) => request<void>(`/api/admin/projects/${id}`, { method: "DELETE" }),
    users: () => request<Array<{ id: string; uid: string; email: string; role: string; createdAt: string; projectCount: number }>>("/api/admin/users"),
    auditLogs: (limit?: number, userId?: string) => {
      const params = new URLSearchParams();
      if (limit) params.set("limit", limit.toString());
      if (userId) params.set("userId", userId);
      return request<Array<{ id: string; userId: string; email: string; role: string; action: string; meta: Record<string, any>; createdAt: string }>>(
        `/api/admin/audit-logs${params.toString() ? `?${params.toString()}` : ""}`
      );
    },
    tokenUsage: () => request<import("@/types").UserTokenUsage[]>("/api/admin/token-usage"),
    userTokenCalls: (uid: string) => request<Array<{ id: string; source: string; agentType: string; prompt: string; tokensUsed: number; status: string; durationMs: number; createdAt: string }>>(`/api/admin/token-usage/${uid}`),
    userActivity: (uid: string) => request<{ uid: string; email: string; role: string; createdAt: string; stats: { projectCount: number; taskCount: number; actionCount: number; agentRuns: number; totalTokens: number }; activity: Array<{ id: string; action: string; meta: Record<string, any>; createdAt: string }> }>(`/api/admin/users/${uid}/activity`),
    userProjects: (uid: string) => request<Array<{ id: string; name: string; description: string; language: string; createdAt: string; updatedAt: string; taskCount: number; completedTasks: number }>>(`/api/admin/users/${uid}/projects`),
    deleteUserProject: (uid: string, projectId: string) => request<void>(`/api/admin/users/${uid}/projects/${projectId}`, { method: "DELETE" }),
    changeRole: (uid: string, role: string) => request<{ uid: string; role: string }>(`/api/admin/users/${uid}/role`, { method: "PATCH", body: JSON.stringify({ role }) }),
    deleteUser: (uid: string) => request<void>(`/api/admin/users/${uid}`, { method: "DELETE" }),
    setTokenLimit: (uid: string, limit: number) => request<{ uid: string; tokenLimit: number }>(`/api/admin/users/${uid}/token-limit`, { method: "PATCH", body: JSON.stringify({ limit }) }),
    sendAlert: (message: string, type: string, targetUid?: string) => request<import("@/types").Alert>("/api/admin/alerts", { method: "POST", body: JSON.stringify({ message, type, targetUid: targetUid ?? null }) }),
    alerts: () => request<import("@/types").Alert[]>("/api/admin/alerts"),
    deleteAlert: (id: string) => request<void>(`/api/admin/alerts/${id}`, { method: "DELETE" }),
  },
  profile: {
    myAlerts: () => request<import("@/types").Alert[]>("/api/admin/my-alerts"),
    myTokenUsage: () => request<import("@/types").UserTokenUsage>("/api/admin/my-token-usage"),
    deleteAccount: () => request<void>("/api/admin/me", { method: "DELETE" }),
  },
};
