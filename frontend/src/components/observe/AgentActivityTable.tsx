"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import type { AgentRunRow, AgentRunStatus } from "@/types";
import { duration, ease, staggerContainer, fadeUp } from "@/lib/motion";

const STATUS_STYLES: Record<AgentRunStatus, { badge: string; dot: string }> = {
  RUNNING:   { badge: "bg-indigo-900/60 text-indigo-300",  dot: "bg-indigo-400 animate-pulse" },
  COMPLETED: { badge: "bg-green-900/60 text-green-300",    dot: "bg-green-400" },
  FAILED:    { badge: "bg-red-900/60 text-red-300",        dot: "bg-red-400" },
};

const AGENT_META: Record<string, { label: string; short: string; color: string; bg: string }> = {
  CODE_GENERATOR: { label: "Code Generator", short: "Code",   color: "text-indigo-400", bg: "bg-indigo-900/30" },
  TEST_GENERATOR: { label: "Test Generator", short: "Tests",  color: "text-teal-400",   bg: "bg-teal-900/30" },
  CODE_REVIEWER:  { label: "Code Reviewer",  short: "Review", color: "text-orange-400", bg: "bg-orange-900/30" },
};

function fmt(ms: number | null | undefined) {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function DurationBar({ ms, max }: { ms: number | null | undefined; max: number }) {
  const pct = ms != null && max > 0 ? Math.min(100, (ms / max) * 100) : 0;
  const color = ms == null ? "bg-gray-700"
    : ms > 10000 ? "bg-amber-500"
    : ms > 5000  ? "bg-indigo-500"
    : "bg-green-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1 w-16 rounded-full bg-gray-700">
        <div className={`h-1 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] text-gray-500">{fmt(ms)}</span>
    </div>
  );
}

export function AgentActivityTable({ runs, loading }: { runs: AgentRunRow[]; loading?: boolean }) {
  const [agentFilter, setAgentFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<AgentRunStatus | "ALL">("ALL");

  const filtered = useMemo(() => {
    return runs.filter((r) => {
      if (agentFilter !== "ALL" && r.agentType !== agentFilter) return false;
      if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
      return true;
    });
  }, [runs, agentFilter, statusFilter]);

  const maxDuration = useMemo(() =>
    Math.max(...runs.map((r) => r.durationMs ?? 0), 1),
  [runs]);

  const runningCount   = runs.filter((r) => r.status === "RUNNING").length;
  const completedCount = runs.filter((r) => r.status === "COMPLETED").length;
  const failedCount    = runs.filter((r) => r.status === "FAILED").length;

  return (
    <div className="flex flex-col gap-4">

      {/* Summary pills */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-2">
          {[
            { label: `${runningCount} Running`,   color: "border-indigo-700 bg-indigo-900/20 text-indigo-300" },
            { label: `${completedCount} Completed`, color: "border-green-700 bg-green-900/20 text-green-300" },
            { label: `${failedCount} Failed`,     color: "border-red-700 bg-red-900/20 text-red-300" },
          ].map(({ label, color }) => (
            <span key={label} className={`rounded-full border px-3 py-1 text-[11px] font-medium ${color}`}>
              {label}
            </span>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Agent type filter */}
          <div className="flex gap-1">
            {["ALL", "CODE_GENERATOR", "TEST_GENERATOR", "CODE_REVIEWER"].map((a) => {
              const meta = AGENT_META[a];
              return (
                <button
                  key={a}
                  onClick={() => setAgentFilter(a)}
                  className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    agentFilter === a
                      ? "bg-indigo-600 text-white"
                      : "border border-gray-700 bg-[#1a1f2e] text-gray-500 hover:text-gray-300"
                  }`}
                >
                  {meta?.short ?? "All"}
                </button>
              );
            })}
          </div>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="rounded-lg border border-gray-700 bg-[#1a1f2e] px-2.5 py-1.5 text-xs text-gray-300 focus:border-indigo-500 focus:outline-none"
          >
            <option value="ALL">All Status</option>
            <option value="RUNNING">Running</option>
            <option value="COMPLETED">Completed</option>
            <option value="FAILED">Failed</option>
          </select>

          <span className="text-xs text-gray-600">{filtered.length} runs</span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-700 bg-[#1a1f2e]">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-700 bg-gray-800/40">
              <th className="px-5 py-3 text-left font-medium text-gray-500">Agent</th>
              <th className="px-5 py-3 text-left font-medium text-gray-500">Task</th>
              <th className="px-5 py-3 text-left font-medium text-gray-500">Status</th>
              <th className="px-5 py-3 text-left font-medium text-gray-500">Duration</th>
              <th className="px-5 py-3 text-left font-medium text-gray-500">Started</th>
              <th className="px-5 py-3 text-left font-medium text-gray-500">Error</th>
            </tr>
          </thead>
          {loading ? (
            <tbody>
              <tr><td colSpan={6} className="px-5 py-10 text-center text-gray-600">Loading…</td></tr>
            </tbody>
          ) : filtered.length === 0 ? (
            <tbody>
              <tr><td colSpan={6} className="px-5 py-10 text-center text-gray-600">No agent runs match filters</td></tr>
            </tbody>
          ) : (
            <motion.tbody
              className="divide-y divide-gray-700/60"
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
            >
              {filtered.map((run) => {
                const meta = AGENT_META[run.agentType];
                const statusStyle = STATUS_STYLES[run.status];
                return (
                  <motion.tr
                    key={run.id}
                    variants={fadeUp}
                    className="transition-colors hover:bg-gray-800/30"
                  >
                    {/* Agent */}
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${meta?.bg ?? "bg-gray-800"} ${meta?.color ?? "text-gray-400"}`}>
                        {meta?.short ?? run.agentType}
                      </span>
                    </td>

                    {/* Task */}
                    <td className="max-w-[200px] px-5 py-3">
                      <p className="truncate text-gray-200">{run.task.title}</p>
                      <p className="mt-0.5 truncate text-[10px] text-gray-600 font-mono">{run.task.projectId.slice(0, 8)}…</p>
                    </td>

                    {/* Status */}
                    <td className="px-5 py-3">
                      <motion.span
                        key={run.status}
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusStyle.badge}`}
                        animate={run.status === "RUNNING" ? { opacity: [0.7, 1, 0.7] } : {}}
                        transition={run.status === "RUNNING" ? { duration: 1.4, repeat: Infinity } : {}}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${statusStyle.dot}`} />
                        {run.status}
                      </motion.span>
                    </td>

                    {/* Duration bar */}
                    <td className="px-5 py-3">
                      <DurationBar ms={run.durationMs} max={maxDuration} />
                    </td>

                    {/* Started */}
                    <td className="whitespace-nowrap px-5 py-3 text-gray-500">
                      {new Date(run.createdAt).toLocaleTimeString()}
                    </td>

                    {/* Error */}
                    <td className="max-w-[160px] px-5 py-3">
                      {run.errorMsg
                        ? <span className="truncate text-red-400" title={run.errorMsg}>{run.errorMsg}</span>
                        : <span className="text-gray-700">—</span>
                      }
                    </td>
                  </motion.tr>
                );
              })}
            </motion.tbody>
          )}
        </table>
      </div>
    </div>
  );
}
