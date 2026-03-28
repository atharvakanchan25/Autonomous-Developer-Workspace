"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import { useSocket } from "@/lib/useSocket";
import { useProjectStore } from "@/lib/useProjectStore";
import { DeploymentCard } from "@/components/cicd/DeploymentCard";
import { ProjectSelect } from "@/components/ProjectSelect";
import type { Deployment } from "@/types";
import type { DeploymentUpdatedPayload } from "@/lib/socket.events";
import { PageShell } from "@/components/PageShell";
import { duration, ease, buttonTap, staggerContainer, fadeUp } from "@/lib/motion";

export default function DeployPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const { projectId: storedId, setProjectId } = useProjectStore();
  const urlId = searchParams.get("projectId") ?? "";
  const [selectedId, setSelectedId] = useState(urlId || storedId);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDeployments = useCallback(async (pid: string) => {
    if (!pid) { setDeployments([]); return; }
    setLoading(true);
    setError(null);
    try { setDeployments(await api.cicd.list(pid)); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to load deployments"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadDeployments(selectedId); }, [selectedId, loadDeployments]);

  function handleProjectChange(id: string) {
    setSelectedId(id);
    setProjectId(id);
    const p = new URLSearchParams();
    if (id) p.set("projectId", id);
    router.replace(`/deploy?${p.toString()}`);
  }

  const handleDeploymentUpdated = useCallback((payload: DeploymentUpdatedPayload) => {
    if (payload.projectId !== selectedId) return;
    setDeployments((prev) => {
      const idx = prev.findIndex((d) => d.id === payload.deploymentId);
      const updated: Deployment = {
        id: payload.deploymentId,
        projectId: payload.projectId,
        taskId: payload.taskId,
        status: payload.status,
        previewUrl: payload.previewUrl,
        errorMsg: payload.errorMsg,
        log: payload.log,
        testDurationMs: null,
        buildDurationMs: null,
        createdAt: idx >= 0 ? prev[idx]!.createdAt : new Date().toISOString(),
        updatedAt: payload.updatedAt,
      };
      if (idx >= 0) { const next = [...prev]; next[idx] = updated; return next; }
      return [updated, ...prev];
    });
  }, [selectedId]);

  const { status: socketStatus } = useSocket({ projectId: selectedId || null, onDeploymentUpdated: handleDeploymentUpdated });

  async function handleTrigger() {
    if (!selectedId) return;
    setTriggering(true);
    setError(null);
    try { await api.cicd.trigger(selectedId); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to trigger deployment"); }
    finally { setTriggering(false); }
  }

  const stats = [
    { label: "Total", value: deployments.length, color: "text-gray-900" },
    { label: "Running", value: deployments.filter((d) => d.status === "RUNNING").length, color: "text-indigo-600" },
    { label: "Success", value: deployments.filter((d) => d.status === "SUCCESS").length, color: "text-green-600" },
    { label: "Failed", value: deployments.filter((d) => d.status === "FAILED").length, color: "text-red-600" },
  ];

  return (
    <PageShell>
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-gray-700 bg-[#1a1f2e] px-8">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-medium text-gray-100">Deployments</h1>
          <span className="flex items-center gap-1.5 text-xs text-gray-500">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                socketStatus === "connected" ? "bg-green-500" :
                socketStatus === "connecting" ? "bg-amber-400 animate-pulse" : "bg-gray-600"
              }`}
            />
            {socketStatus === "connected" ? "Live" : socketStatus === "connecting" ? "Connecting" : "Offline"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <ProjectSelect value={selectedId} onChange={handleProjectChange} />
          <motion.button
            onClick={handleTrigger}
            disabled={!selectedId || triggering}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            whileTap={buttonTap}
            transition={{ duration: duration.fast }}
          >
            {triggering ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                <path d="M8 1a7 7 0 100 14A7 7 0 008 1zM6.5 5.5l4 2.5-4 2.5V5.5z" />
              </svg>
            )}
            {triggering ? "Triggering…" : "Deploy"}
          </motion.button>
        </div>
      </header>

      <main className="flex-1 px-8 py-8">
        {/* Stats */}
        {selectedId && deployments.length > 0 && (
          <motion.div
            className="mb-6 flex gap-3"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            {stats.map(({ label, value, color }) => (
              <motion.div key={label} variants={fadeUp} className="rounded-xl border border-gray-700 bg-[#1a1f2e] px-5 py-4 shadow-sm">
                <p className={`text-2xl font-semibold ${color.replace('gray-900', 'gray-100').replace('indigo-600', 'indigo-400').replace('green-600', 'green-400').replace('red-600', 'red-400')}`}>{value}</p>
                <p className="mt-0.5 text-xs text-gray-400">{label}</p>
              </motion.div>
            ))}
          </motion.div>
        )}

        {error && (
          <div className="mb-5 rounded-lg border border-red-900 bg-red-950/90 px-4 py-3 text-sm text-red-300">{error}</div>
        )}

        {!selectedId ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-700 py-20">
            <p className="text-sm text-gray-500">Select a project to view deployments</p>
          </div>
        ) : loading ? (
          <div className="flex items-center gap-2 py-12 text-sm text-gray-500">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-700 border-t-gray-400" />
            Loading deployments…
          </div>
        ) : deployments.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-700 py-20 text-center">
            <p className="text-sm text-gray-500">No deployments yet.</p>
            <p className="mt-1 text-xs text-gray-600">
              Deployments trigger automatically when a task pipeline completes.
            </p>
          </div>
        ) : (
          <motion.div
            className="space-y-3"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            {deployments.map((d) => (
              <motion.div key={d.id} variants={fadeUp}>
                <DeploymentCard deployment={d} />
              </motion.div>
            ))}
          </motion.div>
        )}
      </main>
    </PageShell>
  );
}
