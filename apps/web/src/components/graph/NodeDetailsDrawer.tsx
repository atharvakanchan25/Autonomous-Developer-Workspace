"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { Task } from "@/types";
import { duration, ease } from "@/lib/motion";

interface NodeDetailsDrawerProps {
  task: Task | null;
  onClose: () => void;
}

export function NodeDetailsDrawer({ task, onClose }: NodeDetailsDrawerProps) {
  if (!task) return null;

  return (
    <AnimatePresence>
      {task && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/40 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            transition={{ duration: 0.2 }}
          />

          {/* Drawer */}
          <motion.div
            className="fixed right-0 top-0 bottom-0 w-[480px] bg-[#1a1f2e] shadow-2xl z-50 overflow-y-auto border-l border-gray-700"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.3, ease: ease.enter }}
          >
            {/* Header */}
            <div className="sticky top-0 bg-[#1a1f2e] border-b border-gray-700 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-100">{task.title}</h2>
                <p className="text-sm text-gray-400">Task #{task.order}</p>
              </div>
              <button
                onClick={onClose}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-800 hover:text-gray-300 transition-colors"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Status */}
              <div>
                <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Status</h3>
                <div className="flex items-center gap-2">
                  <span className={`
                    inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium
                    ${task.status === "PENDING" ? "bg-gray-800 text-gray-400 border-gray-700" : ""}
                    ${task.status === "IN_PROGRESS" ? "bg-indigo-900/60 text-indigo-300 border-indigo-700" : ""}
                    ${task.status === "COMPLETED" ? "bg-green-900/60 text-green-300 border-green-700" : ""}
                    ${task.status === "FAILED" ? "bg-red-900/60 text-red-300 border-red-700" : ""}
                  `}>
                    {task.status.replace("_", " ")}
                  </span>
                </div>
              </div>

              {/* Description */}
              {task.description && (
                <div>
                  <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Description</h3>
                  <p className="text-sm text-gray-300 leading-relaxed">{task.description}</p>
                </div>
              )}

              {/* Dependencies */}
              {task.dependsOn && task.dependsOn.length > 0 && (
                <div>
                  <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Dependencies</h3>
                  <div className="space-y-2">
                    {task.dependsOn.map((dep: any) => (
                      <div key={dep.id} className="flex items-center gap-2 text-sm text-gray-300 bg-gray-800/50 rounded-lg px-3 py-2">
                        <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4 text-gray-500">
                          <path d="M8 1a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 018 1z" />
                        </svg>
                        {dep.title || dep.id}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Metadata */}
              <div>
                <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Metadata</h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-gray-400">Created</dt>
                    <dd className="text-gray-200 font-medium">{new Date(task.createdAt).toLocaleString()}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-400">Updated</dt>
                    <dd className="text-gray-200 font-medium">{new Date(task.updatedAt).toLocaleString()}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-400">Task ID</dt>
                    <dd className="text-gray-200 font-mono text-xs">{task.id.slice(0, 8)}...</dd>
                  </div>
                </dl>
              </div>

              {/* Agent Pipeline Info */}
              <div>
                <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Agent Pipeline</h3>
                <div className="space-y-2">
                  {["CODE_GENERATOR", "TEST_GENERATOR", "CODE_REVIEWER"].map((agent, idx) => (
                    <div key={agent} className="flex items-center gap-3 text-sm bg-gray-800/50 rounded-lg px-3 py-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-700 border border-gray-600 text-xs font-medium text-gray-300">
                        {idx + 1}
                      </span>
                      <span className="text-gray-300">{agent.replace(/_/g, " ")}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
