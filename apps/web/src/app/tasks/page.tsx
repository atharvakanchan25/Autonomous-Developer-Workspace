"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Project, Task, TaskStatus } from "@/types";
import { StatusBadge } from "@/components/StatusBadge";
import { Spinner, EmptyState, ErrorMessage } from "@/components/Feedback";

const ALL_STATUSES: TaskStatus[] = ["PENDING", "IN_PROGRESS", "COMPLETED", "FAILED"];

export default function TasksPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectIdParam = searchParams.get("projectId") ?? "";

  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create form
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [taskDesc, setTaskDesc] = useState("");
  const [taskProjectId, setTaskProjectId] = useState(projectIdParam);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const loadTasks = useCallback(async (pid: string) => {
    setLoading(true);
    setError(null);
    try {
      setTasks(await api.tasks.list(pid || undefined));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    api.projects.list().then(setProjects).catch(() => null);
  }, []);

  useEffect(() => {
    loadTasks(projectIdParam);
  }, [projectIdParam, loadTasks]);

  function handleProjectFilter(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    const params = new URLSearchParams(searchParams.toString());
    if (val) params.set("projectId", val);
    else params.delete("projectId");
    router.push(`/tasks?${params.toString()}`);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !taskProjectId) return;
    setCreating(true);
    setCreateError(null);
    try {
      await api.tasks.create({
        title: title.trim(),
        description: taskDesc.trim() || undefined,
        projectId: taskProjectId,
      });
      setTitle("");
      setTaskDesc("");
      setShowForm(false);
      await loadTasks(projectIdParam);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create task");
    } finally {
      setCreating(false);
    }
  }

  async function handleStatusChange(taskId: string, status: TaskStatus) {
    try {
      const updated = await api.tasks.updateStatus(taskId, status);
      setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
    } catch {
      // silently revert — could add toast here
    }
  }

  const activeProject = projects.find((p) => p.id === projectIdParam);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Tasks</h1>
          {activeProject && (
            <p className="mt-0.5 text-sm text-gray-500">in {activeProject.name}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* Project filter */}
          <select
            value={projectIdParam}
            onChange={handleProjectFilter}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 focus:border-gray-500 focus:outline-none"
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            {showForm ? "Cancel" : "+ New task"}
          </button>
        </div>
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="mb-8 rounded-lg border border-gray-200 bg-gray-50 p-5"
        >
          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-gray-600">Title *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
            />
          </div>
          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-gray-600">Description</label>
            <textarea
              rows={2}
              value={taskDesc}
              onChange={(e) => setTaskDesc(e.target.value)}
              placeholder="Optional description"
              className="w-full resize-none rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
            />
          </div>
          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium text-gray-600">Project *</label>
            <select
              value={taskProjectId}
              onChange={(e) => setTaskProjectId(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
            >
              <option value="">Select a project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          {createError && <ErrorMessage message={createError} />}
          <button
            type="submit"
            disabled={creating || !title.trim() || !taskProjectId}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create task"}
          </button>
        </form>
      )}

      {error && <ErrorMessage message={error} />}

      {loading ? (
        <Spinner />
      ) : tasks.length === 0 ? (
        <EmptyState message="No tasks found. Create one to get started." />
      ) : (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
          {tasks.map((task) => (
            <li key={task.id} className="px-5 py-4 hover:bg-gray-50">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">{task.title}</p>
                  {task.description && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{task.description}</p>
                  )}
                  {task.project && (
                    <p className="mt-1 text-xs text-gray-400">{task.project.name}</p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <StatusBadge status={task.status} />
                  <select
                    value={task.status}
                    onChange={(e) => handleStatusChange(task.id, e.target.value as TaskStatus)}
                    className="rounded border border-gray-200 px-1.5 py-0.5 text-xs text-gray-600 focus:outline-none"
                  >
                    {ALL_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s.replace("_", " ")}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
