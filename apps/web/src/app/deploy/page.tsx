"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useSocket } from "@/lib/useSocket";
import { DeploymentCard } from "@/components/cicd/DeploymentCard";
import { ProjectSelect } from "@/components/ProjectSelect";
import type { Deployment } from "@/types";
import type { DeploymentUpdatedPayload } from "@/lib/socket.events";

const SOCKET_DOT: Record<string, string> = {
  connected: "bg-green-500 animate-pulse",
  connecting: "bg-yellow-500",
  disconnected: "bg-gray-400",
};
const SOCKET_LABEL: Record<string, string> = {
  connected: "Live", connecting: "Connecting…", disconnected: "Polling",
};

export default function DeployPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [selectedId, setSelectedId] = useState(searchParams.get("projectId") ?? "");
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

  const { status: socketStatus } = useSocket({
    projectId: selectedId || null,
    onDeploymentUpdated: handleDeploymentUpdated,
  });

  async function handleTrigger() {
    if (!selectedId) return;
    setTriggering(true);
    setError(null);
    try { await api.cicd.trigger(selectedId); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to trigger deployment"); }
    finally { setTriggering(false); }
  }

  const activeCount  = deployments.filter((d) => d.status === "RUNNING").length;
  const successCount = deployments.filter((d) => d.status === "SUCCESS").length;
  const failedCount  = deployments.filter((d) => d.status === "FAILED").length;

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Deployments</h1>
          <p className="mt-0.5 text-sm text-gray-500">CI/CD pipeline — tests → build → preview</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs text-gray-400">
            <span className={`h-2 w-2 rounded-full ${SOCKET_DOT[socketStatus]}`} />
            {SOCKET_LABEL[socketStatus]}
          </span>
          <ProjectSelect value={selectedId} onChange={handleProjectChange} />
          <button
            onClick={handleTrigger}
            disabled={!selectedId || triggering}
            className="rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-40"
          >
            {triggering ? "Triggering…" : "▶ Deploy"}
          </button>
        </div>
      </div>

      {/* Stats */}
      {selectedId && deployments.length > 0 && (
        <div className="mb-6 flex gap-4">
          {[
            { label: "Total",   value: deployments.length, color: "text-gray-700" },
            { label: "Running", value: activeCount,         color: "text-blue-600" },
            { label: "Success", value: successCount,        color: "text-green-600" },
            { label: "Failed",  value: failedCount,         color: "text-red-600" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-center">
              <p className={`text-xl font-semibold ${color}`}>{value}</p>
              <p className="text-xs text-gray-500">{label}</p>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {!selectedId ? (
        <div className="rounded-lg border border-dashed border-gray-300 py-16 text-center">
          <p className="text-sm text-gray-400">Select a project to view deployments</p>
        </div>
      ) : loading ? (
        <div className="flex justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
        </div>
      ) : deployments.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 py-16 text-center">
          <p className="text-sm text-gray-400">No deployments yet.</p>
          <p className="mt-1 text-xs text-gray-400">Deployments trigger automatically when a task pipeline completes, or click ▶ Deploy above.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {deployments.map((d) => <DeploymentCard key={d.id} deployment={d} />)}
        </div>
      )}
    </main>
  );
}
