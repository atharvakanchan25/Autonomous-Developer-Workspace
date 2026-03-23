"use client";

import { motion } from "framer-motion";
import type { ObsLog } from "@/types";
import { duration, ease, staggerContainer, fadeUp, scalePop } from "@/lib/motion";

export function ErrorFeed({ errors, loading }: { errors: ObsLog[]; loading?: boolean }) {
  if (loading) return <p className="py-10 text-center text-sm text-gray-500">Loading…</p>;

  if (errors.length === 0) {
    return (
      <motion.div
        className="flex flex-col items-center gap-3 py-14"
        variants={scalePop}
        initial="hidden"
        animate="visible"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-900/40">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-green-400">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        </div>
        <p className="text-sm text-gray-500">No errors recorded</p>
      </motion.div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-700 bg-[#1a1f2e] shadow-sm">
      <motion.ul
        className="divide-y divide-gray-700"
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        {errors.map((err) => (
          <motion.li key={err.id} variants={fadeUp} className="px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm text-red-400">{err.message}</p>
                <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-500">
                  <span>{err.source}</span>
                  {err.agentType && (
                    <span className="text-indigo-400">{err.agentType}</span>
                  )}
                  {err.durationMs != null && <span>{err.durationMs}ms</span>}
                </div>
              </div>
              <span className="shrink-0 whitespace-nowrap text-xs text-gray-500">
                {new Date(err.createdAt).toLocaleTimeString()}
              </span>
            </div>
          </motion.li>
        ))}
      </motion.ul>
    </div>
  );
}
