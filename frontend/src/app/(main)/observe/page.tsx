"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import { useSocket } from "@/lib/useSocket";
import { useProjectStore } from "@/lib/useProjectStore";
import { ProjectSelect } from "@/components/ProjectSelect";
import { useAuth } from "@/lib/useAuth";
import { AdminOnlyToast } from "@/components/AdminOnlyToast";
import type { SummaryStats, ObsLog, AgentRunRow, TimelineRow } from "@/types";
import { StatCard } from "@/components/observe/StatCard";
import { LogTable } from "@/components/observe/LogTable";
import { AgentActivityTable } from "@/components/observe/AgentActivityTable";
import { ExecutionTimeline } from "@/components/observe/ExecutionTimeline";
import { ErrorFeed } from "@/components/observe/ErrorFeed";
import { PageShell } from "@/components/PageShell";
import { duration, ease, staggerContainer, fadeUp } from "@/lib/motion";

type Tab = "logs" | "agents" | "timeline" | "errors";

const TABS: { id: Tab; label: string }[] = [
  { id: "agents",   label: "Agent Activity" },
  { id: "timeline", label: "Timeline"        },
  { id: "errors",   label: "Errors"          },
  { id: "logs",     label: "Logs"            },
];

const REFRESH_OPTIONS = [
  { label: "10s",  ms: 10_000 },
  { label: "30s",  ms: 30_000 },
  { label: "60s",  ms: 60_000 },
  { label: "Off",  ms: 0      },
];

const AGENT_META = {
  CODE_GENERATOR: { label: "Code Gen",   color: "bg-indigo-500", text: "text-indigo-400" },
  TEST_GENERATOR: { label: "Test Gen",   color: "bg-teal-500",   text: "text-teal-400"   },
  CODE_REVIEWER:  { label: "Reviewer",   color: "bg-orange-500", text: "text-orange-400" },
} as const;

function IconRefresh({ spinning }: { spinning: boolean }) {
  return (
    <motion.svg
      xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
      className="h-3.5 w-3.5"
      animate={spinning ? { rotate: 360 } : { rotate: 0 }}
      transition={spinning ? { duration: 0.8, repeat: Infinity, ease: "linear" } : {}}
    >
      <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
    </motion.svg>
  );
}

function IconDownload() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
      <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
      <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
    </svg>
  );
}

function IconLock() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-gray-700">
      <path fillRule="evenodd" d="M8 1a3.5 3.5 0 00-3.5 3.5V7A1.5 1.5 0 003 8.5v4A1.5 1.5 0 004.5 14h7a1.5 1.5 0 001.5-1.5v-4A1.5 1.5 0 0011.5 7V4.5A3.5 3.5 0 008 1zm2 6V4.5a2 2 0 10-4 0V7h4z" clipRule="evenodd" />
    </svg>
  );
}

