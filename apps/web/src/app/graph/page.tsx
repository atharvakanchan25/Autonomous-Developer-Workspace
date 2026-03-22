"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { api } from "@/lib/api";
import { useTaskGraph } from "@/lib/useTaskGraph";
import type { Project, TaskStatus } from "@/types";
import { STATUS_STYLES } from "@/components/graph/TaskNode";
import { Spinner, ErrorMessage } from "@/components/Feedback";
import { AgentLogFeed } from "@/components/AgentLogFeed";

const TaskGraph = dynamic(
  () => import("@/components/graph/TaskGraph").then((m) => m.TaskGraph),
  { ssr: false, loading: () => <Spinner /> },
);

const LEGEND: { status: TaskStatus; label: string }[] = [
  { status: "PENDING", label: "Pending" },
  { status: "IN_PROGRESS", label: "In Progress" },
  { status: "COMPLETED", label: "Completed" },
  { status: "FAILED", label: "Failed" },
];

const SOCKET_STATUS_STYLES = {
  connected: { dot: "bg-green-500", ping: "bg-green-400", label: "Live" },
  connecting: { dot: "bg-yellow-500", ping: "bg-yellow-400", label: "Connecting…" },
  disconnected: { dot: "bg-gray-500", ping: "bg-gray-400", label: "Polling" },
};

export default function GraphPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectIdParam = searchParams.get("projectId") ?? "";

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string>(projectIdParam);
  const [showLogs, setShowLogs] = useState(true);

  const {
    nodes, edges, tasks, loading, error,
    lastUpdated, socketStatus, refresh, updateTaskStatus,
  } = useTaskGraph(selectedId || null);

  useEffect(() => {
    api.projects.list().then(setProjects).catch(() => null);
  }, []);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    const p = new URLSearchParams();
    if (id) p.set("projectId", id);
    router.replace(`/graph?${p.toString()}`);
  }, [router]);

  const completedCount = tasks.filter((t) => t.status === "COMPLETED").length;
  const progress = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;
  const ss = SOCKET_STATUS_STYLES[socketStatus];

  return (
    <div className="flex h-[calc(100vh-57px)] flex-col">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-5 py-3">
        <div className="flex flex-wrap items-center gap-4">
          <select
            value={selectedId}
            onChange={(e) => handleSelect(e.target.value)}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 focus:border-gray-500 focus:outline-none"
          >
            <option value="">Select a project…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          {tasks.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500">{completedCount}/{tasks.length} tasks</span>
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-green-500 transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-xs font-medium text-gray-600">{progress}%</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          {/* Legend */}
          <div className="flex items-center gap-3">
            {LEGEND.map(({ status, label }) => (
              <span key={status} className="flex items-center gap-1.5 text-xs text-gray-600">
                <span className={`h-2.5 w-2.5 rounded-sm border ${STATUS_STYLES[status].border} ${STATUS_STYLES[status].bg}`} />
                {label}
              </span>
            ))}
          </div>

          {/* Socket status */}
          {selectedId && (
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="relative flex h-2 w-2">
                {socketStatus === "connected" && (
                  <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${ss.ping} opacity-75`} />
                )}
                <span className={`relative inline-flex h-2 w-2 rounded-full ${ss.dot}`} />
              </span>
              {ss.label}
            </span>
          )}

          {lastUpdated && (
            <span className="text-xs text-gray-400">{lastUpdated.toLocaleTimeString()}</span>
          )}

          <button
            onClick={refresh}
            disabled={!selectedId || loading}
            className="rounded border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          >
            ↺ Refresh
          </button>

          <button
            onClick={() => setShowLogs((v) => !v)}
            className={`rounded border px-2.5 py-1 text-xs transition-colors ${
              showLogs
                ? "border-gray-900 bg-gray-900 text-white"
                : "border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {showLogs ? "Hide logs" : "Show logs"}
          </button>
        </div>
      </div>

      {/* ── Main area: graph + log feed ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Graph canvas */}
        <div className="relative flex-1 bg-slate-50">
          {error && (
            <div className="absolute left-1/2 top-4 z-10 w-80 -translate-x-1/2">
              <ErrorMessage message={error} />
            </div>
          )}

          {!selectedId ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-gray-400">Select a project to view its task graph</p>
            </div>
          ) : loading ? (
            <Spinner />
          ) : tasks.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-gray-400">No tasks yet — generate a plan from the homepage.</p>
            </div>
          ) : (
            <TaskGraph nodes={nodes} edges={edges} tasks={tasks} onStatusChange={updateTaskStatus} />
          )}
        </div>

        {/* Agent log feed panel */}
        {showLogs && (
          <div className="w-80 shrink-0 border-l border-gray-200">
            <AgentLogFeed projectId={selectedId || null} />
          </div>
        )}
      </div>
    </div>
  );
}
