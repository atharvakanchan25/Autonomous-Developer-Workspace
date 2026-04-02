"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import { useSocket } from "@/lib/useSocket";
import { useProjectStore } from "@/lib/useProjectStore";
import { ProjectSelect } from "@/components/ProjectSelect";
import { useAuth } from "@/lib/useAuth";
import type { SummaryStats, ObsLog, AgentRunRow, TimelineRow } from "@/types";
import { StatCard } from "@/components/observe/StatCard";
import { LogTable } from "@/components/observe/LogTable";
import { AgentActivityTable } from "@/components/observe/AgentActivityTable";
import { ExecutionTimeline } from "@/components/observe/ExecutionTimeline";
import { ErrorFeed } from "@/components/observe/ErrorFeed";
import { PageShell } from "@/components/PageShell";
import { duration, ease, buttonTap, staggerContainer, fadeUp } from "@/lib/motion";

type Tab = "overview" | "logs" | "agents" | "timeline" | "errors";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "overview",  label: "Overview",       icon: "⬡" },
  { id: "logs",      label: "Logs",           icon: "≡" },
  { id: "agents",    label: "Agent Runs",     icon: "⚡" },
  { id: "timeline",  label: "Timeline",       icon: "◫" },
  { id: "errors",    label: "Errors",         icon: "⚠" },
];

const AUTO_REFRESH_MS = 10_000;

