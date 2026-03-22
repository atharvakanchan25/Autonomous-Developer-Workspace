"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSocket } from "@/lib/useSocket";
import type { AgentLogPayload, PipelineStagePayload } from "@/lib/socket.events";

interface LogEntry {
  id: string;
  timestamp: string;
  agentType: string;
  level: "info" | "warn" | "error";
  message: string;
  meta?: Record<string, unknown>;
}

const LEVEL_STYLES = {
  info: "text-gray-300",
  warn: "text-yellow-400",
  error: "text-red-400",
};

const LEVEL_PREFIX = { info: "›", warn: "⚠", error: "✕" };

export function AgentLogFeed({ projectId }: { projectId: string | null }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [paused, setPaused] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);

  pausedRef.current = paused;

  const addLog = useCallback((entry: LogEntry) => {
    setLogs((prev) => {
      const next = [...prev, entry].slice(-200); // keep last 200 entries
      return next;
    });
  }, []);

  const handleAgentLog = useCallback((p: AgentLogPayload) => {
    addLog({
      id: `${p.timestamp}-${p.agentRunId}-${Math.random()}`,
      timestamp: p.timestamp,
      agentType: p.agentType,
      level: p.level,
      message: p.message,
      meta: p.meta,
    });
  }, [addLog]);

  const handlePipelineStage = useCallback((p: PipelineStagePayload) => {
    const stageLabel = p.stage.toUpperCase();
    const extra = p.durationMs ? ` (${p.durationMs}ms)` : "";
    addLog({
      id: `${p.timestamp}-stage-${Math.random()}`,
      timestamp: p.timestamp,
      agentType: p.agentType,
      level: p.stage === "failed" ? "error" : "info",
      message: `[${stageLabel}] ${p.summary ?? p.error ?? p.agentType}${extra}`,
    });
  }, [addLog]);

  useSocket({ projectId, onAgentLog: handleAgentLog, onPipelineStage: handlePipelineStage });

  // Auto-scroll to bottom unless paused
  useEffect(() => {
    if (!paused) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, paused]);

  // Clear logs when project changes
  useEffect(() => { setLogs([]); }, [projectId]);

  return (
    <div className="flex h-full flex-col bg-gray-950">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800 px-3 py-2">
        <span className="text-xs font-medium text-gray-400">Agent Logs</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-600">{logs.length} entries</span>
          <button
            onClick={() => setPaused((v) => !v)}
            className="rounded px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-800 hover:text-gray-300"
          >
            {paused ? "▶ Resume" : "⏸ Pause"}
          </button>
          <button
            onClick={() => setLogs([])}
            className="rounded px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-800 hover:text-gray-300"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Log entries */}
      <div className="flex-1 overflow-y-auto p-2 font-mono text-[11px] leading-relaxed">
        {logs.length === 0 ? (
          <p className="mt-4 text-center text-gray-600">
            {projectId ? "Waiting for agent activity…" : "Select a project to see logs"}
          </p>
        ) : (
          logs.map((entry) => (
            <div key={entry.id} className="flex gap-2 py-0.5">
              <span className="shrink-0 text-gray-600">
                {new Date(entry.timestamp).toLocaleTimeString()}
              </span>
              <span className="shrink-0 w-24 truncate text-purple-400">{entry.agentType}</span>
              <span className={`shrink-0 ${LEVEL_STYLES[entry.level]}`}>
                {LEVEL_PREFIX[entry.level]}
              </span>
              <span className={LEVEL_STYLES[entry.level]}>{entry.message}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
