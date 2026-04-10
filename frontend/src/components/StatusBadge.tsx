"use client";

import { motion } from "framer-motion";
import type { TaskStatus } from "@/types";
import { duration, ease } from "@/lib/motion";

const styles: Record<TaskStatus, string> = {
  PENDING:     "border border-white/10 bg-white/5 text-gray-400",
  IN_PROGRESS: "border border-cyan-500/30 bg-cyan-500/10 text-cyan-400",
  COMPLETED:   "border border-purple-500/30 bg-purple-500/10 text-purple-400",
  FAILED:      "border border-pink-500/30 bg-pink-500/10 text-pink-400",
};

const dots: Record<TaskStatus, string> = {
  PENDING:     "bg-gray-500",
  IN_PROGRESS: "bg-cyan-400",
  COMPLETED:   "bg-purple-400",
  FAILED:      "bg-pink-500",
};

const labels: Record<TaskStatus, string> = {
  PENDING:     "Pending",
  IN_PROGRESS: "In Progress",
  COMPLETED:   "Completed",
  FAILED:      "Failed",
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  const isRunning = status === "IN_PROGRESS";

  return (
    <motion.span
      key={status}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: duration.standard, ease: ease.enter }}
    >
      <motion.span
        className={`h-1.5 w-1.5 rounded-full ${dots[status]}`}
        animate={isRunning ? { opacity: [0.4, 1, 0.4] } : { opacity: 1 }}
        transition={
          isRunning
            ? { duration: 1.2, ease: "easeInOut", repeat: Infinity }
            : { duration: duration.fast }
        }
      />
      {labels[status]}
    </motion.span>
  );
}
