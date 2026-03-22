import type {
  Project,
  Task,
  CreateProjectPayload,
  CreateTaskPayload,
  AiPlanResult,
  GeneratePlanPayload,
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
    // Fetches tasks with their dependsOn relations included
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
};
