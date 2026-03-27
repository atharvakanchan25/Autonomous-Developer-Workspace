"use client";

import { useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
import { useTaskGraph } from "@/lib/useTaskGraph";
import type { TaskStatus } from "@/types";
import { AgentLogFeed } from "@/components/AgentLogFeed";
import { ProjectSelect } from "@/components/ProjectSelect";
import { duration, ease, buttonTap } from "@/lib/motion";

const TaskGraph = dynamic(
  () => import("@/components/graph/TaskGraph").then((m) => m.TaskGraph),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-gray-500" />
      </div>
    ),
  },
);

const LEGEND: { status: TaskStatus; label: string }[] = [
  { status: "PENDING", label: "Pending" },
  { status: "IN_PROGRESS", label: "Running" },
  { status: "COMPLETED", label: "Done" },
  { status: "FAILED", label: "Failed" },
];

export default function GraphPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [selectedId, setSelectedId] = useState<string>(searchParams.get("projectId") ?? "");
  const [showLogs, setShowLogs] = useState(true);

  const { nodes, edges, tasks, loading, error, lastUpdated, socketStatus, refresh, updateTaskStatus } =
    useTaskGraph(selectedId || null);

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
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-gray-700 bg-[#1a1f2e] px-6 shadow-sm">
        <div className="flex items-center gap-4">
          <h1 className="text-sm font-semibold text-gray-100">Task Graph</h1>
          <ProjectSelect value={selectedId} onChange={handleSelect} />

          {tasks.length > 0 && (
            <div className="flex items-center gap-2.5">
              <div className="h-1.5 w-28 overflow-hidden rounded-full bg-gray-700">
                <motion.div
                  className="h-full rounded-full bg-indigo-500"
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.5, ease: ease.primary }}
                />
              </div>
              <span className="text-xs font-medium text-gray-400">
                {completedCount}/{tasks.length}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          {/* Legend */}
          <div className="flex items-center gap-3">
            {LEGEND.map(({ status, label }) => (
              <span key={status} className="flex items-center gap-1.5 text-xs text-gray-400">
                <span
                  className={`h-2 w-2 rounded-full ${
                    status === "PENDING" ? "bg-gray-500" :
                    status === "IN_PROGRESS" ? "bg-indigo-500" :
                    status === "COMPLETED" ? "bg-green-500" : "bg-red-500"
                  }`}
                />
                {label}
              </span>
            ))}
          </div>

          {/* Socket status */}
          {selectedId && (
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="relative flex h-2 w-2">
                {socketStatus === "connected" && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60" />
                )}
                <span
                  className={`relative inline-flex h-2 w-2 rounded-full ${
                    socketStatus === "connected" ? "bg-green-500" :
                    socketStatus === "connecting" ? "bg-amber-400" : "bg-gray-600"
                  }`}
                />
              </span>
              {socketStatus === "connected" ? "Live" : socketStatus === "connecting" ? "Connecting" : "Offline"}
            </span>
          )}

          {lastUpdated && (
            <span className="text-xs text-gray-500">{lastUpdated.toLocaleTimeString()}</span>
          )}

          <motion.button
            onClick={refresh}
            disabled={!selectedId || loading}
            className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-400 hover:bg-gray-800/50 disabled:opacity-40 transition-colors"
            whileTap={buttonTap}
            transition={{ duration: duration.fast }}
          >
            ↺ Refresh
          </motion.button>

          <motion.button
            onClick={() => setShowLogs((v) => !v)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              showLogs ? "border-indigo-600 bg-indigo-900/40 text-indigo-300" : "border-gray-700 text-gray-400 hover:bg-gray-800/50"
            }`}
            whileTap={buttonTap}
            transition={{ duration: duration.fast }}
          >
            Logs
          </motion.button>
        </div>
      </header>

      {/* Main */}
      <div className="flex flex-1 overflow-hidden">
        {/* Graph canvas */}
        <div className="relative flex-1 bg-[#0f1419]">
          {error && (
            <div className="absolute left-1/2 top-4 z-10 w-80 -translate-x-1/2 rounded-lg border border-red-900 bg-red-950/90 px-4 py-3 text-sm text-red-300 shadow-lg">
              {error}
            </div>
          )}

          {!selectedId ? (
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-800">
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6 text-gray-500">
                  <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM14 11a1 1 0 011 1v1h1a1 1 0 110 2h-1v1a1 1 0 11-2 0v-1h-1a1 1 0 110-2h1v-1a1 1 0 011-1z" />
                </svg>
              </div>
              <p className="text-sm text-gray-500">Select a project to view its task graph</p>
            </div>
          ) : loading ? (
            <div className="flex h-full items-center justify-center">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-gray-700 border-t-gray-400" />
            </div>
          ) : tasks.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2">
              <p className="text-sm text-gray-500">No tasks yet.</p>
              <p className="text-xs text-gray-600">Generate a plan from the home page.</p>
            </div>
          ) : (
            <TaskGraph nodes={nodes} edges={edges} tasks={tasks} onStatusChange={updateTaskStatus} />
          )}
        </div>

        {/* Log panel — slides in/out */}
        <AnimatePresence>
        {showLogs && (
          <motion.div
            className="w-72 shrink-0 border-l border-gray-700"
            initial={{ opacity: 0, x: 16, width: 0 }}
            animate={{ opacity: 1, x: 0, width: 288 }}
            exit={{ opacity: 0, x: 16, width: 0 }}
            transition={{ duration: duration.standard, ease: ease.enter }}
          >
            <AgentLogFeed projectId={selectedId || null} />
          </motion.div>
        )}
        </AnimatePresence>
      </div>
    </div>
  );
}
