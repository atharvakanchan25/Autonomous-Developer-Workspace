"use client";

import { memo, useCallback } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { Task, TaskStatus } from "@/types";

// ── Status colour tokens ─────────────────────────────────────────────────────
export const STATUS_STYLES: Record<
  TaskStatus,
  { border: string; bg: string; badge: string; dot: string }
> = {
  PENDING: {
    border: "border-gray-300",
    bg: "bg-white",
    badge: "bg-gray-100 text-gray-500",
    dot: "bg-gray-400",
  },
  IN_PROGRESS: {
    border: "border-blue-400",
    bg: "bg-blue-50",
    badge: "bg-blue-100 text-blue-700",
    dot: "bg-blue-500",
  },
  COMPLETED: {
    border: "border-green-400",
    bg: "bg-green-50",
    badge: "bg-green-100 text-green-700",
    dot: "bg-green-500",
  },
  FAILED: {
    border: "border-red-400",
    bg: "bg-red-50",
    badge: "bg-red-100 text-red-700",
    dot: "bg-red-500",
  },
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  FAILED: "Failed",
};

const ALL_STATUSES: TaskStatus[] = ["PENDING", "IN_PROGRESS", "COMPLETED", "FAILED"];

// ── Node component ───────────────────────────────────────────────────────────
interface TaskNodeData {
  task: Task;
  onStatusChange?: (id: string, status: TaskStatus) => void;
}

function TaskNodeInner({ data }: NodeProps) {
  const { task, onStatusChange } = data as unknown as TaskNodeData;
  const s = STATUS_STYLES[task.status];

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      e.stopPropagation();
      onStatusChange?.(task.id, e.target.value as TaskStatus);
    },
    [task.id, onStatusChange],
  );

  return (
    <div
      className={`w-[220px] rounded-lg border-2 ${s.border} ${s.bg} shadow-sm transition-shadow hover:shadow-md`}
    >
      {/* Target handle — left */}
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2.5 !w-2.5 !border-2 !border-white !bg-slate-400"
      />

      <div className="px-3 py-2.5">
        {/* Header row */}
        <div className="mb-1.5 flex items-start justify-between gap-1">
          <span className="line-clamp-2 text-xs font-semibold leading-tight text-gray-800">
            {task.title}
          </span>
          <span className="ml-1 shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
            #{task.order}
          </span>
        </div>

        {/* Description */}
        {task.description && (
          <p className="mb-2 line-clamp-2 text-[10px] leading-snug text-gray-500">
            {task.description}
          </p>
        )}

        {/* Status row */}
        <div className="flex items-center justify-between">
          <span className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${s.badge}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
            {STATUS_LABELS[task.status]}
          </span>
          <select
            value={task.status}
            onChange={handleChange}
            onClick={(e) => e.stopPropagation()}
            className="rounded border border-gray-200 bg-white px-1 py-0.5 text-[10px] text-gray-600 focus:outline-none"
          >
            {ALL_STATUSES.map((st) => (
              <option key={st} value={st}>
                {STATUS_LABELS[st]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Source handle — right */}
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2.5 !w-2.5 !border-2 !border-white !bg-slate-400"
      />
    </div>
  );
}

export const TaskNode = memo(TaskNodeInner);
