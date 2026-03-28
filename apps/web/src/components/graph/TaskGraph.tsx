"use client";

import { useCallback, useMemo, useState } from "react";
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
import { AnimatedEdge } from "./AnimatedEdge";
import { NodeDetailsDrawer } from "./NodeDetailsDrawer";
import type { Task, TaskStatus } from "@/types";

const NODE_TYPES = { taskNode: TaskNode };
const EDGE_TYPES = { animated: AnimatedEdge };

interface TaskGraphProps {
  nodes: Node[];
  edges: Edge[];
  tasks: Task[];
  onStatusChange: (taskId: string, status: TaskStatus) => void;
}

export function TaskGraph({ nodes: initialNodes, edges: initialEdges, tasks, onStatusChange }: TaskGraphProps) {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [, , onNodesChange] = useNodesState(initialNodes);
  const [, , onEdgesChange] = useEdgesState(initialEdges);

  // Build a set of task IDs that are currently running
  const runningTaskIds = useMemo(
    () => new Set(tasks.filter((t) => t.status === "IN_PROGRESS").map((t) => t.id)),
    [tasks],
  );

  // Handle node click
  const handleNodeClick = useCallback((task: Task) => {
    setSelectedTask(task);
    setSelectedNodeId(task.id);
  }, []);

  // Sync nodes with task data and add click handler
  const syncedNodes = useMemo(
    () => initialNodes.map((n) => ({
      ...n,
      selected: n.id === selectedNodeId,
      data: {
        ...n.data,
        onStatusChange,
        onNodeClick: handleNodeClick,
      },
    })),
    [initialNodes, onStatusChange, handleNodeClick, selectedNodeId],
  );

  // Get connected node IDs for highlighting
  const connectedNodeIds = useMemo(() => {
    if (!selectedNodeId) return new Set<string>();
    
    const connected = new Set<string>([selectedNodeId]);
    
    // Add upstream (dependencies)
    initialEdges.forEach((edge) => {
      if (edge.target === selectedNodeId) {
        connected.add(String(edge.source));
      }
    });
    
    // Add downstream (dependents)
    initialEdges.forEach((edge) => {
      if (edge.source === selectedNodeId) {
        connected.add(String(edge.target));
      }
    });
    
    return connected;
  }, [selectedNodeId, initialEdges]);

  // Mark edges as active when their source task is running, and highlight connected edges
  const animatedEdges = useMemo(
    () =>
      initialEdges.map((e) => {
        const isActive = runningTaskIds.has(String(e.source));
        const isHighlighted = selectedNodeId && (
          e.source === selectedNodeId || e.target === selectedNodeId
        );
        
        return {
          ...e,
          type: "animated",
          data: { active: isActive, highlighted: isHighlighted },
          animated: isActive,
        };
      }),
    [initialEdges, runningTaskIds, selectedNodeId],
  );

  const miniMapNodeColor = useCallback((node: Node) => {
    const task = (node.data as { task: Task }).task;
    const map: Record<TaskStatus, string> = {
      PENDING:     "#4b5563",
      IN_PROGRESS: "#6366f1",
      COMPLETED:   "#10b981",
      FAILED:      "#ef4444",
    };
    return map[task.status] ?? "#4b5563";
  }, []);

  return (
    <>
      <ReactFlow
        nodes={syncedNodes}
        edges={animatedEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1, minZoom: 0.4 }}
        minZoom={0.3}
        maxZoom={1.2}
        proOptions={{ hideAttribution: true }}
        onPaneClick={() => {
          setSelectedNodeId(null);
          setSelectedTask(null);
        }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={32}
          size={2}
          color="#1f2937"
          style={{ backgroundColor: "#0a0e14" }}
        />
        <Controls
          showInteractive={false}
          className="!rounded-xl !border !border-gray-700 !bg-[#1a1f2e] !shadow-lg"
        />
        <MiniMap
          nodeColor={miniMapNodeColor}
          maskColor="rgba(15, 20, 25, 0.85)"
          className="!rounded-xl !border !border-gray-700 !shadow-lg !bg-[#1a1f2e]"
          pannable
          zoomable
        />
      </ReactFlow>

      <NodeDetailsDrawer task={selectedTask} onClose={() => {
        setSelectedTask(null);
        setSelectedNodeId(null);
      }} />
    </>
  );
}
