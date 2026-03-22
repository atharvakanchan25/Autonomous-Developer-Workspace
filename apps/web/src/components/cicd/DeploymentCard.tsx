"use client";

import type { Deployment, CicdStageLog, DeploymentStatus } from "@/types";

const STATUS_CONFIG: Record<DeploymentStatus, { label: string; dot: string; badge: string; border: string }> = {
  PENDING: { label: "Pending", dot: "bg-gray-400",  badge: "bg-gray-100 text-gray-600",   border: "border-gray-200" },
  RUNNING: { label: "Running", dot: "bg-blue-500",  badge: "bg-blue-100 text-blue-700",   border: "border-blue-200" },
  SUCCESS: { label: "Success", dot: "bg-green-500", badge: "bg-green-100 text-green-700", border: "border-green-200" },
  FAILED:  { label: "Failed",  dot: "bg-red-500",   badge: "bg-red-100 text-red-700",     border: "border-red-200" },
};

const STAGE_META: Record<string, { label: string; icon: string }> = {
  tests:  { label: "Tests",  icon: "✓" },
  build:  { label: "Build",  icon: "⬡" },
  deploy: { label: "Deploy", icon: "↑" },
};

const STAGE_STYLES: Record<CicdStageLog["status"], string> = {
  running: "bg-blue-100 text-blue-700 animate-pulse",
  passed:  "bg-green-100 text-green-700",
  failed:  "bg-red-100 text-red-700",
  skipped: "bg-gray-100 text-gray-400",
};

function StagePill({ stage }: { stage: CicdStageLog }) {
  const meta = STAGE_META[stage.stage] ?? { label: stage.stage, icon: "·" };
  return (
    <div className="flex flex-col items-center gap-1">
      <span className={`rounded-full px-3 py-1 text-xs font-medium ${STAGE_STYLES[stage.status]}`}>
        {meta.icon} {meta.label}
      </span>
      {stage.durationMs != null && (
        <span className="text-[10px] text-gray-400">{stage.durationMs}ms</span>
      )}
    </div>
  );
}

export function DeploymentCard({ deployment }: { deployment: Deployment }) {
  const cfg = STATUS_CONFIG[deployment.status];
  const allStages: string[] = ["tests", "build", "deploy"];
  const stageMap = new Map(deployment.log.map((s) => [s.stage, s]));
  const stages: CicdStageLog[] = allStages.map(
    (s) => stageMap.get(s) ?? { stage: s, status: "skipped" },
  );

  return (
    <div className={`rounded-lg border ${cfg.border} bg-white p-4 transition-shadow hover:shadow-sm`}>
      {/* Header */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.badge}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot} ${deployment.status === "RUNNING" ? "animate-pulse" : ""}`} />
            {cfg.label}
          </span>
          <span className="text-xs text-gray-400">{new Date(deployment.createdAt).toLocaleString()}</span>
        </div>
        <span className="font-mono text-[11px] text-gray-400">#{deployment.id.slice(-6)}</span>
      </div>

      {/* Stage pipeline */}
      <div className="flex items-start gap-1">
        {stages.map((stage, i) => (
          <div key={stage.stage} className="flex items-start">
            <StagePill stage={stage} />
            {i < stages.length - 1 && (
              <div className={`mx-1 mt-3.5 h-px w-8 shrink-0 ${stage.status === "passed" ? "bg-green-300" : "bg-gray-200"}`} />
            )}
          </div>
        ))}
      </div>

      {/* Error */}
      {deployment.errorMsg && (
        <div className="mt-3 rounded bg-red-50 px-3 py-2 font-mono text-xs text-red-600">
          {deployment.errorMsg}
        </div>
      )}

      {/* Preview URL */}
      {deployment.previewUrl && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-gray-500">Preview:</span>
          <a
            href={deployment.previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-xs font-medium text-blue-600 hover:underline"
          >
            {deployment.previewUrl}
          </a>
          <button
            onClick={() => navigator.clipboard.writeText(deployment.previewUrl!)}
            title="Copy URL"
            className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
              <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 010 1.5h-1.5a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-1.5a.75.75 0 011.5 0v1.5A1.75 1.75 0 019.25 16h-7.5A1.75 1.75 0 010 14.25v-7.5z" />
              <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0114.25 11h-7.5A1.75 1.75 0 015 9.25v-7.5zm1.75-.25a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25h-7.5z" />
            </svg>
          </button>
        </div>
      )}

      {/* Stage detail logs */}
      {deployment.log.length > 0 && (
        <div className="mt-3 space-y-1 border-t border-gray-100 pt-3">
          {deployment.log.map((s) => (
            <div key={s.stage} className="flex items-start gap-2 text-[11px]">
              <span className="w-12 shrink-0 font-medium capitalize text-gray-500">{s.stage}</span>
              <span className="text-gray-600">{s.detail ?? "—"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
