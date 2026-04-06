"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSocket } from "@/lib/useSocket";
import type { AgentLogPayload, PipelineStagePayload } from "@/lib/socket.events";
import { duration, ease } from "@/lib/motion";

interface LogEntry {
  id: string;
  timestamp: string;
  agentType: string;
  level: "info" | "warn" | "error";
  message: string;
}

const LEVEL_COLORS = {
  info:  "text-gray-600",
  warn:  "text-amber-600",
  error: "text-red-600",
};

const AGENT_COLORS: Record<string, string> = {
  CODE_GENERATOR: "text-indigo-600",
  TEST_GENERATOR: "text-teal-600",
  CODE_REVIEWER:  "text-orange-600",
};

// Each log line: fade in + 4px upward translate
const logLineVariants = {
  hidden:  { opacity: 0, y: 4 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: duration.fast, ease: ease.enter },
  },
  exit: {
    opacity: 0,
    transition: { duration: duration.fast, ease: ease.exit },
  },
};

export function AgentLogFeed({ projectId }: { projectId: string | null }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [paused, setPaused] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  const addLog = useCallback((entry: LogEntry) => {
    setLogs((prev) => [...prev, entry].slice(-200));
  }, []);

  const handleAgentLog = useCallback((p: AgentLogPayload) => {
    addLog({
      id: `${p.timestamp}-${p.agentRunId}-${Math.random()}`,
      timestamp: p.timestamp,
      agentType: p.agentType,
      level: p.level,
      message: p.message,
    });
  }, [addLog]);

  const handlePipelineStage = useCallback((p: PipelineStagePayload) => {
    const extra = p.durationMs ? ` · ${p.durationMs}ms` : "";
    addLog({
      id: `${p.timestamp}-stage-${Math.random()}`,
      timestamp: p.timestamp,
      agentType: p.agentType,
      level: p.stage === "failed" ? "error" : "info",
      message: `[${p.stage.toUpperCase()}] ${p.summary ?? p.error ?? p.agentType}${extra}`,
    });
  }, [addLog]);

  useSocket({ projectId, onAgentLog: handleAgentLog, onPipelineStage: handlePipelineStage });

  useEffect(() => {
    if (!paused) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, paused]);

  useEffect(() => { setLogs([]); }, [projectId]);

  return (
    <motion.div
      className="flex h-full flex-col bg-[#1a1f2e] border-l border-gray-700"
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: duration.slow, ease: ease.enter }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-700 px-4 py-2.5 bg-gray-800/50">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
            Agent Logs
          </span>
          <AnimatePresence>
            {logs.length > 0 && (
              <motion.span
                className="rounded-full bg-gray-700 px-1.5 py-0.5 text-[10px] font-medium text-gray-400"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: duration.fast }}
              >
                {logs.length}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <div className="flex items-center gap-1">
          <motion.button
            onClick={() => setPaused((v) => !v)}
            className="rounded px-2 py-1 text-[10px] text-gray-500 transition-colors hover:bg-gray-700 hover:text-gray-300"
            whileTap={{ scale: 0.95 }}
          >
            {paused ? "▶" : "⏸"}
          </motion.button>
          <motion.button
            onClick={() => setLogs([])}
            className="rounded px-2 py-1 text-[10px] text-gray-500 transition-colors hover:bg-gray-700 hover:text-gray-300"
            whileTap={{ scale: 0.95 }}
          >
            Clear
          </motion.button>
        </div>
      </div>

      {/* Log entries */}
      <div className="scrollbar-thin flex-1 overflow-y-auto px-4 py-3 font-mono text-[11px] leading-relaxed bg-[#1a1f2e]">
        {logs.length === 0 ? (
          <motion.p
            className="mt-6 text-center text-gray-500"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: duration.standard, delay: 0.1 }}
          >
            {projectId ? "Waiting for activity…" : "Select a project"}
          </motion.p>
        ) : (
          <AnimatePresence initial={false}>
            {logs.map((entry) => (
              <motion.div
                key={entry.id}
                className="flex gap-2.5 py-0.5"
                variants={logLineVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                layout={false}
              >
                <span className="shrink-0 text-gray-500">
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </span>
                <span className={`w-20 shrink-0 truncate ${AGENT_COLORS[entry.agentType] ?? "text-gray-500"}`}>
                  {entry.agentType}
                </span>
                <span className={LEVEL_COLORS[entry.level]}>{entry.message}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
        <div ref={bottomRef} />
      </div>
    </motion.div>
  );
}
