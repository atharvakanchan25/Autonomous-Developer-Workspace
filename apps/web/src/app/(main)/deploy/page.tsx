"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import { useSocket } from "@/lib/useSocket";
import { ProjectSelect } from "@/components/ProjectSelect";
import type { Deployment, CicdStageLog } from "@/types";
import type { DeploymentUpdatedPayload } from "@/lib/socket.events";
import { PageShell } from "@/components/PageShell";
import { duration, ease, buttonTap, staggerContainer, fadeUp } from "@/lib/motion";

// ── Confetti ──────────────────────────────────────────────────────────────────

function fireConfetti() {
  const script = document.createElement("script");
  script.src = "https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js";
  script.onload = () => {
    (window as any).confetti?.({
      particleCount: 120,
      spread: 70,
      origin: { y: 0.6 },
    });
  };
  document.head.appendChild(script);
}

// ── Deploy timer ──────────────────────────────────────────────────────────────

function useDeployTimer(active: boolean) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!active) { setSecs(0); return; }
    const id = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
  return secs;
}

// ── Copy button ───────────────────────────────────────────────────────────────

function CopyButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:border-gray-600 hover:text-gray-100"
    >
      {copied ? (
        <>
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-green-400">
            <path fillRule="evenodd" d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
          </svg>
          <span className="text-green-400">Copied!</span>
        </>
      ) : (
        <>
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
            <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 010 1.5h-1.5a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-1.5a.75.75 0 011.5 0v1.5A1.75 1.75 0 019.25 16h-7.5A1.75 1.75 0 010 14.25v-7.5z" />
            <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0114.25 11h-7.5A1.75 1.75 0 015 9.25v-7.5zm1.75-.25a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25h-7.5z" />
          </svg>
          Copy Link
        </>
      )}
    </button>
  );
}

// ── Share button ──────────────────────────────────────────────────────────────