// ── Overview mini-chart ───────────────────────────────────────────────────────

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max === 0 ? 0 : Math.round((value / max) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-gray-700">
        <div className={`h-1.5 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-6 text-right text-[10px] text-gray-500">{value}</span>
    </div>
  );
}

function OverviewPanel({ stats, agents, errors, logs }: {
  stats: SummaryStats | null;
  agents: AgentRunRow[];
  errors: ObsLog[];
  logs: ObsLog[];
}) {
  const taskTotal      = stats?.tasks.total ?? 0;
  const completedTasks = stats?.tasks.byStatus?.COMPLETED ?? 0;
  const inProgress     = stats?.tasks.byStatus?.IN_PROGRESS ?? 0;
  const failedTasks    = stats?.tasks.byStatus?.FAILED ?? 0;
  const pendingTasks   = stats?.tasks.byStatus?.PENDING ?? 0;

  const agentTotal     = stats?.agentRuns.total ?? 0;
  const agentCompleted = stats?.agentRuns.byStatus?.COMPLETED ?? 0;
  const agentFailed    = stats?.agentRuns.byStatus?.FAILED ?? 0;
  const agentRunning   = stats?.agentRuns.byStatus?.RUNNING ?? 0;
  const avgMs          = stats?.agentRuns.avgDurationMs ?? 0;

  const codeRuns  = agents.filter((a) => a.agentType === "CODE_GENERATOR").length;
  const testRuns  = agents.filter((a) => a.agentType === "TEST_GENERATOR").length;
  const reviewRuns = agents.filter((a) => a.agentType === "CODE_REVIEWER").length;
  const maxAgentRuns = Math.max(codeRuns, testRuns, reviewRuns, 1);

  const recentErrors = errors.slice(0, 4);
  const recentLogs   = logs.slice(0, 5);

  return (
    <div className="grid grid-cols-3 gap-4">

      {/* Task breakdown */}
      <div className="rounded-xl border border-gray-700 bg-[#1a1f2e] p-5">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Task Breakdown</p>
        <div className="space-y-2.5">
          {[
            { label: "Completed", value: completedTasks, color: "bg-green-500" },
            { label: "In Progress", value: inProgress,   color: "bg-indigo-500 animate-pulse" },
            { label: "Pending",    value: pendingTasks,  color: "bg-gray-500" },
            { label: "Failed",     value: failedTasks,   color: "bg-red-500" },
          ].map(({ label, value, color }) => (
            <div key={label}>
              <div className="mb-1 flex justify-between text-[11px]">
                <span className="text-gray-400">{label}</span>
              </div>
              <MiniBar value={value} max={taskTotal || 1} color={color} />
            </div>
          ))}
        </div>
        <p className="mt-4 text-[10px] text-gray-600">{taskTotal} total tasks</p>
      </div>

      {/* Agent breakdown */}
      <div className="rounded-xl border border-gray-700 bg-[#1a1f2e] p-5">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Agent Runs</p>
        <div className="space-y-2.5">
          {[
            { label: "Code Generator", value: codeRuns,   color: "bg-indigo-400" },
            { label: "Test Generator", value: testRuns,   color: "bg-teal-400" },
            { label: "Code Reviewer",  value: reviewRuns, color: "bg-orange-400" },
          ].map(({ label, value, color }) => (
            <div key={label}>
              <div className="mb-1 flex justify-between text-[11px]">
                <span className="text-gray-400">{label}</span>
              </div>
              <MiniBar value={value} max={maxAgentRuns} color={color} />
            </div>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-gray-700 pt-3">
          {[
            { label: "Done",    value: agentCompleted, color: "text-green-400" },
            { label: "Running", value: agentRunning,   color: "text-indigo-400" },
            { label: "Failed",  value: agentFailed,    color: "text-red-400" },
          ].map(({ label, value, color }) => (
            <div key={label} className="text-center">
              <p className={`text-sm font-semibold ${color}`}>{value}</p>
              <p className="text-[10px] text-gray-600">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* System health */}
      <div className="rounded-xl border border-gray-700 bg-[#1a1f2e] p-5">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-500">System Health</p>
        <div className="space-y-3">
          {[
            {
              label: "Success Rate",
              value: agentTotal > 0 ? `${Math.round((agentCompleted / agentTotal) * 100)}%` : "—",
              color: agentFailed === 0 ? "text-green-400" : "text-amber-400",
            },
            {
              label: "Avg Duration",
              value: avgMs > 0 ? `${(avgMs / 1000).toFixed(1)}s` : "—",
              color: "text-indigo-400",
            },
            {
              label: "Error Count",
              value: errors.length,
              color: errors.length === 0 ? "text-green-400" : "text-red-400",
            },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-xs text-gray-500">{label}</span>
              <span className={`text-sm font-semibold ${color}`}>{value}</span>
            </div>
          ))}
        </div>

        {/* Recent errors preview */}
        {recentErrors.length > 0 && (
          <div className="mt-4 border-t border-gray-700 pt-3">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-red-500">Recent Errors</p>
            <div className="space-y-1.5">
              {recentErrors.map((e) => (
                <p key={e.id} className="truncate text-[11px] text-red-400/80">{e.message}</p>
              ))}
            </div>
          </div>
        )}

        {recentErrors.length === 0 && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-green-900/20 px-3 py-2">
            <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
            <span className="text-[11px] text-green-400">All systems healthy</span>
          </div>
        )}
      </div>

      {/* Recent log activity — full width */}
      {recentLogs.length > 0 && (
        <div className="col-span-3 rounded-xl border border-gray-700 bg-[#1a1f2e] p-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Recent Activity</p>
          <div className="space-y-1.5">
            {recentLogs.map((log) => (
              <div key={log.id} className="flex items-start gap-3 font-mono text-[11px]">
                <span className="shrink-0 text-gray-600">{new Date(log.createdAt).toLocaleTimeString()}</span>
                <span className={`shrink-0 rounded px-1 text-[10px] font-medium ${
                  log.level === "ERROR" ? "bg-red-900/50 text-red-300"
                  : log.level === "WARN" ? "bg-amber-900/50 text-amber-300"
                  : log.level === "INFO" ? "bg-indigo-900/50 text-indigo-300"
                  : "bg-gray-800 text-gray-500"
                }`}>{log.level}</span>
                <span className="truncate text-gray-400">{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ObservePage() {
  const [tab, setTab] = useState<Tab>("overview");
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const { projectId: storedId, setProjectId } = useProjectStore();
  const [selectedProjectId, setSelectedProjectId] = useState<string>(storedId);

  const handleProjectChange = useCallback((id: string) => {
    setSelectedProjectId(id);
    setProjectId(id);
  }, [setProjectId]);

  const [stats,    setStats]    = useState<SummaryStats | null>(null);
  const [logs,     setLogs]     = useState<ObsLog[]>([]);
  const [agents,   setAgents]   = useState<AgentRunRow[]>([]);
  const [timeline, setTimeline] = useState<TimelineRow[]>([]);
  const [errors,   setErrors]   = useState<ObsLog[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const pf = selectedProjectId || undefined;
      const [summaryData, agentsData, timelineData, logsData, errorsData] = await Promise.all([
        api.observe.summary(pf),
        api.observe.agents(100, pf),
        api.observe.timeline(pf),
        // Logs available to all users — filtered by their project
        api.observe.logs({ limit: "200", ...(pf && { projectId: pf }) }),
        api.observe.errors(50, pf),
      ]);
      setStats(summaryData);
      setAgents(agentsData);
      setTimeline(timelineData);
      setLogs(logsData.logs);
      setErrors(errorsData);
      setLastRefresh(new Date());
    } catch { /* silent */ }
    finally { if (!silent) setLoading(false); }
  }, [selectedProjectId]);

  useEffect(() => {
    fetchAll();
    timerRef.current = setInterval(() => fetchAll(true), AUTO_REFRESH_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchAll]);

  const { status: socketStatus } = useSocket({
    projectId: selectedProjectId || null,
    onTaskUpdated: () => fetchAll(true),
    onAgentLog:    () => fetchAll(true),
    onPipelineStage: () => fetchAll(true),
  });

  const taskTotal      = stats?.tasks.total ?? 0;
  const completedTasks = stats?.tasks.byStatus?.COMPLETED ?? 0;
  const failedTasks    = stats?.tasks.byStatus?.FAILED ?? 0;
  const agentTotal     = stats?.agentRuns.total ?? 0;
  const avgDuration    = stats?.agentRuns.avgDurationMs ?? 0;
  const errorTotal     = stats?.errors.total ?? 0;
  const successRate    = agentTotal > 0
    ? Math.round(((stats?.agentRuns.byStatus?.COMPLETED ?? 0) / agentTotal) * 100)
    : null;

  return (
    <PageShell>
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-gray-700 bg-[#1a1f2e] px-8">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-medium text-gray-100">Observe</h1>
          <ProjectSelect
            value={selectedProjectId}
            onChange={handleProjectChange}
            placeholder="All Projects"
            className="border-gray-700 bg-[#252d3d] text-gray-300 text-xs"
          />
          {/* Live indicator */}
          <span className="flex items-center gap-1.5 text-xs text-gray-500">
            <motion.span
              className={`h-1.5 w-1.5 rounded-full ${
                socketStatus === "connected"  ? "bg-green-500" :
                socketStatus === "connecting" ? "bg-amber-400" : "bg-gray-600"
              }`}
              animate={socketStatus === "connected" ? { opacity: [1, 0.3, 1] } : {}}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            />
            {socketStatus === "connected" ? "Live" : socketStatus === "connecting" ? "Connecting…" : "Offline"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {lastRefresh && (
            <span className="text-xs text-gray-600">
              Updated {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <motion.button
            onClick={() => fetchAll()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-800/50 disabled:opacity-40"
            whileTap={buttonTap}
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}>
              <path fillRule="evenodd" d="M8 3a5 5 0 104.546 2.914.5.5 0 01.908-.417A6 6 0 118 2v1z" clipRule="evenodd" />
              <path d="M8 4.466V.534a.25.25 0 01.41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 018 4.466z" />
            </svg>
            Refresh
          </motion.button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto bg-[#0f1419]">
        <div className="mx-auto max-w-7xl px-8 py-6 space-y-6">

          {/* Stat cards */}
          <motion.div
            className="grid grid-cols-2 gap-4 sm:grid-cols-4"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            <motion.div variants={fadeUp}>
              <StatCard label="Total Tasks" value={taskTotal}
                sub={`${completedTasks} done · ${failedTasks} failed`} accent="indigo" />
            </motion.div>
            <motion.div variants={fadeUp}>
              <StatCard label="Agent Runs" value={agentTotal}
                sub={avgDuration > 0 ? `Avg ${(avgDuration / 1000).toFixed(1)}s` : "No runs yet"} accent="green" />
            </motion.div>
            <motion.div variants={fadeUp}>
              <StatCard label="Errors" value={errorTotal}
                sub={errorTotal === 0 ? "All clear ✓" : "Check errors tab"}
                accent={errorTotal > 0 ? "red" : "gray"} />
            </motion.div>
            <motion.div variants={fadeUp}>
              <StatCard
                label="Success Rate"
                value={successRate !== null ? `${successRate}%` : "—"}
                sub={`${stats?.agentRuns.byStatus?.FAILED ?? 0} failed runs`}
                accent={successRate !== null && successRate >= 80 ? "green" : "amber"}
              />
            </motion.div>
          </motion.div>

          {/* Tabs */}
          <div className="flex gap-0.5 border-b border-gray-700">
            {TABS.map(({ id, label, icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`relative flex items-center gap-1.5 px-4 py-2.5 text-sm transition-colors ${
                  tab === id ? "font-medium text-gray-100" : "text-gray-500 hover:text-gray-300"
                }`}
              >
                <span className="text-[13px]">{icon}</span>
                {label}
                {id === "errors" && errors.length > 0 && (
                  <span className="rounded-full bg-red-900/60 px-1.5 py-0.5 text-[10px] font-semibold text-red-300">
                    {errors.length}
                  </span>
                )}
                {id === "agents" && agents.filter(a => a.status === "RUNNING").length > 0 && (
                  <span className="rounded-full bg-indigo-900/60 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-300 animate-pulse">
                    {agents.filter(a => a.status === "RUNNING").length} live
                  </span>
                )}
                {tab === id && (
                  <motion.span
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500"
                    layoutId="tab-underline"
                    transition={{ duration: duration.standard, ease: ease.primary }}
                  />
                )}
              </button>
            ))}
          </div>

          {/* Tab panels */}
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: duration.standard, ease: ease.enter }}
            >
              {tab === "overview"  && <OverviewPanel stats={stats} agents={agents} errors={errors} logs={logs} />}
              {tab === "logs"      && <LogTable logs={logs} loading={loading} />}
              {tab === "agents"    && <AgentActivityTable runs={agents} loading={loading} />}
              {tab === "timeline"  && <ExecutionTimeline rows={timeline} loading={loading} />}
              {tab === "errors"    && <ErrorFeed errors={errors} loading={loading} />}
            </motion.div>
          </AnimatePresence>

        </div>
      </main>
    </PageShell>
  );
}
