"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { Deployment, CicdStageLog, DeploymentStatus } from "@/types";
import { duration, ease, cardHover, staggerContainer, fadeUp, connectorFill } from "@/lib/motion";

const STATUS_CONFIG: Record<DeploymentStatus, { label: string; dot: string; badge: string; border: string }> = {
  PENDING: { label: "Pending", dot: "bg-gray-500",   badge: "bg-gray-800 text-gray-400",    border: "border-gray-700" },
  RUNNING: { label: "Running", dot: "bg-indigo-500", badge: "bg-indigo-900/60 text-indigo-300", border: "border-indigo-700" },
  SUCCESS: { label: "Success", dot: "bg-green-500",  badge: "bg-green-900/60 text-green-300",   border: "border-green-700" },
  FAILED:  { label: "Failed",  dot: "bg-red-500",    badge: "bg-red-900/60 text-red-300",       border: "border-red-700" },
};

const STAGE_META: Record<string, { label: string }> = {
  github: { label: "GitHub" },
  vercel: { label: "Vercel"  },
  tests:  { label: "Tests"  },
  build:  { label: "Build"  },
  deploy: { label: "Deploy" },
};

const STAGE_STYLES: Record<CicdStageLog["status"], string> = {
  running: "border-indigo-700 bg-indigo-900/40 text-indigo-300",
  passed:  "border-green-700 bg-green-900/40 text-green-300",
  failed:  "border-red-700 bg-red-900/40 text-red-300",
  skipped: "border-gray-700 bg-gray-800 text-gray-500",
};

// Stage icons
const STAGE_ICONS: Record<string, React.ReactNode> = {
  github: (
    <svg viewBox="0 0 14 14" fill="currentColor" className="h-3 w-3">
      <path fillRule="evenodd" d="M7 0C3.13 0 0 3.13 0 7c0 3.09 2.01 5.72 4.79 6.65.35.06.48-.15.48-.34v-1.2c-1.95.42-2.36-.94-2.36-.94-.32-.81-.78-1.03-.78-1.03-.64-.44.05-.43.05-.43.7.05 1.07.72 1.07.72.62 1.07 1.63.76 2.03.58.06-.45.24-.76.44-.93-1.56-.18-3.2-.78-3.2-3.47 0-.77.27-1.39.72-1.88-.07-.18-.31-.89.07-1.85 0 0 .59-.19 1.93.72A6.7 6.7 0 017 3.43c.6 0 1.2.08 1.76.23 1.34-.91 1.93-.72 1.93-.72.38.96.14 1.67.07 1.85.45.49.72 1.11.72 1.88 0 2.7-1.64 3.29-3.2 3.47.25.22.47.65.47 1.31v1.94c0 .19.13.4.48.34A7.002 7.002 0 0014 7c0-3.87-3.13-7-7-7z" clipRule="evenodd" />
    </svg>
  ),
  vercel: (
    <svg viewBox="0 0 14 14" fill="currentColor" className="h-3 w-3">
      <path d="M7 0L14 12.25H0L7 0z" />
    </svg>
  ),
  tests: (
    <svg viewBox="0 0 14 14" fill="currentColor" className="h-3 w-3">
      <path d="M11.28 2.28L5.5 8.06 2.72 5.28a.75.75 0 00-1.06 1.06l3.25 3.25a.75.75 0 001.06 0l6.25-6.25a.75.75 0 00-1.06-1.06z" />
    </svg>
  ),
  build: (
    <svg viewBox="0 0 14 14" fill="currentColor" className="h-3 w-3">
      <path d="M7 1L1 4.5v5L7 13l6-3.5v-5L7 1zm0 1.5L12 5.5v4L7 12 2 9.5v-4L7 2.5z" />
    </svg>
  ),
  deploy: (
    <svg viewBox="0 0 14 14" fill="currentColor" className="h-3 w-3">
      <path fillRule="evenodd" d="M7 1a.75.75 0 01.75.75v7.69l2.22-2.22a.75.75 0 111.06 1.06l-3.5 3.5a.75.75 0 01-1.06 0l-3.5-3.5a.75.75 0 111.06-1.06L6.25 9.44V1.75A.75.75 0 017 1z" clipRule="evenodd" />
    </svg>
  ),
};

