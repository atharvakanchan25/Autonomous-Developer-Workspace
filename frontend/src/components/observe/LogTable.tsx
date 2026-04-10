"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import type { ObsLog, LogLevel } from "@/types";

const LEVEL_STYLES: Record<LogLevel, { badge: string; row: string; text: string }> = {
  DEBUG: { badge: "bg-gray-700 text-gray-400",        row: "",                        text: "text-gray-500" },
  INFO:  { badge: "bg-indigo-900/60 text-indigo-300", row: "",                        text: "text-gray-300" },
  WARN:  { badge: "bg-amber-900/60 text-amber-300",   row: "bg-amber-950/10",         text: "text-amber-200" },
  ERROR: { badge: "bg-red-900/60 text-red-300",       row: "bg-red-950/20",           text: "text-red-300" },
};

const LEVELS: LogLevel[] = ["DEBUG", "INFO", "WARN", "ERROR"];

const AGENT_LABELS: Record<string, string> = {
  CODE_GENERATOR: "Code",
  TEST_GENERATOR: "Tests",
  CODE_REVIEWER:  "Review",
};

function LogRow({ log }: { log: ObsLog }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const style = LEVEL_STYLES[log.level];

  async function copy() {
    await navigator.clipboard.writeText(
      `[${log.level}] ${new Date(log.createdAt).toISOString()} ${log.source} — ${log.message}`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div
      className={`group border-b border-white/[0.04] font-mono text-[12px] transition-colors hover:bg-white/[0.03] ${style.row}`}
    >
      <div
        className="flex cursor-pointer items-start gap-3 px-4 py-2"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Time */}
        <span className="w-20 shrink-0 text-gray-600">
          {new Date(log.createdAt).toLocaleTimeString("en-US", { hour12: false })}
        </span>

        {/* Level badge */}
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${style.badge}`}>
          {log.level}
        </span>

        {/* Source */}
        <span className="w-24 shrink-0 truncate text-gray-600">{log.source}</span>

        {/* Agent */}
        <span className="w-14 shrink-0 text-[10px] text-indigo-400/70">
          {log.agentType ? (AGENT_LABELS[log.agentType] ?? log.agentType) : ""}
        </span>

        {/* Message */}
        <span className={`flex-1 truncate ${style.text}`}>{log.message}</span>

        {/* Duration */}
        {log.durationMs != null && (
          <span className="shrink-0 text-gray-600">{log.durationMs}ms</span>
        )}

        {/* Copy — hover only */}
        <button
          onClick={(e) => { e.stopPropagation(); copy(); }}
          className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
          title="Copy log"
        >
          {copied
            ? <span className="text-[10px] text-green-400">✓</span>
            : <svg viewBox="0 0 12 12" fill="currentColor" className="h-3 w-3 text-gray-600 hover:text-gray-400">
                <path d="M0 4.75A.75.75 0 01.75 4h1.5a.75.75 0 010 1.5H.75A.75.75 0 010 4.75zm0 3.5A.75.75 0 01.75 7.5h1.5a.75.75 0 010 1.5H.75A.75.75 0 010 8.25zM4 .75A.75.75 0 014.75 0h6.5a.75.75 0 010 1.5h-6.5A.75.75 0 014 .75zm.75 3.5a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5zm0 3.5a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5z" />
              </svg>
          }
        </button>

        {/* Expand chevron */}
        <svg
          viewBox="0 0 12 12"
          fill="currentColor"
          className={`h-3 w-3 shrink-0 text-gray-700 transition-transform ${expanded ? "rotate-180" : ""}`}
        >
          <path d="M6 8L1 3h10L6 8z" />
        </svg>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-white/[0.04] bg-black/20 px-4 py-3">
          <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-[11px]">
            <div><span className="text-gray-600">ID: </span><span className="text-gray-400 font-mono">{log.id}</span></div>
            <div><span className="text-gray-600">Source: </span><span className="text-gray-400">{log.source}</span></div>
            {log.taskId && <div><span className="text-gray-600">Task: </span><span className="text-gray-400 font-mono">{log.taskId}</span></div>}
            {log.projectId && <div><span className="text-gray-600">Project: </span><span className="text-gray-400 font-mono">{log.projectId}</span></div>}
            {log.agentType && <div><span className="text-gray-600">Agent: </span><span className="text-indigo-400">{log.agentType}</span></div>}
            {log.durationMs != null && <div><span className="text-gray-600">Duration: </span><span className="text-gray-400">{log.durationMs}ms</span></div>}
            <div className="col-span-2"><span className="text-gray-600">Time: </span><span className="text-gray-400">{new Date(log.createdAt).toISOString()}</span></div>
            <div className="col-span-2 mt-1">
              <span className="text-gray-600">Message: </span>
              <span className={`whitespace-pre-wrap break-all ${style.text}`}>{log.message}</span>
            </div>
            {log.meta && (
              <div className="col-span-2 mt-1">
                <span className="text-gray-600">Meta: </span>
                <pre className="mt-1 overflow-x-auto rounded bg-black/30 p-2 text-[10px] text-gray-400">{log.meta}</pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function LogTable({ logs, loading }: { logs: ObsLog[]; loading?: boolean }) {
  const [levelFilter, setLevelFilter] = useState<LogLevel | "ALL">("ALL");
  const [sourceFilter, setSourceFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [autoScroll, setAutoScroll] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const sources = useMemo(() => {
    const s = new Set(logs.map((l) => l.source));
    return ["ALL", ...Array.from(s).sort()];
  }, [logs]);

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (levelFilter !== "ALL" && l.level !== levelFilter) return false;
      if (sourceFilter !== "ALL" && l.source !== sourceFilter) return false;
      if (search && !l.message.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [logs, levelFilter, sourceFilter, search]);

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [filtered, autoScroll]);

  const levelCounts = useMemo(() => {
    const counts: Partial<Record<LogLevel, number>> = {};
    for (const l of logs) counts[l.level] = (counts[l.level] ?? 0) + 1;
    return counts;
  }, [logs]);

  return (
    <div className="flex flex-col gap-3">

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative">
          <svg viewBox="0 0 16 16" fill="currentColor" className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-600">
            <path fillRule="evenodd" d="M9.965 11.026a5 5 0 111.06-1.06l2.755 2.754a.75.75 0 11-1.06 1.06l-2.755-2.754zM10.5 7a3.5 3.5 0 11-7 0 3.5 3.5 0 017 0z" clipRule="evenodd" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search logs…"
            className="rounded-lg border border-gray-700 bg-[#1a1f2e] py-1.5 pl-8 pr-3 text-xs text-gray-200 placeholder-gray-600 focus:border-indigo-500 focus:outline-none"
          />
        </div>

        {/* Level filters */}
        <div className="flex gap-1">
          {(["ALL", ...LEVELS] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLevelFilter(l)}
              className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                levelFilter === l
                  ? "bg-indigo-600 text-white"
                  : "border border-gray-700 bg-[#1a1f2e] text-gray-500 hover:text-gray-300"
              }`}
            >
              {l}
              {l !== "ALL" && levelCounts[l as LogLevel] != null && (
                <span className="ml-1 text-[9px] opacity-60">{levelCounts[l as LogLevel]}</span>
              )}
            </button>
          ))}
        </div>

        {/* Source filter */}
        {sources.length > 2 && (
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="rounded-lg border border-gray-700 bg-[#1a1f2e] px-2.5 py-1.5 text-xs text-gray-300 focus:border-indigo-500 focus:outline-none"
          >
            {sources.map((s) => <option key={s} value={s}>{s === "ALL" ? "All Sources" : s}</option>)}
          </select>
        )}

        <div className="ml-auto flex items-center gap-3">
          {/* Auto-scroll toggle */}
          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-gray-500">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="h-3 w-3 accent-indigo-500"
            />
            Auto-scroll
          </label>
          <span className="text-xs text-gray-600">{filtered.length} / {logs.length} entries</span>
        </div>
      </div>

      {/* Log terminal */}
      <div className="overflow-hidden rounded-xl border border-gray-700 bg-[#0d1117]">
        {/* Terminal header */}
        <div className="flex items-center gap-2 border-b border-white/[0.06] bg-[#161b22] px-4 py-2">
          <div className="flex gap-1.5">
            <span className="h-3 w-3 rounded-full bg-red-500/60" />
            <span className="h-3 w-3 rounded-full bg-amber-500/60" />
            <span className="h-3 w-3 rounded-full bg-green-500/60" />
          </div>
          <span className="ml-2 text-[11px] text-gray-600 font-mono">system.log</span>
          <span className="ml-auto text-[10px] text-gray-700">Click a row to expand</span>
        </div>

        {/* Column headers */}
        <div className="flex items-center gap-3 border-b border-white/[0.04] bg-[#161b22]/50 px-4 py-1.5 font-mono text-[10px] text-gray-700">
          <span className="w-20 shrink-0">TIME</span>
          <span className="w-14 shrink-0">LEVEL</span>
          <span className="w-24 shrink-0">SOURCE</span>
          <span className="w-14 shrink-0">AGENT</span>
          <span className="flex-1">MESSAGE</span>
          <span className="w-16 shrink-0 text-right">DURATION</span>
        </div>

        {/* Rows */}
        <div className="max-h-[520px] overflow-y-auto">
          {loading ? (
            <div className="flex items-center gap-2 px-4 py-8 font-mono text-[12px] text-gray-600">
              <span className="h-3 w-3 animate-spin rounded-full border border-gray-700 border-t-gray-500" />
              Loading logs…
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-10 text-center font-mono text-[12px] text-gray-700">
              {logs.length === 0 ? "No logs yet. Run an agent to see activity." : `No logs match your filters.`}
            </div>
          ) : (
            filtered.map((log) => <LogRow key={log.id} log={log} />)
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
