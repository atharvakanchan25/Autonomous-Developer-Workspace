"use client";

import { useState } from "react";
import type { ObsLog, LogLevel } from "@/types";

const LEVEL_STYLES: Record<LogLevel, string> = {
  DEBUG: "bg-gray-800 text-gray-400",
  INFO:  "bg-indigo-900/60 text-indigo-300",
  WARN:  "bg-amber-900/60 text-amber-300",
  ERROR: "bg-red-900/60 text-red-300",
};

const LEVELS: LogLevel[] = ["DEBUG", "INFO", "WARN", "ERROR"];

export function LogTable({ logs, loading }: { logs: ObsLog[]; loading?: boolean }) {
  const [levelFilter, setLevelFilter] = useState<LogLevel | "ALL">("ALL");
  const [search, setSearch] = useState("");

  const filtered = logs.filter((l) => {
    if (levelFilter !== "ALL" && l.level !== levelFilter) return false;
    if (search && !l.message.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search messages…"
          className="rounded-lg border border-gray-700 bg-[#1a1f2e] px-3.5 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-900/50"
        />
        <div className="flex gap-1">
          {(["ALL", ...LEVELS] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLevelFilter(l)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                levelFilter === l
                  ? "bg-indigo-600 text-white"
                  : "border border-gray-700 bg-[#1a1f2e] text-gray-400 hover:bg-gray-800/50"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-gray-500">{filtered.length} entries</span>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-700 bg-[#1a1f2e] shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-700 bg-gray-800/50">
                <th className="px-5 py-3 text-left font-medium text-gray-400">Time</th>
                <th className="px-5 py-3 text-left font-medium text-gray-400">Level</th>
                <th className="px-5 py-3 text-left font-medium text-gray-400">Source</th>
                <th className="px-5 py-3 text-left font-medium text-gray-400">Agent</th>
                <th className="px-5 py-3 text-left font-medium text-gray-400">Message</th>
                <th className="px-5 py-3 text-left font-medium text-gray-400">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {loading ? (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-gray-500">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-gray-500">No logs found</td></tr>
              ) : (
                filtered.map((log) => (
                  <tr key={log.id} className="transition-colors hover:bg-gray-800/50">
                    <td className="whitespace-nowrap px-5 py-3 font-mono text-gray-500">
                      {new Date(log.createdAt).toLocaleTimeString()}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${LEVEL_STYLES[log.level]}`}>
                        {log.level}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-400">{log.source}</td>
                    <td className="px-5 py-3 text-indigo-400">{log.agentType ?? "—"}</td>
                    <td className="max-w-xs truncate px-5 py-3 text-gray-300">{log.message}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-gray-500">
                      {log.durationMs != null ? `${log.durationMs}ms` : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
