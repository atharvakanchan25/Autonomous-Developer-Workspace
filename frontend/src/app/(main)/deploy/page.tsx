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

const PLATFORMS = [
  {
    id: "vercel",
    name: "Vercel",
    desc: "Zero-config deployments with global edge network.",
    badge: "Recommended",
    badgeColor: "bg-[var(--accent)]/15 text-[var(--accent)] border-[var(--accent)]/30",
    icon: (
      <svg viewBox="0 0 76 65" fill="currentColor" className="h-6 w-6">
        <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
      </svg>
    ),
    gradient: "from-white/10 to-white/5",
    border: "border-white/20 hover:border-white/40",
    href: "https://vercel.com/new",
    steps: ["Push code to GitHub", "Import repo on Vercel", "Auto-deploy on every push"],
  },
  {
    id: "github",
    name: "GitHub Pages",
    desc: "Free static hosting directly from your repository.",
    badge: "Free",
    badgeColor: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
      </svg>
    ),
    gradient: "from-indigo-500/10 to-purple-500/5",
    border: "border-indigo-500/20 hover:border-indigo-400/40",
    href: "https://pages.github.com",
    steps: ["Enable Pages in repo settings", "Set branch to main/docs", "Your site is live instantly"],
  },
  {
    id: "infinityfree",
    name: "InfinityFree",
    desc: "Free PHP & MySQL hosting with unlimited bandwidth.",
    badge: "Free Hosting",
    badgeColor: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" />
      </svg>
    ),
    gradient: "from-amber-500/10 to-orange-500/5",
    border: "border-amber-500/20 hover:border-amber-400/40",
    href: "https://infinityfree.com",
    steps: ["Create free account", "Upload files via FTP/FileManager", "Point domain or use subdomain"],
  },
];

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
  const [expandedPlatform, setExpandedPlatform] = useState<string | null>(null);
  const [showVercelModal, setShowVercelModal] = useState(false);
  const [vercelProjectName, setVercelProjectName] = useState("");
  const [deployingToVercel, setDeployingToVercel] = useState(false);
  const [vercelLiveUrl, setVercelLiveUrl] = useState<string | null>(null);
  const [vercelAuthMethod, setVercelAuthMethod] = useState<"oauth" | "token" | null>(null);

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
    { label: "Total", value: deployments.length, color: "text-gray-100", bg: "bg-white/5" },
    { label: "Running", value: deployments.filter((d) => d.status === "RUNNING").length, color: "text-indigo-300", bg: "bg-indigo-500/10" },
    { label: "Success", value: deployments.filter((d) => d.status === "SUCCESS").length, color: "text-emerald-300", bg: "bg-emerald-500/10" },
    { label: "Failed", value: deployments.filter((d) => d.status === "FAILED").length, color: "text-red-300", bg: "bg-red-500/10" },
  ];

  return (
    <PageShell>
      {/* Ambient orbs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="absolute top-0 left-1/3 h-[400px] w-[400px] rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #6366f1 0%, transparent 70%)", filter: "blur(80px)" }} />
        <div className="absolute bottom-1/4 right-0 h-[300px] w-[300px] rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #2dd4bf 0%, transparent 70%)", filter: "blur(80px)" }} />
      </div>

      {/* Top bar */}
      <header className="app-topbar relative flex h-20 shrink-0 items-center justify-between px-8">
        <div className="flex items-center gap-3">
          <h1 className="app-title text-2xl font-semibold text-gray-100">Deploy</h1>
          <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-gray-400">
            <span className={`h-1.5 w-1.5 rounded-full ${
              socketStatus === "connected" ? "bg-emerald-400" :
              socketStatus === "connecting" ? "bg-amber-400 animate-pulse" : "bg-gray-600"
            }`} />
            {socketStatus === "connected" ? "Live" : socketStatus === "connecting" ? "Connecting" : "Offline"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <ProjectSelect value={selectedId} onChange={handleProjectChange} />
          <motion.button
            onClick={handleTrigger}
            disabled={!selectedId || triggering}
            className="app-button-primary flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold disabled:opacity-40"
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
            {triggering ? "Triggering…" : "Run Pipeline"}
          </motion.button>
        </div>
      </header>

      <main className="relative flex-1 px-8 py-10 space-y-12">

        {/* ── Deploy to section ── */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: duration.slow, ease: ease.enter }}
        >
          <div className="mb-1 flex items-center gap-2">
            <h2 className="app-title text-xl font-semibold text-gray-100">Deploy to</h2>
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-gray-500">Choose a platform</span>
          </div>
          <p className="mb-6 text-sm text-[var(--text-secondary)]">
            Export your generated code and ship it to any platform in minutes.
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {PLATFORMS.map((p, i) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: duration.slow, delay: i * 0.07 }}
              >
                <div
                  className={`group relative cursor-pointer rounded-2xl border bg-gradient-to-br ${p.gradient} ${p.border} p-5 transition-all duration-200 hover:shadow-lg`}
                  onClick={() => setExpandedPlatform(expandedPlatform === p.id ? null : p.id)}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white">
                        {p.icon}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-100">{p.name}</p>
                        <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium ${p.badgeColor}`}>
                          {p.badge}
                        </span>
                      </div>
                    </div>
                    <svg
                      viewBox="0 0 16 16" fill="currentColor"
                      className={`h-4 w-4 text-gray-500 transition-transform duration-200 ${expandedPlatform === p.id ? "rotate-90" : ""}`}
                    >
                      <path fillRule="evenodd" d="M6.22 3.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z" clipRule="evenodd" />
                    </svg>
                  </div>

                  <p className="text-xs leading-5 text-[var(--text-secondary)]">{p.desc}</p>

                  {/* Expanded steps */}
                  <AnimatePresence>
                    {expandedPlatform === p.id && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: duration.standard, ease: ease.enter }}
                        className="overflow-hidden"
                      >
                        <div className="mt-4 space-y-2 border-t border-white/10 pt-4">
                          {p.steps.map((step, idx) => (
                            <div key={idx} className="flex items-start gap-2.5">
                              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white/10 text-[9px] font-bold text-gray-300">
                                {idx + 1}
                              </span>
                              <p className="text-xs text-gray-400">{step}</p>
                            </div>
                          ))}
                          <a
                            href={p.id === "vercel" ? "#" : p.href}
                            target={p.id === "vercel" ? "_self" : "_blank"}
                            rel="noopener noreferrer"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (p.id === "vercel") {
                                e.preventDefault();
                                if (!selectedId) {
                                  alert("Please select a project first");
                                  return;
                                }
                                setShowVercelModal(true);
                              }
                            }}
                            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 py-3 text-sm font-semibold text-white transition-all hover:from-indigo-500/30 hover:to-purple-500/30 hover:border-white/30 hover:shadow-lg"
                          >
                            <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
                              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                            </svg>
                            Deploy to {p.name}
                          </a>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* ── Divider ── */}
        <div className="flex items-center gap-4">
          <div className="h-px flex-1 bg-white/[0.06]" />
          <span className="text-xs text-[var(--text-muted)]">CI/CD Pipeline</span>
          <div className="h-px flex-1 bg-white/[0.06]" />
        </div>

        {/* ── Stats ── */}
        {selectedId && deployments.length > 0 && (
          <motion.div
            className="flex gap-3"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            {stats.map(({ label, value, color, bg }) => (
              <motion.div
                key={label}
                variants={fadeUp}
                className={`app-panel flex items-center gap-3 rounded-2xl px-5 py-4 ${bg}`}
              >
                <p className={`text-2xl font-semibold ${color}`}>{value}</p>
                <p className="text-xs text-gray-500">{label}</p>
              </motion.div>
            ))}
          </motion.div>
        )}

        {error && (
          <div className="rounded-xl border border-red-900/60 bg-red-950/60 px-4 py-3 text-sm text-red-300">{error}</div>
        )}

        {/* ── Deployments list ── */}
        {!selectedId ? (
          <div className="app-empty flex flex-col items-center justify-center rounded-[28px] py-20 text-center">
            <p className="text-2xl mb-2">🚀</p>
            <p className="text-sm text-gray-500">Select a project to view pipeline runs</p>
          </div>
        ) : loading ? (
          <div className="flex items-center gap-2 py-12 text-sm text-gray-500">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-700 border-t-gray-400" />
            Loading deployments…
          </div>
        ) : deployments.length === 0 ? (
          <div className="app-empty flex flex-col items-center justify-center rounded-[28px] py-20 text-center">
            <p className="text-2xl mb-2">⚙️</p>
            <p className="text-sm text-gray-500">No pipeline runs yet.</p>
            <p className="mt-1 text-xs text-gray-600">Deployments trigger automatically when a task pipeline completes.</p>
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

      {/* Vercel Deploy Modal */}
      {showVercelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => {
          setShowVercelModal(false);
          setVercelAuthMethod(null);
        }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="app-panel w-full max-w-md p-6 m-4"
            onClick={(e) => e.stopPropagation()}
          >
            {!vercelAuthMethod ? (
              // Step 1: Choose auth method
              <>
                <h3 className="text-xl font-semibold text-gray-100 mb-2">Deploy to Vercel</h3>
                <p className="text-sm text-gray-400 mb-6">
                  Choose how you want to connect to Vercel
                </p>

                <div className="space-y-3">
                  <button
                    onClick={() => {
                      window.open("https://vercel.com/new", "_blank");
                      setShowVercelModal(false);
                      setVercelAuthMethod(null);
                    }}
                    className="w-full flex items-center gap-4 p-4 rounded-xl border border-white/20 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 hover:from-indigo-500/20 hover:to-purple-500/20 transition-all group"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 group-hover:bg-white/20 transition-colors">
                      <svg viewBox="0 0 76 65" fill="currentColor" className="h-6 w-6 text-white">
                        <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
                      </svg>
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-semibold text-gray-100">Connect Vercel Account</p>
                      <p className="text-xs text-gray-400 mt-0.5">Import from GitHub and auto-deploy</p>
                    </div>
                    <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4 text-gray-400">
                      <path d="M6.22 8.72a.75.75 0 001.06 1.06l5.22-5.22v1.69a.75.75 0 001.5 0v-3.5a.75.75 0 00-.75-.75h-3.5a.75.75 0 000 1.5h1.69L6.22 8.72z" />
                    </svg>
                  </button>

                  <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-white/10" />
                    <span className="text-xs text-gray-500">OR</span>
                    <div className="h-px flex-1 bg-white/10" />
                  </div>

                  <button
                    onClick={() => setVercelAuthMethod("token")}
                    className="w-full flex items-center gap-4 p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all group"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 group-hover:bg-white/20 transition-colors">
                      <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-gray-300">
                        <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-semibold text-gray-100">Use API Token</p>
                      <p className="text-xs text-gray-400 mt-0.5">Deploy directly with your token</p>
                    </div>
                    <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4 text-gray-400">
                      <path fillRule="evenodd" d="M6.22 4.22a.75.75 0 011.06 0l3.25 3.25a.75.75 0 010 1.06l-3.25 3.25a.75.75 0 01-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 010-1.06z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>

                <button
                  onClick={() => {
                    setShowVercelModal(false);
                    setVercelAuthMethod(null);
                  }}
                  className="w-full mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-gray-300 transition-colors hover:bg-white/10"
                >
                  Cancel
                </button>
              </>
            ) : vercelLiveUrl ? (
              // Success state
              <>
                <div className="flex flex-col items-center gap-4 py-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20">
                    <svg viewBox="0 0 20 20" fill="currentColor" className="h-7 w-7 text-emerald-400">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-100">Deployed!</h3>
                  <p className="text-sm text-gray-400 text-center">Your frontend is live on Vercel</p>
                  <a
                    href={vercelLiveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-center text-sm font-semibold text-emerald-400 hover:bg-emerald-500/20 transition-colors break-all"
                  >
                    {vercelLiveUrl}
                  </a>
                </div>
                <button
                  onClick={() => { setShowVercelModal(false); setVercelAuthMethod(null); setVercelLiveUrl(null); setVercelProjectName(""); }}
                  className="w-full mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-gray-300 hover:bg-white/10"
                >
                  Close
                </button>
              </>
            ) : (
              // Step 2: Project name + deploy
              <>
                <div className="flex items-center gap-2 mb-4">
                  <button onClick={() => setVercelAuthMethod(null)} className="text-gray-400 hover:text-gray-200">
                    <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
                      <path fillRule="evenodd" d="M9.78 4.22a.75.75 0 010 1.06L7.06 8l2.72 2.72a.75.75 0 11-1.06 1.06L5.47 8.53a.75.75 0 010-1.06l3.25-3.25a.75.75 0 011.06 0z" clipRule="evenodd" />
                    </svg>
                  </button>
                  <h3 className="text-xl font-semibold text-gray-100">Deploy with Token</h3>
                </div>
                <p className="text-sm text-gray-400 mb-6">
                  The Vercel token is configured in the backend. Just confirm the project name.
                </p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Project Name (optional)</label>
                    <input
                      type="text"
                      value={vercelProjectName}
                      onChange={(e) => setVercelProjectName(e.target.value)}
                      placeholder="my-awesome-project"
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div className="flex gap-3 mt-6">
                    <button
                      onClick={() => { setShowVercelModal(false); setVercelAuthMethod(null); setVercelProjectName(""); }}
                      className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-gray-300 hover:bg-white/10"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        if (!selectedId) { alert("Please select a project"); return; }
                        setDeployingToVercel(true);
                        setError(null);
                        try {
                          const result = await api.cicd.deployToVercel(selectedId, vercelProjectName || undefined);
                          setVercelLiveUrl(result.url);
                          await loadDeployments(selectedId);
                        } catch (err) {
                          setError(err instanceof Error ? err.message : "Deployment failed");
                        } finally {
                          setDeployingToVercel(false);
                        }
                      }}
                      disabled={deployingToVercel}
                      className="flex-1 rounded-xl border border-indigo-500/50 bg-indigo-500/10 px-4 py-2.5 text-sm font-semibold text-indigo-400 hover:bg-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {deployingToVercel ? "Deploying..." : "Deploy Now"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        </div>
      )}
    </PageShell>
  );
}
