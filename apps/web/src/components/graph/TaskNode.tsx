"use client";

import { memo, useCallback, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { Task, TaskStatus } from "@/types";
import { duration, ease } from "@/lib/motion";
import { api } from "@/lib/api";

const STATUS_CONFIG: Record<TaskStatus, { 
  border: string; 
  bg: string; 
  badge: string; 
  dot: string;
  shadow: string;
}> = {
  PENDING: {
    border: "border-gray-700",
    bg: "bg-[#1a1f2e]",
    badge: "bg-gray-800 text-gray-400 border-gray-700",
    dot: "bg-gray-500",
    shadow: "shadow-sm shadow-black/10",
  },
  IN_PROGRESS: {
    border: "border-indigo-600",
    bg: "bg-[#1a1f2e]",
    badge: "bg-indigo-900/60 text-indigo-300 border-indigo-700",
    dot: "bg-indigo-500",
    shadow: "shadow-lg shadow-indigo-500/20",
  },
  COMPLETED: {
    border: "border-green-600",
    bg: "bg-[#1a1f2e]",
    badge: "bg-green-900/60 text-green-300 border-green-700",
    dot: "bg-green-500",
    shadow: "shadow-sm shadow-black/10",
  },
  FAILED: {
    border: "border-red-600",
    bg: "bg-[#1a1f2e]",
    badge: "bg-red-900/60 text-red-300 border-red-700",
    dot: "bg-red-500",
    shadow: "shadow-sm shadow-black/10",
  },
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "Running",
  COMPLETED: "Completed",
  FAILED: "Failed",
};

interface TaskNodeData {
  task: Task;
  onStatusChange?: (id: string, status: TaskStatus) => void;
  onNodeClick?: (task: Task) => void;
}

function TaskNodeInner({ data, selected }: NodeProps) {
  const { task, onNodeClick } = data as unknown as TaskNodeData;
  const config = STATUS_CONFIG[task.status];
  const isRunning = task.status === "IN_PROGRESS";
  const isCompleted = task.status === "COMPLETED";
  const isFailed = task.status === "FAILED";
  const [isTriggering, setIsTriggering] = useState(false);

  const handleClick = useCallback(() => {
    onNodeClick?.(task);
  }, [task, onNodeClick]);

  const handleRun = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (task.status !== "PENDING") return;
      setIsTriggering(true);
      try {
        await api.agents.run({ taskId: task.id, pipeline: true });
      } catch (err) {
        console.error("Failed to trigger task:", err);
      } finally {
        setIsTriggering(false);
      }
    },
    [task.id, task.status],
  );

  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2 !w-2 !border-2 !border-[#0f1419] !bg-gray-600 !rounded-full"
      />

      <motion.div
        onClick={handleClick}
        className={`
          relative w-[280px] rounded-xl border-2 ${config.border} ${config.bg} ${config.shadow}
          cursor-pointer transition-all
          ${selected ? 'ring-2 ring-indigo-500 ring-offset-2 ring-offset-[#0f1419]' : ''}
        `}
        initial={{ opacity: 0, y: 8 }}
        animate={{ 
          opacity: isRunning ? [0.85, 1, 0.85] : 1,
          y: 0,
          scale: selected ? 1.02 : 1,
        }}
        whileHover={{ 
          y: -2,
          boxShadow: isRunning 
            ? "0 10px 25px -5px rgba(99, 102, 241, 0.3), 0 8px 10px -6px rgba(99, 102, 241, 0.2)"
            : "0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.2)",
        }}
        transition={{
          opacity: isRunning ? { duration: 1.6, ease: "easeInOut", repeat: Infinity } : { duration: 0.2 },
          y: { duration: 0.2, ease: ease.enter },
          scale: { duration: 0.2 },
          boxShadow: { duration: 0.2 },
        }}
        layout
      >
        {/* Failure shake animation */}
        {isFailed && (
          <motion.div
            className="absolute inset-0"
            animate={{ x: [0, -2, 2, -2, 2, 0] }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
          />
        )}

        <div className="p-4">
          {/* Header */}
          <div className="mb-3 flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {/* Status Dot */}
              <motion.div
                className={`h-2.5 w-2.5 rounded-full ${config.dot} shrink-0`}
                animate={isRunning ? { scale: [1, 1.3, 1], opacity: [1, 0.6, 1] } : { scale: 1, opacity: 1 }}
                transition={isRunning ? { duration: 1.4, ease: "easeInOut", repeat: Infinity } : {}}
              />
              
              {/* Task Title */}
              <h3 className="text-sm font-semibold text-gray-100 line-clamp-2 leading-tight">
                {task.title}
              </h3>
            </div>

            {/* Order Badge */}
            <span className="shrink-0 rounded-md bg-gray-800 px-2 py-0.5 text-xs font-medium text-gray-400">
              #{task.order}
            </span>
          </div>

          {/* Description */}
          {task.description && (
            <p className="mb-3 text-xs leading-relaxed text-gray-400 line-clamp-2">
              {task.description}
            </p>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between gap-2">
            {/* Status Badge */}
            <motion.div
              key={task.status}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium ${config.badge}`}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, ease: ease.enter }}
            >
              {STATUS_LABELS[task.status]}
              
              {/* Completion Checkmark */}
              <AnimatePresence>
                {isCompleted && (
                  <motion.svg
                    viewBox="0 0 12 12"
                    fill="currentColor"
                    className="h-3 w-3 text-green-400"
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.5 }}
                    transition={{ duration: 0.3, ease: ease.enter }}
                  >
                    <path d="M10.28 2.28L4.5 8.06 1.72 5.28a.75.75 0 00-1.06 1.06l3.25 3.25a.75.75 0 001.06 0l6.25-6.25a.75.75 0 00-1.06-1.06z" />
                  </motion.svg>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Run Button */}
            {task.status === "PENDING" && (
              <motion.button
                onClick={handleRun}
                disabled={isTriggering}
                className="flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                transition={{ duration: 0.15 }}
              >
                {isTriggering ? (
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  <svg viewBox="0 0 12 12" fill="currentColor" className="h-3 w-3">
                    <path d="M3 2.5v7l6-3.5-6-3.5z" />
                  </svg>
                )}
                Run
              </motion.button>
            )}
          </div>
        </div>

        {/* Completion Ripple Effect */}
        <AnimatePresence>
          {isCompleted && (
            <motion.div
              className="absolute inset-0 rounded-xl border-2 border-green-500"
              initial={{ opacity: 0.6, scale: 1 }}
              animate={{ opacity: 0, scale: 1.1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
          )}
        </AnimatePresence>
      </motion.div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-2 !w-2 !border-2 !border-[#0f1419] !bg-gray-600 !rounded-full"
      />
    </>
  );
}

export const TaskNode = memo(TaskNodeInner);
