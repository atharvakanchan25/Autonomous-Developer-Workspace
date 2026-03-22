"use client";

import { useState } from "react";
import type { ObsLog, LogLevel } from "@/types";

const LEVEL_STYLES: Record<LogLevel, string> = {
  DEBUG: "bg-gray-100 text-gray-500",
  INFO:  "bg-blue-50  text-blue-700",
  WARN:  "bg-yellow-50 text-yellow-700",
  ERROR: "bg-red-50   text-red-700",
};

const LEVELS: LogLevel[] = ["DEBUG", "INFO", "WARN", "ERROR"];

interface LogTableProps {
  logs: ObsLog[];
  loading?: boolean;
}

export function LogTable({ logs, loading }: LogTableProps) {
  const [levelFilter, setLevelFilter] = useState<LogLevel | "ALL">("ALL");
  const [search, setSearch] = useState("");

  const filtered = logs.filter((l) => {
    if (levelFilter !== "ALL" && l.level !== levelFilter) return false;
    if (search && !l.message.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-3">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search messages…"
          className="rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-gray-500 focus:outline-none"
        />
        <div className="flex gap-1">
          {(["ALL", ...LEVELS] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLevelFilter(l)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                levelFilter === l
                  ? "bg-gray-900 text-white"
                  : "border border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-gray-400">{filtered.length} entries</span>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-gray-200">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-3 py-2 font-medium">Time</th>
                <th className="px-3 py-2 font-medium">Level</th>
                <th className="px-3 py-2 font-medium">Source</th>
                <th className="px-3 py-2 font-medium">Agent</th>
                <th className="px-3 py-2 font-medium">Message</th>
                <th className="px-3 py-2 font-medium">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400">No logs found</td></tr>
              ) : (
                filtered.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-gray-400">
                      {new Date(log.createdAt).toLocaleTimeString()}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${LEVEL_STYLES[log.level]}`}>
                        {log.level}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-500">{log.source}</td>
                    <td className="px-3 py-2 text-purple-600">{log.agentType ?? "—"}</td>
                    <td className="max-w-xs truncate px-3 py-2 text-gray-800">{log.message}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-gray-400">
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
