"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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

const LS_KEY = "adw_deploy_creds";

interface DeployCreds {
  githubToken: string;
  vercelToken: string;
  repoName: string;
  vercelOrgId: string;
}

function loadCreds(): DeployCreds {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { githubToken: "", vercelToken: "", repoName: "", vercelOrgId: "" };
}

function DeployModal({
  initial,
  projectName,
  onConfirm,
  onClose,
}: {
  initial: DeployCreds;
  projectName: string;
  onConfirm: (c: DeployCreds) => void;
  onClose: () => void;
}) {
  const [creds, setCreds] = useState<DeployCreds>({
    ...initial,
    repoName: initial.repoName || projectName.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 40),
  });

  function set(k: keyof DeployCreds, v: string) {
    setCreds((p) => ({ ...p, [k]: v }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!creds.githubToken || !creds.vercelToken || !creds.repoName) return;
    localStorage.setItem(LS_KEY, JSON.stringify(creds));
    onConfirm(creds);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <motion.div
        className="w-full max-w-md rounded-xl border border-gray-700 bg-[#1a1f2e] p-6 shadow-2xl"
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        transition={{ duration: 0.18 }}
      >
        <h2 className="mb-1 text-base font-semibold text-gray-100">Deploy to GitHub + Vercel</h2>
        <p className="mb-5 text-xs text-gray-500">
          Your tokens are saved locally and never sent to any server other than GitHub/Vercel.
        </p>
        <form onSubmit={submit} className="space-y-4">
          <Field
            label="GitHub Personal Access Token"
            hint={<>Needs <code className="text-indigo-400">repo</code> scope — <a href="https://github.com/settings/tokens/new?scopes=repo" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">create one</a></>}
            type="password"
            value={creds.githubToken}
            onChange={(v) => set("githubToken", v)}
            placeholder="ghp_…"
            required
          />
          <Field
            label="Vercel Token"
            hint={<><a href="https://vercel.com/account/tokens" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">Create a token</a> in your Vercel account settings</>}
            type="password"
            value={creds.vercelToken}
            onChange={(v) => set("vercelToken", v)}
            placeholder="…"
            required
          />
          <Field
            label="GitHub Repo Name"
            hint="Will be created if it doesn't exist"
            type="text"
            value={creds.repoName}
            onChange={(v) => set("repoName", v.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-"))}
            placeholder="my-project"
            required
          />
          <Field
            label="Vercel Team ID (optional)"
            hint="Leave blank for personal account"
            type="text"
            value={creds.vercelOrgId}
            onChange={(v) => set("vercelOrgId", v)}
            placeholder="team_…"
          />
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-600 py-2 text-sm text-gray-400 hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            >
              Deploy →
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function Field({
  label, hint, type, value, onChange, placeholder, required,
}: {
  label: string; hint: React.ReactNode; type: string;
  value: string; onChange: (v: string) => void;
  placeholder?: string; required?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-300">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:border-indigo-500 focus:outline-none"
      />
      <p className="mt-1 text-[11px] text-gray-500">{hint}</p>
    </div>
  );
}

export default function DeployPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const { projectId: storedId, setProjectId } = useProjectStore();
  const urlId = searchParams.get("projectId") ?? "";
  const [selectedId, setSelectedId] = useState(urlId || storedId);
  const [selectedName, setSelectedName] = useState("");
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const loadDeployments = useCallback(async (pid: string) => {
    if (!pid) { setDeployments([]); return; }
    setLoading(true);
    setError(null);
    try { setDeployments(await api.cicd.list(pid)); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to load deployments"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadDeployments(selectedId); }, [selectedId, loadDeployments]);

  // Fetch project name for default repo name
  useEffect(() => {
    if (!selectedId) return;
    api.projects.get(selectedId).then((p) => setSelectedName(p.name)).catch(() => {});
  }, [selectedId]);

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

  async function handleConfirmDeploy(creds: DeployCreds) {
    setShowModal(false);
    setTriggering(true);
    setError(null);
    try {
      await api.cicd.trigger(selectedId, undefined, creds);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to trigger deployment");
    } finally {
      setTriggering(false);
    }
  }

  const stats = [
    { label: "Total",   value: deployments.length,                                          color: "text-gray-100"   },
    { label: "Running", value: deployments.filter((d) => d.status === "RUNNING").length,    color: "text-indigo-400" },
    { label: "Success", value: deployments.filter((d) => d.status === "SUCCESS").length,    color: "text-green-400"  },
    { label: "Failed",  value: deployments.filter((d) => d.status === "FAILED").length,     color: "text-red-400"    },
  ];

  return (
    <PageShell>
      <AnimatePresence>
        {showModal && (
          <DeployModal
            initial={loadCreds()}
            projectName={selectedName}
            onConfirm={handleConfirmDeploy}
            onClose={() => setShowModal(false)}
          />
        )}
      </AnimatePresence>

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
            onClick={() => { if (selectedId) setShowModal(true); }}
            disabled={!selectedId || triggering}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 hover:bg-indigo-500"
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
            {triggering ? "Deploying…" : "Deploy"}
          </motion.button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-8 py-8">
        {/* Stats */}
        {selectedId && deployments.length > 0 && (
          <motion.div className="mb-6 flex gap-3" variants={staggerContainer} initial="hidden" animate="visible">
            {stats.map(({ label, value, color }) => (
              <motion.div key={label} variants={fadeUp} className="rounded-xl border border-gray-700 bg-[#1a1f2e] px-5 py-4 shadow-sm">
                <p className={`text-2xl font-semibold ${color}`}>{value}</p>
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
            <p className="mt-1 text-xs text-gray-600">Click Deploy to push your project to GitHub and Vercel.</p>
          </div>
        ) : (
          <motion.div className="space-y-3" variants={staggerContainer} initial="hidden" animate="visible">
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
