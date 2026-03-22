"use client";

import { useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { TaskNode } from "./TaskNode";
import type { Task, TaskStatus } from "@/types";

const NODE_TYPES = { taskNode: TaskNode };

interface TaskGraphProps {
  nodes: Node[];
  edges: Edge[];
  tasks: Task[];
  onStatusChange: (taskId: string, status: TaskStatus) => void;
}

export function TaskGraph({ nodes: initialNodes, edges: initialEdges, onStatusChange }: TaskGraphProps) {
  // Inject the callback into every node's data so TaskNode can call it
  const nodesWithCallback = useMemo(
    () =>
      initialNodes.map((n) => ({
        ...n,
        data: { ...n.data, onStatusChange },
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [initialNodes],
  );

  const [, , onNodesChange] = useNodesState(nodesWithCallback);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  // Sync external node/edge updates into RF state
  const syncedNodes = useMemo(
    () =>
      initialNodes.map((n) => ({
        ...n,
        data: { ...n.data, onStatusChange },
      })),
    [initialNodes, onStatusChange],
  );

  const miniMapNodeColor = useCallback((node: Node) => {
    const task = (node.data as { task: Task }).task;
    const map: Record<TaskStatus, string> = {
      PENDING: "#d1d5db",
      IN_PROGRESS: "#93c5fd",
      COMPLETED: "#86efac",
      FAILED: "#fca5a5",
    };
    return map[task.status] ?? "#d1d5db";
  }, []);

  return (
    <ReactFlow
      nodes={syncedNodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={NODE_TYPES}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      minZoom={0.2}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e2e8f0" />
      <Controls showInteractive={false} className="!border-gray-200 !shadow-sm" />
      <MiniMap
        nodeColor={miniMapNodeColor}
        maskColor="rgba(241,245,249,0.7)"
        className="!border-gray-200 !shadow-sm"
      />
    </ReactFlow>
  );
}
