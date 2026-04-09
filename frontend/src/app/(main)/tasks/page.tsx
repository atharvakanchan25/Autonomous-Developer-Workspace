"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import { useProjectStore } from "@/lib/useProjectStore";
import { useAuth } from "@/lib/useAuth";
import { AdminOnlyToast } from "@/components/AdminOnlyToast";
import type { Project, Task, TaskStatus } from "@/types";
import { PageShell } from "@/components/PageShell";
import { StatusBadge } from "@/components/StatusBadge";
import { CountUp } from "@/components/ui/CountUp";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { duration, ease, buttonTap, staggerContainer, fadeUp } from "@/lib/motion";

const ALL_STATUSES: TaskStatus[] = ["PENDING", "IN_PROGRESS", "COMPLETED", "FAILED"];

export default function TasksPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectIdParam = searchParams.get("projectId") ?? "";
  const { projectId: storedId, setProjectId } = useProjectStore();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [adminToast, setAdminToast] = useState(false);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

  useEffect(() => { api.projects.list().then(setProjects).catch(() => null); }, []);
  useEffect(() => { loadTasks(projectIdParam); }, [projectIdParam, loadTasks]);

  function handleProjectFilter(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    setProjectId(val);
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
      await api.tasks.create({ title: title.trim(), description: taskDesc.trim() || undefined, projectId: taskProjectId });
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

  async function handleStatusChange(task: Task, status: TaskStatus) {
    // Non-admins can only update their own tasks
    if (!isAdmin && task.ownerId !== user?.uid) {
      setAdminToast(true);
      return;
    }
    try {
      const updated = await api.tasks.updateStatus(task.id, status);
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
    } catch { /* silent */ }
  }

  const activeProject = projects.find((p) => p.id === projectIdParam);
  const counts = ALL_STATUSES.reduce((acc, s) => ({ ...acc, [s]: tasks.filter((t) => t.status === s).length }), {} as Record<TaskStatus, number>);

  return (
    <PageShell>
      {/* Top bar */}
      <header className="app-topbar flex h-20 shrink-0 items-center justify-between px-8">
        <div className="flex items-center gap-3">
          <h1 className="app-title text-2xl font-semibold text-gray-100">Tasks</h1>
          {activeProject && (
            <span className="app-chip rounded-full px-2.5 py-1 text-xs">
              {activeProject.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <select
            value={projectIdParam}
            onChange={handleProjectFilter}
            className="app-input rounded-2xl px-3.5 py-2 text-xs"
          >
            <option value="">All projects</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button
            onClick={() => setShowForm((v) => !v)}
            className={`flex items-center gap-1.5 rounded-2xl px-4 py-3 text-sm font-semibold transition-colors ${
              showForm ? "app-button-secondary" : "app-button-primary"
            }`}
          >
            {showForm ? "Cancel" : "+ New task"}
          </button>
        </div>
      </header>

      <main className="flex-1 px-8 py-8">
        {/* Status summary */}
        {tasks.length > 0 && (
          <motion.div
            className="mb-6 flex gap-3"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            {ALL_STATUSES.map((s) => {
              const bg = s === "COMPLETED" ? "border-emerald-900/40 bg-[#040a08]/90" : 
                         s === "FAILED" ? "border-pink-900/40 bg-[#0a0406]/90" :
                         s === "IN_PROGRESS" ? "border-cyan-900/40 bg-[#04080a]/90" :
                         "border-gray-800 bg-[#050505]/90";
              const textColor = s === "COMPLETED" ? "text-emerald-400" :
                                s === "FAILED" ? "text-pink-400" :
                                s === "IN_PROGRESS" ? "text-cyan-400" :
                                "text-gray-400";
              return (
                <motion.div key={s} variants={fadeUp} className="flex-1">
                  <SpotlightCard className={`app-panel-soft h-full rounded-[24px] px-4 py-4 text-center border ${bg}`}>
                    <p className={`text-xl font-bold ${textColor}`}>
                      <CountUp to={counts[s]} duration={1.2} />
                    </p>
                    <p className="text-[10px] uppercase font-medium tracking-wider text-gray-500 mt-1.5">{s.replace("_", " ")}</p>
                  </SpotlightCard>
                </motion.div>
              );
            })}
          </motion.div>
        )}

        {/* Create form */}
        <AnimatePresence>
        {showForm && (
          <motion.form
            onSubmit={handleCreate}
            className="app-panel mb-6 overflow-hidden rounded-[28px] p-6"
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: "auto", marginBottom: 24 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            transition={{ duration: duration.standard, ease: ease.enter }}
          >
            <h2 className="app-title mb-5 text-xl font-semibold text-gray-100">New task</h2>
            <div className="mb-4">
              <label className="mb-1.5 block text-xs font-medium text-gray-400">Title <span className="text-red-400">*</span></label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Task title"
                className="app-input w-full rounded-2xl px-3.5 py-3 text-sm"
              />
            </div>
            <div className="mb-4">
              <label className="mb-1.5 block text-xs font-medium text-gray-400">Description</label>
              <textarea
                rows={2}
                value={taskDesc}
                onChange={(e) => setTaskDesc(e.target.value)}
                placeholder="Optional description"
                className="app-input w-full resize-none rounded-2xl px-3.5 py-3 text-sm"
              />
            </div>
            <div className="mb-5">
              <label className="mb-1.5 block text-xs font-medium text-gray-400">Project <span className="text-red-400">*</span></label>
              <select
                value={taskProjectId}
                onChange={(e) => setTaskProjectId(e.target.value)}
                className="app-input w-full rounded-2xl px-3.5 py-3 text-sm"
              >
                <option value="">Select a project</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            {createError && <p className="mb-3 text-xs text-red-400">{createError}</p>}
            <motion.button
              type="submit"
              disabled={creating || !title.trim() || !taskProjectId}
              className="app-button-primary rounded-2xl px-5 py-3 text-sm font-semibold disabled:opacity-50"
              whileTap={buttonTap}
              transition={{ duration: duration.fast }}
            >
              {creating ? "Creating…" : "Create task"}
            </motion.button>
          </motion.form>
        )}
        </AnimatePresence>

        {error && <div className="mb-4 rounded-lg border border-red-900 bg-red-950/90 px-4 py-3 text-sm text-red-300">{error}</div>}

        {loading ? (
          <div className="flex items-center gap-2 py-12 text-sm text-gray-500">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-700 border-t-gray-400" />
            Loading tasks…
          </div>
        ) : tasks.length === 0 ? (
          <div className="app-empty rounded-[28px] py-16 text-center">
            <p className="text-sm text-gray-500">No tasks found.</p>
          </div>
        ) : (
          <div className="app-panel overflow-hidden rounded-[28px]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/5">
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-400">#</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-400">Title</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-400">Project</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-400">Status</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-400">Update</th>
                </tr>
              </thead>
              <motion.tbody
                className="divide-y divide-white/10"
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
              >
                {tasks.map((task) => (
                  <motion.tr key={task.id} variants={fadeUp} className="transition-colors hover:bg-white/5">
                    <td className="px-5 py-3.5 text-xs text-gray-500">{task.order}</td>
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-gray-100">{task.title}</p>
                      {task.description && (
                        <p className="mt-0.5 line-clamp-1 text-xs text-gray-400">{task.description}</p>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-gray-400">{task.project?.name ?? "—"}</td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={task.status} />
                    </td>
                    <td className="px-5 py-3.5">
                      <select
                        value={task.status}
                        onChange={(e) => handleStatusChange(task, e.target.value as TaskStatus)}
                        disabled={!isAdmin && task.ownerId !== user?.uid}
                        className="app-input rounded-xl px-2.5 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-40"
                        title={!isAdmin && task.ownerId !== user?.uid ? "Only admins can update other users' tasks" : undefined}
                      >
                        {ALL_STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                      </select>
                    </td>
                  </motion.tr>
                ))}
              </motion.tbody>
            </table>
          </div>
        )}
      </main>

      <AdminOnlyToast
        show={adminToast}
        onClose={() => setAdminToast(false)}
        message="You can only update status on your own tasks."
      />
    </PageShell>
  );
}