function StagePill({ stage, index }: { stage: CicdStageLog; index: number }) {
  const meta = STAGE_META[stage.stage] ?? { label: stage.stage };
  const isRunning = stage.status === "running";
  const isPassed = stage.status === "passed";

  return (
    <motion.div
      className="flex flex-col items-center gap-1.5"
      variants={fadeUp}
      custom={index}
    >
      <motion.div
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${STAGE_STYLES[stage.status]}`}
        animate={isRunning ? { opacity: [0.7, 1, 0.7] } : { opacity: 1 }}
        transition={
          isRunning
            ? { duration: 1.4, ease: "easeInOut", repeat: Infinity }
            : { duration: duration.standard, ease: ease.primary }
        }
        layout
      >
        <AnimatePresence mode="wait">
          {isPassed ? (
            <motion.span
              key="check"
              initial={{ opacity: 0, scale: 0.6, rotate: -10 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              transition={{ duration: duration.standard, ease: ease.enter }}
            >
              {STAGE_ICONS.tests}
            </motion.span>
          ) : (
            <motion.span
              key="icon"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: duration.fast }}
            >
              {STAGE_ICONS[stage.stage] ?? null}
            </motion.span>
          )}
        </AnimatePresence>
        {meta.label}
      </motion.div>

      {stage.durationMs != null && (
        <motion.span
          className="text-[10px] text-gray-500"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: duration.standard, delay: 0.1 }}
        >
          {stage.durationMs}ms
        </motion.span>
      )}
    </motion.div>
  );
}

export function DeploymentCard({ deployment }: { deployment: Deployment & { repoUrl?: string } }) {
  const cfg = STATUS_CONFIG[deployment.status];
  const allStages = ["github", "vercel"];
  const stageMap = new Map(deployment.log.map((s) => [s.stage, s]));
  const stages: CicdStageLog[] = allStages.map(
    (s) => stageMap.get(s) ?? { stage: s, status: "skipped" },
  );

  return (
    <motion.div
      className={`rounded-xl border ${cfg.border} bg-[#1a1f2e] p-5 shadow-sm`}
      whileHover={cardHover}
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.standard, ease: ease.enter }}
    >
      {/* Header */}
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <motion.span
            key={deployment.status}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${cfg.badge}`}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: duration.standard, ease: ease.enter }}
          >
            <motion.span
              className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`}
              animate={deployment.status === "RUNNING" ? { opacity: [0.4, 1, 0.4] } : { opacity: 1 }}
              transition={
                deployment.status === "RUNNING"
                  ? { duration: 1.2, ease: "easeInOut", repeat: Infinity }
                  : { duration: duration.fast }
              }
            />
            {cfg.label}
          </motion.span>
          <span className="text-xs text-gray-500">
            {new Date(deployment.createdAt).toLocaleString()}
          </span>
        </div>
        <span className="font-mono text-[11px] text-gray-600">#{deployment.id.slice(-6)}</span>
      </div>

      {/* Pipeline steps with animated connectors */}
      <motion.div
        className="flex items-center gap-1"
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        {stages.map((stage, i) => (
          <div key={stage.stage} className="flex items-center">
            <StagePill stage={stage} index={i} />
            {i < stages.length - 1 && (
              <div className="relative mx-2 h-px w-8 shrink-0 overflow-hidden bg-gray-700">
                <AnimatePresence>
                  {stage.status === "passed" && (
                    <motion.div
                      className="absolute inset-0 bg-green-500"
                      variants={connectorFill}
                      initial="hidden"
                      animate="visible"
                    />
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        ))}
      </motion.div>

      {/* Error */}
      <AnimatePresence>
        {deployment.errorMsg && (
          <motion.div
            className="mt-4 rounded-lg bg-red-950/90 px-3 py-2 font-mono text-xs text-red-300"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: duration.standard, ease: ease.enter }}
          >
            {deployment.errorMsg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Preview URL */}
      <AnimatePresence>
        {deployment.previewUrl && (
          <motion.div
            className="mt-4 flex items-center gap-2"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: duration.standard, ease: ease.enter }}
          >
            <span className="text-xs text-gray-500">Live:</span>
            <a
              href={deployment.previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate text-xs font-medium text-indigo-400 hover:underline"
            >
              {deployment.previewUrl}
            </a>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Repo URL */}
      <AnimatePresence>
        {(deployment as any).repoUrl && (
          <motion.div
            className="mt-1 flex items-center gap-2"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: duration.standard, ease: ease.enter }}
          >
            <span className="text-xs text-gray-500">Repo:</span>
            <a
              href={(deployment as any).repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate text-xs font-medium text-gray-400 hover:text-gray-200 hover:underline"
            >
              {(deployment as any).repoUrl}
            </a>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stage detail logs */}
      {deployment.log.length > 0 && (
        <div className="mt-4 space-y-1 border-t border-gray-700 pt-3">
          {deployment.log.map((s) => (
            <div key={s.stage} className="flex items-start gap-2 text-[11px]">
              <span className="w-12 shrink-0 font-medium capitalize text-gray-500">{s.stage}</span>
              <span className="text-gray-400">{s.detail ?? "—"}</span>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