export default function ObservePage() {
  const [tab, setTab] = useState<Tab>("agents");
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [adminToast, setAdminToast] = useState(false);
  const { projectId: storedId, setProjectId } = useProjectStore();
  const [selectedProjectId, setSelectedProjectId] = useState<string>(storedId);
  const [refreshMs, setRefreshMs] = useState(10_000);

  const handleProjectChange = useCallback((id: string) => {
    setSelectedProjectId(id);
    setProjectId(id);
  }, [setProjectId]);

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
      const projectFilter = selectedProjectId || undefined;
      const [summaryData, agentsData, timelineData, logsData, errorsData] = await Promise.all([
        api.observe.summary(projectFilter),
        api.observe.agents(100, projectFilter),
        api.observe.timeline(projectFilter),
        isAdmin ? api.observe.logs({ limit: "200", ...(projectFilter && { projectId: projectFilter }) }) : Promise.resolve({ logs: [] }),
        api.observe.errors(50, projectFilter),
      ]);
      setStats(summaryData);
      setAgents(agentsData);
      setTimeline(timelineData);
      if (isAdmin) setLogs(logsData.logs);
      setErrors(errorsData);
      setLastRefresh(new Date());
    } catch { /* silent */ }
    finally { if (!silent) setLoading(false); }
  }, [selectedProjectId, isAdmin]);

  useEffect(() => {
    fetchAll();
    if (timerRef.current) clearInterval(timerRef.current);
    if (refreshMs > 0) {
      timerRef.current = setInterval(() => fetchAll(true), refreshMs);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchAll, refreshMs]);

  const handleSocketEvent = useCallback(() => fetchAll(true), [fetchAll]);
  const { status: socketStatus } = useSocket({
    projectId: selectedProjectId || null,
    onTaskUpdated: handleSocketEvent,
    onAgentLog: handleSocketEvent,
    onPipelineStage: handleSocketEvent,
  });

  const taskTotal      = stats?.tasks.total ?? 0;
  const completedTasks = stats?.tasks.byStatus?.COMPLETED ?? 0;
  const failedTasks    = stats?.tasks.byStatus?.FAILED ?? 0;
  const pendingTasks   = stats?.tasks.byStatus?.PENDING ?? 0;
  const inProgressTasks = stats?.tasks.byStatus?.IN_PROGRESS ?? 0;
  const agentTotal     = stats?.agentRuns.total ?? 0;
  const avgDuration    = stats?.agentRuns.avgDurationMs ?? 0;
  const errorTotal     = stats?.errors.total ?? 0;
  const successRate    = agentTotal > 0
    ? Math.round(((stats?.agentRuns.byStatus?.COMPLETED ?? 0) / agentTotal) * 100)
    : null;

  // agent type breakdown from runs
  const agentBreakdown = Object.entries(
    agents.reduce<Record<string, { total: number; completed: number; failed: number }>>((acc, r) => {
      if (!acc[r.agentType]) acc[r.agentType] = { total: 0, completed: 0, failed: 0 };
      acc[r.agentType].total++;
      if (r.status === "COMPLETED") acc[r.agentType].completed++;
      if (r.status === "FAILED") acc[r.agentType].failed++;
      return acc;
    }, {})
  );
  const maxAgentCount = Math.max(...agentBreakdown.map(([, v]) => v.total), 1);

  const isLive = socketStatus === "connected";

  function handleExportLogs() {
    const data = tab === "errors" ? errors : logs;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `adw-${tab}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const tabCounts: Partial<Record<Tab, number>> = {
    agents:   agents.length,
    timeline: timeline.length,
    errors:   errors.length,
    logs:     logs.length,
  };

  return (
    <PageShell>
      {/* ── Hero Header ─────────────────────────────────────────────────── */}
      <header className="relative overflow-hidden border-b border-white/[0.06] bg-[#080b10] px-8 py-7">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,.2) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.2) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        <div className="pointer-events-none absolute -top-20 left-1/3 h-56 w-80 rounded-full bg-indigo-600/8 blur-3xl" />

        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2.5">
              <motion.div
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${
                  isLive
                    ? "bg-green-950/60 text-green-400 ring-green-800/50"
                    : "bg-gray-900 text-gray-500 ring-gray-800/50"
                }`}
                animate={isLive ? { opacity: [0.7, 1, 0.7] } : { opacity: 1 }}
                transition={isLive ? { duration: 2.5, repeat: Infinity, ease: "easeInOut" } : {}}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${isLive ? "bg-green-400" : "bg-gray-600"}`} />
                {isLive ? "Live" : socketStatus === "connecting" ? "Connecting" : "Offline"}
              </motion.div>
              {lastRefresh && (
                <span className="text-[11px] text-gray-600">
                  Last updated {lastRefresh.toLocaleTimeString()}
                </span>
              )}
            </div>
            <h1 className="bg-gradient-to-r from-white via-gray-200 to-gray-500 bg-clip-text text-3xl font-bold tracking-tight text-transparent">
              Observability
            </h1>
            <p className="text-sm text-gray-500">
              Real-time agent telemetry, execution traces &amp; system health
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ProjectSelect
              value={selectedProjectId}
              onChange={handleProjectChange}
              placeholder="All Projects"
              className="text-xs"
            />

            {/* Auto-refresh selector */}
            <div className="flex items-center gap-0 rounded-xl bg-[#0d1117] ring-1 ring-white/[0.07]">
              {REFRESH_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => setRefreshMs(opt.ms)}
                  className={`px-3 py-2 text-xs font-medium transition-colors first:rounded-l-xl last:rounded-r-xl ${
                    refreshMs === opt.ms
                      ? "bg-white/[0.1] text-white"
                      : "text-gray-500 hover:text-gray-300"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <motion.button
              onClick={() => fetchAll()}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-xl bg-white/[0.06] px-3.5 py-2 text-xs font-medium text-gray-300 ring-1 ring-white/10 transition-colors hover:bg-white/[0.1] disabled:opacity-40"
              whileTap={{ scale: 0.96 }}
              transition={{ duration: duration.fast }}
            >
              <IconRefresh spinning={loading} />
              Refresh
            </motion.button>

            <motion.button
              onClick={handleExportLogs}
              className="flex items-center gap-1.5 rounded-xl bg-white/[0.06] px-3.5 py-2 text-xs font-medium text-gray-300 ring-1 ring-white/10 transition-colors hover:bg-white/[0.1]"
              whileTap={{ scale: 0.96 }}
              transition={{ duration: duration.fast }}
            >
              <IconDownload />
              Export
            </motion.button>
          </div>
        </div>
      </header>

      <main className="flex-1 space-y-6 px-8 py-7">
        {/* ── Stat Cards ──────────────────────────────────────────────────── */}
        <motion.div
          className="grid grid-cols-2 gap-4 lg:grid-cols-4"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={fadeUp}>
            <StatCard
              label="Total Tasks"
              value={taskTotal}
              sub={`${completedTasks} done · ${failedTasks} failed`}
              accent="indigo"
              progressSegments={taskTotal > 0 ? [
                { pct: (completedTasks / taskTotal) * 100, color: "bg-green-500" },
                { pct: (inProgressTasks / taskTotal) * 100, color: "bg-indigo-500" },
                { pct: (failedTasks / taskTotal) * 100, color: "bg-red-500" },
                { pct: (pendingTasks / taskTotal) * 100, color: "bg-gray-700" },
              ] : undefined}
            />
          </motion.div>
          <motion.div variants={fadeUp}>
            <StatCard
              label="Agent Runs"
              value={agentTotal}
              sub={`Avg ${avgDuration}ms per run`}
              accent="green"
              progressSegments={agentTotal > 0 ? [
                { pct: ((stats?.agentRuns.byStatus?.COMPLETED ?? 0) / agentTotal) * 100, color: "bg-green-500" },
                { pct: ((stats?.agentRuns.byStatus?.RUNNING ?? 0) / agentTotal) * 100, color: "bg-indigo-500" },
                { pct: ((stats?.agentRuns.byStatus?.FAILED ?? 0) / agentTotal) * 100, color: "bg-red-500" },
              ] : undefined}
            />
          </motion.div>
          <motion.div variants={fadeUp}>
            <StatCard
              label="Errors"
              value={errorTotal}
              sub={errorTotal === 0 ? "System healthy" : "Review errors tab"}
              accent={errorTotal > 0 ? "red" : "gray"}
            />
          </motion.div>
          <motion.div variants={fadeUp}>
            <StatCard
              label="Success Rate"
              value={successRate !== null ? `${successRate}%` : "—"}
              sub={`${stats?.agentRuns.byStatus?.FAILED ?? 0} failed runs`}
              accent={successRate !== null && (stats?.agentRuns.byStatus?.FAILED ?? 0) === 0 ? "green" : "amber"}
            />
          </motion.div>
        </motion.div>

        {/* ── Agent Breakdown Panel ───────────────────────────────────────── */}
        {agentBreakdown.length > 0 && (
          <motion.div
            className="rounded-2xl bg-[#0d1117] p-5 ring-1 ring-white/[0.06]"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: duration.standard, ease: ease.enter }}
          >
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Agent Breakdown</p>
              <p className="text-xs text-gray-600">{agentTotal} total runs</p>
            </div>
            <div className="space-y-3">
              {agentBreakdown.map(([type, counts]) => {
                const meta = AGENT_META[type as keyof typeof AGENT_META];
                const barPct = (counts.total / maxAgentCount) * 100;
                const successPct = counts.total > 0 ? Math.round((counts.completed / counts.total) * 100) : 0;
                return (
                  <div key={type} className="flex items-center gap-4">
                    <span className={`w-20 shrink-0 text-xs font-medium ${meta?.text ?? "text-gray-400"}`}>
                      {meta?.label ?? type}
                    </span>
                    <div className="flex-1 overflow-hidden rounded-full bg-gray-800/80 h-2">
                      <motion.div
                        className={`h-full rounded-full ${meta?.color ?? "bg-gray-500"}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${barPct}%` }}
                        transition={{ duration: 0.6, ease: ease.enter, delay: 0.1 }}
                      />
                    </div>
                    <div className="flex w-28 shrink-0 items-center justify-end gap-3 text-[11px]">
                      <span className="text-gray-400">{counts.total} runs</span>
                      <span className={successPct === 100 ? "text-green-400" : successPct > 50 ? "text-amber-400" : "text-red-400"}>
                        {successPct}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* ── Tab Bar ─────────────────────────────────────────────────────── */}
        <div className="flex gap-1 rounded-2xl bg-[#0d1117] p-1 ring-1 ring-white/[0.06]">
          {TABS.map(({ id, label }) => {
            const restricted = id === "logs" && !isAdmin;
            const isActive = tab === id && !restricted;
            const count = tabCounts[id];
            return (
              <button
                key={id}
                onClick={() => {
                  if (restricted) { setAdminToast(true); return; }
                  setTab(id);
                }}
                className={`relative flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
                  restricted
                    ? "cursor-not-allowed text-gray-700"
                    : isActive
                    ? "text-white"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {isActive && (
                  <motion.div
                    className="absolute inset-0 rounded-xl bg-white/[0.08] ring-1 ring-white/10"
                    layoutId="tab-pill"
                    transition={{ duration: duration.standard, ease: ease.primary }}
                  />
                )}
                <span className="relative z-10">{label}</span>
                {restricted && (
                  <span className="relative z-10"><IconLock /></span>
                )}
                {count !== undefined && count > 0 && !restricted && (
                  <motion.span
                    className={`relative z-10 flex h-4 min-w-[20px] items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                      id === "errors"
                        ? "bg-red-600/80 text-white"
                        : isActive
                        ? "bg-white/20 text-white"
                        : "bg-gray-800 text-gray-400"
                    }`}
                    initial={{ scale: 0.7, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 20 }}
                  >
                    {count}
                  </motion.span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Tab Panels ──────────────────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: duration.standard, ease: ease.enter }}
          >
            {tab === "logs"     && <LogTable logs={logs} loading={loading} />}
            {tab === "agents"   && <AgentActivityTable runs={agents} loading={loading} />}
            {tab === "timeline" && <ExecutionTimeline rows={timeline} loading={loading} />}
            {tab === "errors"   && <ErrorFeed errors={errors} loading={loading} />}
          </motion.div>
        </AnimatePresence>
      </main>

      <AdminOnlyToast
        show={adminToast}
        onClose={() => setAdminToast(false)}
        message="System logs are restricted to admins."
      />
    </PageShell>
  );
}
