"use client";

import { memo, useCallback, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { Task, TaskStatus } from "@/types";
import { duration, ease } from "@/lib/motion";
import { api } from "@/lib/api";

const STATUS_CONFIG: Record<TaskStatus, { 
  bg: string;
  border: string;
  badge: string; 
  glow: string;
  shadow: string;
}> = {
  PENDING: {
    bg: "bg-gradient-to-br from-gray-800 to-gray-900",
    border: "border-gray-600",
    badge: "bg-gray-700 text-gray-300 border-gray-600",
    glow: "shadow-gray-500/20",
    shadow: "shadow-xl",
  },
  IN_PROGRESS: {
    bg: "bg-gradient-to-br from-indigo-900 to-purple-900",
    border: "border-indigo-500",
    badge: "bg-indigo-800 text-indigo-200 border-indigo-500",
    glow: "shadow-indigo-500/60",
    shadow: "shadow-2xl",
  },
  COMPLETED: {
    bg: "bg-gradient-to-br from-emerald-900 to-green-900",
    border: "border-emerald-500",
    badge: "bg-emerald-800 text-emerald-200 border-emerald-500",
    glow: "shadow-emerald-500/50",
    shadow: "shadow-xl",
  },
  FAILED: {
    bg: "bg-gradient-to-br from-red-900 to-rose-900",
    border: "border-red-500",
    badge: "bg-red-800 text-red-200 border-red-500",
    glow: "shadow-red-500/50",
    shadow: "shadow-xl",
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
  const [isRetrying, setIsRetrying] = useState(false);

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

  const handleRetry = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsRetrying(true);
      try {
        await api.tasks.updateStatus(task.id, "PENDING");
        await api.agents.run({ taskId: task.id, pipeline: true });
      } catch (err) {
        console.error("Failed to retry task:", err);
      } finally {
        setIsRetrying(false);
      }
    },
    [task.id],
  );

  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        className="!h-3 !w-3 !border-2 !border-[#0f1419] !bg-indigo-500 !rounded-full !shadow-lg"
      />

      <motion.div
        onClick={handleClick}
        className={`
          relative w-[320px] rounded-2xl border-2 ${config.border} ${config.bg} ${config.shadow} ${config.glow}
          cursor-pointer overflow-hidden backdrop-blur-sm
          ${selected ? 'ring-4 ring-indigo-400/60' : ''}
        `}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ 
          opacity: 1,
          scale: selected ? 1.03 : 1,
        }}
        whileHover={{ 
          scale: selected ? 1.05 : 1.02,
          y: -2,
        }}
        transition={{
          duration: 0.3,
          ease: ease.enter,
        }}
      >
        {/* Glowing border for running tasks */}
        {isRunning && (
          <motion.div
            className="absolute inset-0 rounded-2xl border-2 border-indigo-400"
            animate={{
              opacity: [0.3, 0.8, 0.3],
              scale: [1, 1.02, 1],
            }}
            transition={{
              duration: 2,
              ease: "easeInOut",
              repeat: Infinity,
            }}
          />
        )}

        {/* Shimmer effect for running tasks */}
        {isRunning && (
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-indigo-400/20 to-transparent"
            animate={{
              x: ["-100%", "200%"],
            }}
            transition={{
              duration: 2.5,
              ease: "linear",
              repeat: Infinity,
            }}
          />
        )}

        <div className="relative p-5">
          {/* Header */}
          <div className="mb-4 flex items-start justify-between gap-3">
            {/* Order Badge */}
            <motion.div
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 ${config.border} bg-black/30 backdrop-blur-sm`}
              animate={isRunning ? { 
                rotate: 360,
                boxShadow: [
                  "0 0 20px rgba(99, 102, 241, 0.3)",
                  "0 0 30px rgba(99, 102, 241, 0.6)",
                  "0 0 20px rgba(99, 102, 241, 0.3)",
                ]
              } : {}}
              transition={isRunning ? { 
                rotate: { duration: 3, ease: "linear", repeat: Infinity },
                boxShadow: { duration: 2, ease: "easeInOut", repeat: Infinity }
              } : {}}
            >
              <span className="text-base font-bold text-white">#{task.order}</span>
            </motion.div>

            {/* Status Badge */}
            <motion.div
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold backdrop-blur-sm ${config.badge}`}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
            >
              <motion.div
                className={`h-2.5 w-2.5 rounded-full ${
                  task.status === "PENDING" ? "bg-gray-400" :
                  task.status === "IN_PROGRESS" ? "bg-indigo-400" :
                  task.status === "COMPLETED" ? "bg-emerald-400" :
                  "bg-red-400"
                }`}
                animate={isRunning ? {
                  scale: [1, 1.4, 1],
                  opacity: [1, 0.5, 1],
                  boxShadow: [
                    "0 0 0px rgba(99, 102, 241, 0)",
                    "0 0 12px rgba(99, 102, 241, 0.8)",
                    "0 0 0px rgba(99, 102, 241, 0)",
                  ]
                } : {}}
                transition={isRunning ? {
                  duration: 1.5,
                  ease: "easeInOut",
                  repeat: Infinity,
                } : {}}
              />
              {STATUS_LABELS[task.status]}
              
              {isCompleted && (
                <motion.svg
                  viewBox="0 0 12 12"
                  fill="currentColor"
                  className="h-3.5 w-3.5"
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 200, damping: 15 }}
                >
                  <path d="M10.28 2.28L4.5 8.06 1.72 5.28a.75.75 0 00-1.06 1.06l3.25 3.25a.75.75 0 001.06 0l6.25-6.25a.75.75 0 00-1.06-1.06z" />
                </motion.svg>
              )}
            </motion.div>
          </div>

          {/* Title */}
          <h3 className="mb-2 line-clamp-2 text-base font-bold leading-tight text-white">
            {task.title}
          </h3>

          {/* Description */}
          {task.description && (
            <p className="mb-4 line-clamp-2 text-xs leading-relaxed text-gray-400">
              {task.description}
            </p>
          )}

          {/* Action Button */}
          {task.status === "PENDING" && (
            <motion.button
              onClick={handleRun}
              disabled={isTriggering}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              whileHover={{ scale: 1.02, boxShadow: "0 0 20px rgba(99, 102, 241, 0.5)" }}
              whileTap={{ scale: 0.98 }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              {isTriggering ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Running...
                </>
              ) : (
                <>
                  <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
                    <path d="M4 3v10l8-5-8-5z" />
                  </svg>
                  Run Pipeline
                </>
              )}
            </motion.button>
          )}

          {isCompleted && (
            <motion.div
              className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500/20 border border-emerald-500/50 px-4 py-2.5 text-sm font-bold text-emerald-300"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
                <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
              </svg>
              Complete
            </motion.div>
          )}

          {isFailed && (
            <div className="flex flex-col gap-2">
              <motion.div
                className="flex items-center justify-center gap-2 rounded-xl bg-red-500/20 border border-red-500/50 px-4 py-2 text-xs font-bold text-red-300"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1, x: [0, -3, 3, -3, 3, 0] }}
                transition={{ x: { duration: 0.5 } }}
              >
                <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                  <path d="M8 0a8 8 0 100 16A8 8 0 008 0zM7 4a1 1 0 112 0v4a1 1 0 11-2 0V4zm1 8a1 1 0 100-2 1 1 0 000 2z" />
                </svg>
                Pipeline Failed
              </motion.div>
              <motion.button
                onClick={handleRetry}
                disabled={isRetrying}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg hover:bg-amber-500 disabled:opacity-60 transition-colors"
                whileHover={{ scale: 1.02, boxShadow: "0 0 20px rgba(217, 119, 6, 0.5)" }}
                whileTap={{ scale: 0.98 }}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
              >
                {isRetrying ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Retrying...
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
                      <path d="M13.5 2.5a.5.5 0 00-.5.5v1.38A6 6 0 102 8a.5.5 0 001 0 5 5 0 115 5 5 5 0 01-3.54-1.46l1.27-1.27A.5.5 0 005.5 9.5h-3a.5.5 0 00-.5.5v3a.5.5 0 00.85.35L4.1 12.1A7 7 0 1014 8V3a.5.5 0 00-.5-.5z" />
                    </svg>
                    Retry Pipeline
                  </>
                )}
              </motion.button>
            </div>
          )}
        </div>

        {/* Completion burst effect */}
        <AnimatePresence>
          {isCompleted && (
            <>
              {[...Array(8)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute h-2 w-2 rounded-full bg-emerald-400"
                  style={{
                    left: "50%",
                    top: "50%",
                  }}
                  initial={{ opacity: 1, scale: 0 }}
                  animate={{
                    opacity: 0,
                    scale: 3,
                    x: Math.cos((i * Math.PI * 2) / 8) * 60,
                    y: Math.sin((i * Math.PI * 2) / 8) * 60,
                  }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                />
              ))}
            </>
          )}
        </AnimatePresence>
      </motion.div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-3 !w-3 !border-2 !border-[#0f1419] !bg-indigo-500 !rounded-full !shadow-lg"
      />
    </>
  );
}

export const TaskNode = memo(TaskNodeInner);
