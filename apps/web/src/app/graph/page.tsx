"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { api } from "@/lib/api";
import { useTaskGraph } from "@/lib/useTaskGraph";
import type { Project, TaskStatus } from "@/types";
import { STATUS_STYLES } from "@/components/graph/TaskNode";
import { Spinner, ErrorMessage } from "@/components/Feedback";

// React Flow must be client-only (uses browser APIs)
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

export default function GraphPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectIdParam = searchParams.get("projectId") ?? "";

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string>(projectIdParam);

  const { nodes, edges, tasks, loading, error, lastUpdated, refresh, updateTaskStatus } =
    useTaskGraph(selectedId || null);

  useEffect(() => {
    api.projects.list().then(setProjects).catch(() => null);
  }, []);

  // Keep URL in sync with selection
  const handleSelect = useCallback(
    (id: string) => {
      setSelectedId(id);
      const p = new URLSearchParams();
      if (id) p.set("projectId", id);
      router.replace(`/graph?${p.toString()}`);
    },
    [router],
  );

  const completedCount = tasks.filter((t) => t.status === "COMPLETED").length;
  const progress = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

  return (
    <div className="flex h-[calc(100vh-57px)] flex-col">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-5 py-3">
        {/* Left: project selector + stats */}
        <div className="flex flex-wrap items-center gap-4">
          <select
            value={selectedId}
            onChange={(e) => handleSelect(e.target.value)}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 focus:border-gray-500 focus:outline-none"
          >
            <option value="">Select a project…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {tasks.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500">
                {completedCount}/{tasks.length} tasks
              </span>
              {/* Progress bar */}
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

        {/* Right: legend + live indicator + refresh */}
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

          {/* Live pulse */}
          {selectedId && (
            <span className="flex items-center gap-1.5 text-xs text-gray-400">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
              </span>
              Live
            </span>
          )}

          {lastUpdated && (
            <span className="text-xs text-gray-400">
              {lastUpdated.toLocaleTimeString()}
            </span>
          )}

          <button
            onClick={refresh}
            disabled={!selectedId || loading}
            className="rounded border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          >
            ↺ Refresh
          </button>
        </div>
      </div>

      {/* ── Canvas ── */}
      <div className="relative flex-1 bg-slate-50">
        {error && (
          <div className="absolute left-1/2 top-4 z-10 w-80 -translate-x-1/2">
            <ErrorMessage message={error} />
          </div>
        )}

        {!selectedId ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <p className="text-sm text-gray-400">Select a project to view its task graph</p>
            </div>
          </div>
        ) : loading ? (
          <Spinner />
        ) : tasks.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-gray-400">
              No tasks yet — generate a plan from the homepage.
            </p>
          </div>
        ) : (
          <TaskGraph
            nodes={nodes}
            edges={edges}
            tasks={tasks}
            onStatusChange={updateTaskStatus}
          />
        )}
      </div>
    </div>
  );
}
