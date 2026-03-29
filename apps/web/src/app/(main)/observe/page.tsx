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
import { duration, ease, buttonTap, staggerContainer, fadeUp } from "@/lib/motion";

type Tab = "logs" | "agents" | "timeline" | "errors";

const TABS: { id: Tab; label: string }[] = [
  { id: "logs",     label: "Logs" },
  { id: "agents",   label: "Agent Activity" },
  { id: "timeline", label: "Timeline" },
  { id: "errors",   label: "Errors" },
];

const ADMIN_TABS: Tab[] = [];

const AUTO_REFRESH_MS = 10_000;

export default function ObservePage() {
  const [tab, setTab] = useState<Tab>("agents");
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [adminToast, setAdminToast] = useState(false);
  const { projectId: storedId, setProjectId } = useProjectStore();
  const [selectedProjectId, setSelectedProjectId] = useState<string>(storedId);

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
    timerRef.current = setInterval(() => fetchAll(true), AUTO_REFRESH_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchAll]);

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
  const agentTotal     = stats?.agentRuns.total ?? 0;
  const avgDuration    = stats?.agentRuns.avgDurationMs ?? 0;
  const errorTotal     = stats?.errors.total ?? 0;
  const successRate    = agentTotal > 0
    ? Math.round(((stats?.agentRuns.byStatus?.COMPLETED ?? 0) / agentTotal) * 100)
    : null;

  return (
    <PageShell>
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-gray-700 bg-[#1a1f2e] px-8">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-medium text-gray-100">Observability</h1>
          <ProjectSelect
            value={selectedProjectId}
            onChange={handleProjectChange}
            placeholder="All Projects (Total)"
            className="border-gray-700 bg-[#252d3d] text-gray-300 text-xs"
          />
          <span className="flex items-center gap-1.5 text-xs text-gray-500">
            <motion.span
              className={`h-1.5 w-1.5 rounded-full ${
                socketStatus === "connected" ? "bg-green-500" :
                socketStatus === "connecting" ? "bg-amber-400" : "bg-gray-600"
              }`}
              animate={socketStatus === "connected" ? { opacity: [1, 0.4, 1] } : { opacity: 1 }}
              transition={socketStatus === "connected"
                ? { duration: 2, ease: "easeInOut", repeat: Infinity }
                : { duration: duration.fast }
              }
            />
            {socketStatus === "connected" ? "Live" : socketStatus === "connecting" ? "Connecting" : "Offline"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {lastRefresh && (
            <span className="text-xs text-gray-500">Updated {lastRefresh.toLocaleTimeString()}</span>
          )}
          <motion.button
            onClick={() => fetchAll()}
            disabled={loading}
            className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-800/50 disabled:opacity-40"
            whileTap={buttonTap}
            transition={{ duration: duration.fast }}
          >
            ↺ Refresh
          </motion.button>
        </div>
      </header>

      <main className="flex-1 px-8 py-8">
        {/* Stat cards — staggered entry */}
        <motion.div
          className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4"
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
              sub={`Avg ${avgDuration}ms`} accent="green" />
          </motion.div>
          <motion.div variants={fadeUp}>
            <StatCard label="Errors" value={errorTotal}
              sub={errorTotal === 0 ? "All clear" : "Check errors tab"}
              accent={errorTotal > 0 ? "red" : "gray"} />
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

        {/* Tabs — layoutId sliding underline */}
        <div className="mb-6 flex gap-1 border-b border-gray-700">
          {TABS.map(({ id, label }) => {
            const restricted = id === "logs" && !isAdmin;
            return (
              <button
                key={id}
                onClick={() => {
                  if (restricted) { setAdminToast(true); return; }
                  setTab(id);
                }}
                className={`relative px-4 py-2.5 text-sm transition-colors ${
                  restricted
                    ? "cursor-not-allowed text-gray-600"
                    : tab === id ? "font-medium text-gray-100" : "text-gray-400 hover:text-gray-200"
                }`}
              >
                {label}
                {restricted && (
                  <span className="ml-1 text-[10px] text-red-600">🔒</span>
                )}
                {id === "errors" && !restricted && errors.length > 0 && (
                  <motion.span
                    className="ml-1.5 rounded-full bg-red-900/60 px-1.5 py-0.5 text-[10px] font-semibold text-red-300"
                    initial={{ scale: 0.7, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: duration.fast }}
                  >
                    {errors.length}
                  </motion.span>
                )}
                {tab === id && !restricted && (
                  <motion.span
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500"
                    layoutId="tab-underline"
                    transition={{ duration: duration.standard, ease: ease.primary }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Tab panels — fade transition */}
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
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
