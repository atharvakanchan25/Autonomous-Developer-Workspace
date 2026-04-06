"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import type { ObsLog } from "@/types";
import { staggerContainer, fadeUp, scalePop } from "@/lib/motion";

function ErrorRow({ err }: { err: ObsLog }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(`[ERROR] ${new Date(err.createdAt).toISOString()} ${err.source} — ${err.message}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="border-b border-gray-700/60 last:border-0">
      <div
        className="group flex cursor-pointer items-start gap-3 px-5 py-3.5 transition-colors hover:bg-gray-800/30"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-red-400">{err.message}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-600">
            <span>{err.source}</span>
            {err.agentType && (
              <span className="rounded bg-indigo-900/40 px-1.5 py-0.5 text-indigo-400">{err.agentType.replace(/_/g, " ")}</span>
            )}
            {err.durationMs != null && <span>{err.durationMs}ms</span>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[11px] text-gray-600">{new Date(err.createdAt).toLocaleTimeString()}</span>
          <button
            onClick={(e) => { e.stopPropagation(); copy(); }}
            className="opacity-0 transition-opacity group-hover:opacity-100"
            title="Copy error"
          >
            {copied
              ? <span className="text-[10px] text-green-400">✓</span>
              : <svg viewBox="0 0 12 12" fill="currentColor" className="h-3 w-3 text-gray-600 hover:text-gray-400">
                  <path d="M0 4.75A.75.75 0 01.75 4h1.5a.75.75 0 010 1.5H.75A.75.75 0 010 4.75zm4-4A.75.75 0 014.75 0h6.5a.75.75 0 010 1.5h-6.5A.75.75 0 014 .75zm.75 3.5a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5zm0 3.5a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5z" />
                </svg>
            }
          </button>
          <svg
            viewBox="0 0 12 12" fill="currentColor"
            className={`h-3 w-3 text-gray-700 transition-transform ${expanded ? "rotate-180" : ""}`}
          >
            <path d="M6 8L1 3h10L6 8z" />
          </svg>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-700/40 bg-black/20 px-5 py-3">
          <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 font-mono text-[11px]">
            <div><span className="text-gray-600">ID: </span><span className="text-gray-400">{err.id}</span></div>
            <div><span className="text-gray-600">Source: </span><span className="text-gray-400">{err.source}</span></div>
            {err.taskId && <div><span className="text-gray-600">Task: </span><span className="text-gray-400">{err.taskId}</span></div>}
            {err.projectId && <div><span className="text-gray-600">Project: </span><span className="text-gray-400">{err.projectId}</span></div>}
            <div className="col-span-2"><span className="text-gray-600">Time: </span><span className="text-gray-400">{new Date(err.createdAt).toISOString()}</span></div>
            <div className="col-span-2 mt-1">
              <span className="text-gray-600">Message: </span>
              <span className="whitespace-pre-wrap break-all text-red-400">{err.message}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ErrorFeed({ errors, loading }: { errors: ObsLog[]; loading?: boolean }) {
  const [groupBySource, setGroupBySource] = useState(false);

  const grouped = useMemo(() => {
    if (!groupBySource) return null;
    const map = new Map<string, ObsLog[]>();
    for (const e of errors) {
      const list = map.get(e.source) ?? [];
      list.push(e);
      map.set(e.source, list);
    }
    return map;
  }, [errors, groupBySource]);

  if (loading) return <p className="py-10 text-center text-sm text-gray-500">Loading…</p>;

  if (errors.length === 0) {
    return (
      <motion.div
        className="flex flex-col items-center gap-3 py-16"
        variants={scalePop}
        initial="hidden"
        animate="visible"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-900/30 ring-1 ring-green-800/40">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6 text-green-400">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        </div>
        <p className="text-sm font-medium text-gray-400">No errors recorded</p>
        <p className="text-xs text-gray-600">All agent runs completed successfully.</p>
      </motion.div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">{errors.length} error{errors.length !== 1 ? "s" : ""} recorded</span>
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-gray-500">
          <input
            type="checkbox"
            checked={groupBySource}
            onChange={(e) => setGroupBySource(e.target.checked)}
            className="h-3 w-3 accent-indigo-500"
          />
          Group by source
        </label>
      </div>

      {groupBySource && grouped ? (
        <div className="space-y-3">
          {Array.from(grouped.entries()).map(([source, errs]) => (
            <div key={source} className="overflow-hidden rounded-xl border border-gray-700 bg-[#1a1f2e]">
              <div className="flex items-center justify-between border-b border-gray-700 bg-gray-800/30 px-5 py-2.5">
                <span className="text-xs font-medium text-gray-300">{source}</span>
                <span className="rounded-full bg-red-900/40 px-2 py-0.5 text-[10px] font-medium text-red-400">
                  {errs.length} error{errs.length !== 1 ? "s" : ""}
                </span>
              </div>
              {errs.map((err) => <ErrorRow key={err.id} err={err} />)}
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-700 bg-[#1a1f2e]">
          <motion.div variants={staggerContainer} initial="hidden" animate="visible">
            {errors.map((err) => (
              <motion.div key={err.id} variants={fadeUp}>
                <ErrorRow err={err} />
              </motion.div>
            ))}
          </motion.div>
        </div>
      )}
    </div>
  );
}
