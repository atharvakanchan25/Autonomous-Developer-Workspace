"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import dagre from "dagre";
import { type Node, type Edge, MarkerType } from "@xyflow/react";
import { api } from "./api";
import { useSocket } from "./useSocket";
import type { Task, TaskStatus } from "@/types";
import type { TaskUpdatedPayload } from "./socket.events";

const NODE_W = 320;
const NODE_H = 140;
const FALLBACK_POLL_MS = 15_000; // only used when socket is disconnected

function applyDagreLayout(nodes: Node[], edges: Edge[]): Node[] {
  // Sort nodes by order number
  const sortedNodes = [...nodes].sort((a, b) => {
    const orderA = (a.data as { task: Task }).task.order;
    const orderB = (b.data as { task: Task }).task.order;
    return orderA - orderB;
  });
  
  // Arrange in two columns with even spacing
  const arranged: Node[] = [];
  const columnWidth = 500;  // Distance between columns
  const rowHeight = 280;    // Distance between rows
  const startX = 150;       // Left margin
  const startY = 100;       // Top margin
  
  sortedNodes.forEach((node, index) => {
    const column = index % 2;  // Alternate between 0 and 1
    const row = Math.floor(index / 2);
    
    arranged.push({
      ...node,
      position: {
        x: startX + (column * columnWidth),
        y: startY + (row * rowHeight)
      }
    });
  });
  
  return arranged;
}

function tasksToGraph(tasks: Task[]): { nodes: Node[]; edges: Edge[] } {
  const rawNodes: Node[] = tasks.map((t) => ({
    id: t.id,
    type: "taskNode",
    position: { x: 0, y: 0 },
    data: { task: t },
  }));

  const edges: Edge[] = tasks.flatMap((t) =>
    (t.dependsOn ?? []).map((dep) => ({
      id: `${dep.id}->${t.id}`,
      source: dep.id,
      target: t.id,
      animated: t.status === "IN_PROGRESS",
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: "#94a3b8" },
      style: { stroke: "#94a3b8", strokeWidth: 1.5 },
    })),
  );

  return { nodes: applyDagreLayout(rawNodes, edges), edges };
}

export interface UseTaskGraphResult {
  nodes: Node[];
  edges: Edge[];
  tasks: Task[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  socketStatus: "connecting" | "connected" | "disconnected";
  refresh: () => void;
  updateTaskStatus: (taskId: string, status: TaskStatus) => Promise<void>;
}

export function useTaskGraph(projectId: string | null): UseTaskGraphResult {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const socketStatusRef = useRef<"connecting" | "connected" | "disconnected">("disconnected");

  const applyTasks = useCallback((data: Task[]) => {
    setTasks(data);
    const { nodes: n, edges: e } = tasksToGraph(data);
    setNodes(n);
    setEdges(e);
    setLastUpdated(new Date());
  }, []);

  const fetchTasks = useCallback(async (pid: string, silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await api.tasks.listWithDeps(pid);
      applyTasks(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tasks");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [applyTasks]);

  // ── Socket: handle task:updated — patch single task in place ─────────────
  const handleTaskUpdated = useCallback((payload: TaskUpdatedPayload) => {
    if (payload.projectId !== projectId) return;
    setTasks((prev) => {
      const updated = prev.map((t) =>
        t.id === payload.taskId
          ? { ...t, status: payload.status, updatedAt: payload.updatedAt }
          : t,
      );
      const { nodes: n, edges: e } = tasksToGraph(updated);
      setNodes(n);
      setEdges(e);
      setLastUpdated(new Date());
      return updated;
    });
  }, [projectId]);

  const { status: socketStatus } = useSocket({
    projectId,
    onTaskUpdated: handleTaskUpdated,
  });

  // Track socket status in a ref so the polling interval can read it
  useEffect(() => {
    socketStatusRef.current = socketStatus;
  }, [socketStatus]);

  // ── Initial load + fallback polling when socket is down ───────────────────
  useEffect(() => {
    if (!projectId) {
      setTasks([]); setNodes([]); setEdges([]);
      return;
    }

    fetchTasks(projectId);

    timerRef.current = setInterval(() => {
      // Only poll when socket is not connected
      if (socketStatusRef.current !== "connected") {
        fetchTasks(projectId, true);
      }
    }, FALLBACK_POLL_MS);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [projectId, fetchTasks]);

  // ── Optimistic status update ──────────────────────────────────────────────
  const updateTaskStatus = useCallback(async (taskId: string, status: TaskStatus) => {
    setTasks((prev) => {
      const updated = prev.map((t) => (t.id === taskId ? { ...t, status } : t));
      const { nodes: n, edges: e } = tasksToGraph(updated);
      setNodes(n);
      setEdges(e);
      return updated;
    });
    await api.tasks.updateStatus(taskId, status);
  }, []);

  return {
    nodes, edges, tasks, loading, error, lastUpdated,
    socketStatus,
    refresh: () => projectId && fetchTasks(projectId),
    updateTaskStatus,
  };
}
