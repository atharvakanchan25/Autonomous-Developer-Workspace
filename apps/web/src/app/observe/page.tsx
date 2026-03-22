"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import { useSocket } from "@/lib/useSocket";
import type { SummaryStats, ObsLog, AgentRunRow, TimelineRow } from "@/types";
import { StatCard } from "@/components/observe/StatCard";
import { LogTable } from "@/components/observe/LogTable";
import { AgentActivityTable } from "@/components/observe/AgentActivityTable";
import { ExecutionTimeline } from "@/components/observe/ExecutionTimeline";
import { ErrorFeed } from "@/components/observe/ErrorFeed";

type Tab = "logs" | "agents" | "timeline" | "errors";

const TABS: { id: Tab; label: string }[] = [
  { id: "logs",     label: "Execution Logs" },
  { id: "agents",   label: "Agent Activity" },
  { id: "timeline", label: "Timeline" },
  { id: "errors",   label: "Errors" },
];

const AUTO_REFRESH_MS = 10_000;

export default function ObservePage() {
  const [tab, setTab] = useState<Tab>("logs");
  const [stats, setStats]       = useState<SummaryStats | null>(null);
  const [logs, setLogs]         = useState<ObsLog[]>([]);
  const [agents, setAgents]     = useState<AgentRunRow[]>([]);
  const [timeline, setTimeline] = useState<TimelineRow[]>([]);
  const [errors, setErrors]     = useState<ObsLog[]>([]);
  const [loading, setLoading]   = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [s, l, a, t, e] = await Promise.all([
        api.observe.summary(),
        api.observe.logs({ limit: "200" }),
        api.observe.agents(100),
        api.observe.timeline(),
        api.observe.errors(50),
      ]);
      setStats(s);
      setLogs(l.logs);
      setAgents(a);
      setTimeline(t);
      setErrors(e);
      setLastRefresh(new Date());
    } catch { /* silently ignore */ }
    finally { if (!silent) setLoading(false); }
  }, []);

  useEffect(() => {
    fetchAll();
    timerRef.current = setInterval(() => fetchAll(true), AUTO_REFRESH_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchAll]);

  // Refresh on any socket event (task update or agent log)
  const handleSocketEvent = useCallback(() => fetchAll(true), [fetchAll]);
  const { status: socketStatus } = useSocket({
    projectId: null, // global — no room filter
    onTaskUpdated: handleSocketEvent,
    onAgentLog: handleSocketEvent,
    onPipelineStage: handleSocketEvent,
  });

  // ── Derived stats ──────────────────────────────────────────────────────────
  const taskTotal      = stats?.tasks.total ?? 0;
  const completedTasks = stats?.tasks.byStatus?.COMPLETED ?? 0;
  const failedTasks    = stats?.tasks.byStatus?.FAILED ?? 0;
  const agentTotal     = stats?.agentRuns.total ?? 0;
  const avgDuration    = stats?.agentRuns.avgDurationMs ?? 0;
  const errorTotal     = stats?.errors.total ?? 0;
  const errorCount     = errors.length;

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      {/* ── Header ── */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Observability</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            System health, agent activity, and execution logs
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Socket status */}
          <span className="flex items-center gap-1.5 text-xs text-gray-400">
            <span className={`h-2 w-2 rounded-full ${
              socketStatus === "connected" ? "bg-green-500 animate-pulse" :
              socketStatus === "connecting" ? "bg-yellow-500" : "bg-gray-400"
            }`} />
            {socketStatus === "connected" ? "Live" : socketStatus === "connecting" ? "Connecting…" : "Polling"}
          </span>
          {lastRefresh && (
            <span className="text-xs text-gray-400">
              Updated {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={() => fetchAll()}
            disabled={loading}
            className="rounded border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          >
            ↺ Refresh
          </button>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Total Tasks"
          value={taskTotal}
          sub={`${completedTasks} completed · ${failedTasks} failed`}
          accent="blue"
        />
        <StatCard
          label="Agent Runs"
          value={agentTotal}
          sub={`Avg ${avgDuration}ms per run`}
          accent="green"
        />
        <StatCard
          label="Errors"
          value={errorTotal}
          sub={errorTotal === 0 ? "All clear" : "Check error tab"}
          accent={errorTotal > 0 ? "red" : "gray"}
        />
        <StatCard
          label="Success Rate"
          value={agentTotal > 0
            ? `${Math.round(((stats?.agentRuns.byStatus?.COMPLETED ?? 0) / agentTotal) * 100)}%`
            : "—"}
          sub={`${stats?.agentRuns.byStatus?.FAILED ?? 0} failed runs`}
          accent={
            agentTotal > 0 && (stats?.agentRuns.byStatus?.FAILED ?? 0) === 0 ? "green" : "yellow"
          }
        />
      </div>

      {/* ── Tabs ── */}
      <div className="mb-4 flex gap-1 border-b border-gray-200">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`relative px-4 py-2 text-sm transition-colors ${
              tab === id
                ? "font-medium text-gray-900 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-gray-900"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
            {id === "errors" && errorCount > 0 && (
              <span className="ml-1.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">
                {errorCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab panels ── */}
      <div>
        {tab === "logs"     && <LogTable logs={logs} loading={loading} />}
        {tab === "agents"   && <AgentActivityTable runs={agents} loading={loading} />}
        {tab === "timeline" && <ExecutionTimeline rows={timeline} loading={loading} />}
        {tab === "errors"   && <ErrorFeed errors={errors} loading={loading} />}
      </div>
    </main>
  );
}