function ShareButton({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  async function handleShare() {
    if (navigator.share) {
      try { await navigator.share({ title: `ADW — ${title}`, url }); return; }
      catch { /* user cancelled */ return; }
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button
      onClick={handleShare}
      className="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:border-gray-600 hover:text-gray-100"
    >
      {copied ? (
        <span className="text-green-400">Copied!</span>
      ) : (
        <>
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
            <path d="M11.013 1.427a1.75 1.75 0 012.474 0l1.086 1.086a1.75 1.75 0 010 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 01-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61zm1.414 1.06a.25.25 0 00-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 000-.354l-1.086-1.086zM11.189 6.25L9.75 4.81l-6.286 6.287a.25.25 0 00-.064.108l-.558 1.953 1.953-.558a.249.249 0 00.108-.064l6.286-6.286z" />
          </svg>
          Share
        </>
      )}
    </button>
  );
}

// ── Stage icon ────────────────────────────────────────────────────────────────

function StageIcon({ status }: { status: string }) {
  if (status === "running")
    return <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-indigo-400/30 border-t-indigo-400" />;
  if (status === "passed")
    return (
      <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 text-green-400">
        <path fillRule="evenodd" d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
      </svg>
    );
  if (status === "failed")
    return (
      <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 text-red-400">
        <path fillRule="evenodd" d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
      </svg>
    );
  return <span className="h-3.5 w-3.5 rounded-full border-2 border-gray-600" />;
}

// ── Pipeline steps ────────────────────────────────────────────────────────────

function PipelineSteps({ log }: { log: CicdStageLog[] }) {
  const stages = ["tests", "build", "deploy"];
  const stageMap = Object.fromEntries(log.map((l) => [l.stage, l]));
  return (
    <div className="flex items-center gap-2">
      {stages.map((s, i) => {
        const entry = stageMap[s];
        const status = entry?.status ?? "pending";
        return (
          <div key={s} className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <StageIcon status={status} />
              <span className={`text-xs capitalize ${
                status === "passed" ? "text-green-400" :
                status === "failed" ? "text-red-400" :
                status === "running" ? "text-indigo-300" : "text-gray-600"
              }`}>{s}</span>
              {entry?.durationMs && <span className="text-[10px] text-gray-600">{entry.durationMs}ms</span>}
            </div>
            {i < stages.length - 1 && <span className="h-px w-4 bg-gray-700" />}
          </div>
        );
      })}
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    SUCCESS: "bg-green-900/50 text-green-300 border-green-800/50",
    FAILED:  "bg-red-900/50 text-red-300 border-red-800/50",
    RUNNING: "bg-indigo-900/50 text-indigo-300 border-indigo-800/50",
    PENDING: "bg-gray-800 text-gray-400 border-gray-700",
  };
  const dots: Record<string, string> = {
    SUCCESS: "bg-green-400", FAILED: "bg-red-400",
    RUNNING: "bg-indigo-400 animate-pulse", PENDING: "bg-gray-600",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[status] ?? styles.PENDING}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dots[status] ?? dots.PENDING}`} />
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

// ── Deployment card ───────────────────────────────────────────────────────────

function DeployCard({ d, onSuccess }: { d: Deployment; onSuccess: () => void }) {
  const [showPreview, setShowPreview] = useState(false);
  const successFired = useRef(false);

  useEffect(() => {
    if (d.status === "SUCCESS" && !successFired.current) {
      successFired.current = true;
      onSuccess();
    }
  }, [d.status, onSuccess]);

  const time = new Date(d.createdAt).toLocaleString();
  const failDetail = d.log?.find((l) => l.status === "failed")?.detail;

  return (
    <motion.div variants={fadeUp} className="rounded-xl border border-gray-700 bg-[#1a1f2e] shadow-sm overflow-hidden">
      <div className="p-5">
        {/* Top row */}
        <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <StatusBadge status={d.status} />
            <span className="text-xs text-gray-500">{time}</span>
          </div>
          {d.previewUrl && (
            <div className="flex items-center gap-2 flex-wrap">
              <a
                href={d.previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-lg border border-indigo-700/50 bg-indigo-900/30 px-3 py-1.5 text-xs font-medium text-indigo-300 transition-colors hover:bg-indigo-900/60"
              >
                <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                  <path fillRule="evenodd" d="M8.914 6.025a.75.75 0 011.06 0 3.5 3.5 0 010 4.95l-2 2a3.5 3.5 0 01-4.95-4.95l1.088-1.087a.75.75 0 011.06 1.06L3.084 9.087a2 2 0 002.829 2.828l2-2a2 2 0 000-2.828.75.75 0 010-1.06z" clipRule="evenodd" />
                  <path fillRule="evenodd" d="M7.086 9.975a.75.75 0 01-1.06 0 3.5 3.5 0 010-4.95l2-2a3.5 3.5 0 014.95 4.95l-1.088 1.087a.75.75 0 01-1.06-1.06l1.087-1.088a2 2 0 00-2.829-2.828l-2 2a2 2 0 000 2.828.75.75 0 010 1.06z" clipRule="evenodd" />
                </svg>
                View Preview
              </a>
              <CopyButton url={d.previewUrl} />
              <ShareButton url={d.previewUrl} title="My ADW Project" />
              <button
                onClick={() => setShowPreview((v) => !v)}
                className="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:border-gray-600"
              >
                {showPreview ? "Hide" : "Preview"}
              </button>
            </div>
          )}
        </div>

        <PipelineSteps log={d.log ?? []} />

        {failDetail && (
          <p className="mt-3 rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-xs text-red-300">
            {failDetail}
          </p>
        )}

        {d.previewUrl && (
          <p className="mt-2 truncate text-xs text-gray-600">
            🔗 <span className="text-indigo-500">{d.previewUrl}</span>
          </p>
        )}
      </div>

      {/* Browser mockup preview */}
      <AnimatePresence>
        {showPreview && d.previewUrl && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: duration.standard, ease: ease.enter }}
            className="overflow-hidden border-t border-gray-700"
          >
            {/* Browser chrome */}
            <div className="bg-[#252b3b]">
              {/* Title bar */}
              <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-700/60">
                {/* Traffic lights */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="h-3 w-3 rounded-full bg-red-500/80" />
                  <span className="h-3 w-3 rounded-full bg-yellow-500/80" />
                  <span className="h-3 w-3 rounded-full bg-green-500/80" />
                </div>
                {/* Address bar */}
                <div className="flex flex-1 items-center gap-2 rounded-md bg-[#1a1f2e] border border-gray-700/60 px-3 py-1">
                  <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 shrink-0 text-green-400">
                    <path fillRule="evenodd" d="M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0z" clipRule="evenodd" />
                    <path d="M8 3.5a.5.5 0 01.5.5v3.793l2.146 2.147a.5.5 0 01-.707.707l-2.293-2.293A.5.5 0 017.5 8V4a.5.5 0 01.5-.5z" />
                  </svg>
                  <span className="truncate text-[11px] text-gray-400 font-mono">{d.previewUrl}</span>
                </div>
              </div>
              {/* Page content mockup */}
              <div className="relative flex h-44 flex-col items-center justify-center gap-3 overflow-hidden px-6"
                style={{ background: "linear-gradient(135deg, #0f1419 0%, #1a1f2e 50%, #0f1419 100%)" }}
              >
                {/* Subtle grid pattern */}
                <div className="pointer-events-none absolute inset-0 opacity-10"
                  style={{ backgroundImage: "radial-gradient(circle, #6366f1 1px, transparent 1px)", backgroundSize: "24px 24px" }}
                />
                {/* Globe icon */}
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-900/40 border border-green-800/50">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6 text-green-400">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20" />
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-gray-100">Site deployed successfully</p>
                  <p className="mt-0.5 text-xs text-indigo-400 truncate max-w-xs">{d.previewUrl}</p>
                  <p className="mt-2 text-[11px] text-gray-600">Click "View Preview" to open the live site</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Style Modal ───────────────────────────────────────────────────────────────

const STYLE_OPTIONS = {
  theme:  { label: "Color theme", choices: ["Dark", "Light", "Colorful"] },
  font:   { label: "Font style",  choices: ["Modern", "Classic", "Playful"] },
  layout: { label: "Layout",      choices: ["Minimal", "Spacious", "Compact"] },
} as const;

type StyleKey = keyof typeof STYLE_OPTIONS;
type StylePrefs = { theme: string; font: string; layout: string };

function StyleModal({ onConfirm, onCancel }: { onConfirm: (p: StylePrefs) => void; onCancel: () => void }) {
  const [prefs, setPrefs] = useState<StylePrefs>({ theme: "Dark", font: "Modern", layout: "Minimal" });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-sm rounded-2xl border border-gray-700 bg-[#1a1f2e] p-6 shadow-2xl"
      >
        <h2 className="mb-1 text-base font-semibold text-gray-100">Deployment Style</h2>
        <p className="mb-5 text-xs text-gray-500">Choose how your generated site looks</p>
        <div className="space-y-4">
          {(Object.entries(STYLE_OPTIONS) as [StyleKey, typeof STYLE_OPTIONS[StyleKey]][]).map(([key, { label, choices }]) => (
            <div key={key}>
              <p className="mb-2 text-xs font-medium text-gray-400">{label}</p>
              <div className="flex gap-2">
                {choices.map((c) => (
                  <button
                    key={c}
                    onClick={() => setPrefs((p) => ({ ...p, [key]: c }))}
                    className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                      prefs[key] === c
                        ? "border-indigo-500 bg-indigo-600/30 text-indigo-300"
                        : "border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600 hover:text-gray-300"
                    }`}
                  >{c}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 flex gap-3">
          <button onClick={onCancel} className="flex-1 rounded-lg border border-gray-700 py-2 text-xs text-gray-400 hover:text-gray-300">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(prefs)}
            className="flex-1 rounded-lg bg-indigo-600 py-2 text-xs font-medium text-white hover:bg-indigo-500"
          >
            Deploy
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DeployPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const urlId = searchParams.get("projectId") ?? "";
  const [selectedId, setSelectedId] = useState(urlId);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showStyleModal, setShowStyleModal] = useState(false);

  const timerSecs = useDeployTimer(triggering);

  const loadDeployments = useCallback(async (pid: string) => {
    if (!pid) { setDeployments([]); return; }
    setLoading(true); setError(null);
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
        id: payload.deploymentId, projectId: payload.projectId,
        taskId: payload.taskId, status: payload.status,
        previewUrl: payload.previewUrl, errorMsg: payload.errorMsg,
        log: payload.log, testDurationMs: null, buildDurationMs: null,
        createdAt: idx >= 0 ? prev[idx]!.createdAt : new Date().toISOString(),
        updatedAt: payload.updatedAt,
      };
      if (idx >= 0) { const next = [...prev]; next[idx] = updated; return next; }
      return [updated, ...prev];
    });
  }, [selectedId]);

  const { status: socketStatus } = useSocket({ projectId: selectedId || null, onDeploymentUpdated: handleDeploymentUpdated });

  async function handleStyleConfirm(prefs: StylePrefs) {
    setShowStyleModal(false);
    setTriggering(true); setError(null);
    try {
      await api.cicd.trigger(selectedId, undefined, {
        style_theme: prefs.theme, style_font: prefs.font, style_layout: prefs.layout,
      });
      setTimeout(() => loadDeployments(selectedId), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to trigger deployment");
    } finally {
      setTriggering(false);
    }
  }

  const handleSuccess = useCallback(() => {
    fireConfetti();
    loadDeployments(selectedId);
  }, [selectedId, loadDeployments]);

  const total   = deployments.length;
  const running = deployments.filter((d) => d.status === "RUNNING").length;
  const success = deployments.filter((d) => d.status === "SUCCESS").length;
  const failed  = deployments.filter((d) => d.status === "FAILED").length;

  return (
    <PageShell>
      {showStyleModal && (
        <StyleModal onConfirm={handleStyleConfirm} onCancel={() => setShowStyleModal(false)} />
      )}

      <header className="flex h-14 shrink-0 items-center justify-between border-b border-gray-700 bg-[#1a1f2e] px-8">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-medium text-gray-100">Deployments</h1>
          <span className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className={`h-1.5 w-1.5 rounded-full ${
              socketStatus === "connected" ? "bg-green-500" :
              socketStatus === "connecting" ? "bg-amber-400 animate-pulse" : "bg-gray-600"
            }`} />
            {socketStatus === "connected" ? "Live" : socketStatus === "connecting" ? "Connecting" : "Offline"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <ProjectSelect value={selectedId} onChange={handleProjectChange} />
          <motion.button
            onClick={() => { if (!selectedId || triggering) return; setShowStyleModal(true); }}
            disabled={!selectedId || triggering}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
            whileTap={buttonTap} transition={{ duration: duration.fast }}
          >
            {triggering ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Deploying… {timerSecs}s
              </>
            ) : (
              <>
                <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                  <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
                Deploy to Vercel
              </>
            )}
          </motion.button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-8 py-8">
        {/* Stats */}
        {selectedId && total > 0 && (
          <motion.div className="mb-6 grid grid-cols-4 gap-3" variants={staggerContainer} initial="hidden" animate="visible">
            {[
              { label: "Total",   value: total,   color: "text-gray-100" },
              { label: "Running", value: running, color: "text-indigo-400" },
              { label: "Success", value: success, color: "text-green-400" },
              { label: "Failed",  value: failed,  color: "text-red-400" },
            ].map(({ label, value, color }) => (
              <motion.div key={label} variants={fadeUp} className="rounded-xl border border-gray-700 bg-[#1a1f2e] px-5 py-4 shadow-sm">
                <p className={`text-2xl font-semibold ${color}`}>{value}</p>
                <p className="mt-0.5 text-xs text-gray-400">{label}</p>
              </motion.div>
            ))}
          </motion.div>
        )}

        <AnimatePresence>
          {error && (
            <motion.div
              className="mb-5 rounded-lg border border-red-900 bg-red-950/90 px-4 py-3 text-sm text-red-300"
              initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }} transition={{ duration: duration.fast }}
            >{error}</motion.div>
          )}
        </AnimatePresence>

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
              Click <span className="text-indigo-400">Deploy to Vercel</span> to deploy your project live.
            </p>
          </div>
        ) : (
          <motion.div className="space-y-3" variants={staggerContainer} initial="hidden" animate="visible">
            {deployments.map((d) => (
              <DeployCard key={d.id} d={d} onSuccess={handleSuccess} />
            ))}
          </motion.div>
        )}
      </main>
    </PageShell>
  );
}
