"use client";

import { motion } from "framer-motion";
import type { AgentRunRow, AgentRunStatus } from "@/types";
import { duration, ease, staggerContainer, fadeUp } from "@/lib/motion";

const STATUS_STYLES: Record<AgentRunStatus, string> = {
  RUNNING:   "bg-indigo-900/60 text-indigo-300",
  COMPLETED: "bg-green-900/60 text-green-300",
  FAILED:    "bg-red-900/60 text-red-300",
};

const AGENT_COLORS: Record<string, string> = {
  CODE_GENERATOR: "text-indigo-400",
  TEST_GENERATOR: "text-teal-400",
  CODE_REVIEWER:  "text-orange-400",
};

export function AgentActivityTable({ runs, loading }: { runs: AgentRunRow[]; loading?: boolean }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-700 bg-[#1a1f2e] shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-700 bg-gray-800/50">
              <th className="px-5 py-3 text-left font-medium text-gray-400">Agent</th>
              <th className="px-5 py-3 text-left font-medium text-gray-400">Task</th>
              <th className="px-5 py-3 text-left font-medium text-gray-400">Status</th>
              <th className="px-5 py-3 text-left font-medium text-gray-400">Duration</th>
              <th className="px-5 py-3 text-left font-medium text-gray-400">Started</th>
              <th className="px-5 py-3 text-left font-medium text-gray-400">Error</th>
            </tr>
          </thead>
          {loading ? (
            <tbody>
              <tr><td colSpan={6} className="px-5 py-10 text-center text-gray-500">Loading…</td></tr>
            </tbody>
          ) : runs.length === 0 ? (
            <tbody>
              <tr><td colSpan={6} className="px-5 py-10 text-center text-gray-500">No agent runs yet</td></tr>
            </tbody>
          ) : (
            <motion.tbody
              className="divide-y divide-gray-700"
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
            >
              {runs.map((run) => (
                <motion.tr
                  key={run.id}
                  variants={fadeUp}
                  className="transition-colors hover:bg-gray-800/50"
                >
                  <td className={`px-5 py-3 font-medium ${AGENT_COLORS[run.agentType] ?? "text-gray-300"}`}>
                    {run.agentType.replace(/_/g, " ")}
                  </td>
                  <td className="max-w-[180px] truncate px-5 py-3 text-gray-300">{run.task.title}</td>
                  <td className="px-5 py-3">
                    <motion.span
                      key={run.status}
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[run.status]}`}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={
                        run.status === "RUNNING"
                          ? { opacity: [0.6, 1, 0.6], scale: 1 }
                          : { opacity: 1, scale: 1 }
                      }
                      transition={
                        run.status === "RUNNING"
                          ? { duration: 1.4, ease: "easeInOut", repeat: Infinity }
                          : { duration: duration.standard, ease: ease.enter }
                      }
                    >
                      {run.status}
                    </motion.span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-gray-400">
                    {run.durationMs != null ? `${run.durationMs}ms` : "—"}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-gray-500">
                    {new Date(run.createdAt).toLocaleTimeString()}
                  </td>
                  <td className="max-w-[160px] truncate px-5 py-3 text-red-400">
                    {run.errorMsg ?? "—"}
                  </td>
                </motion.tr>
              ))}
            </motion.tbody>
          )}
        </table>
      </div>
    </div>
  );
}
