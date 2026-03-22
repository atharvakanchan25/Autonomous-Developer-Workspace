"use client";

import { useEffect, useRef, useState } from "react";
import { getSocket } from "./socket";
import type {
  AgentLogPayload,
  TaskUpdatedPayload,
  JobProgressPayload,
  PipelineStagePayload,
  DeploymentUpdatedPayload,
} from "./socket.events";

export type SocketStatus = "connecting" | "connected" | "disconnected";

export interface UseSocketOptions {
  projectId: string | null;
  onTaskUpdated?: (payload: TaskUpdatedPayload) => void;
  onAgentLog?: (payload: AgentLogPayload) => void;
  onJobProgress?: (payload: JobProgressPayload) => void;
  onPipelineStage?: (payload: PipelineStagePayload) => void;
  onDeploymentUpdated?: (payload: DeploymentUpdatedPayload) => void;
}

/**
 * Manages a Socket.io connection and project room membership.
 *
 * Callbacks are stored in refs so the socket listener is registered once
 * and always calls the latest version — no listener churn on re-renders.
 */
export function useSocket({
  projectId,
  onTaskUpdated,
  onAgentLog,
  onJobProgress,
  onPipelineStage,
  onDeploymentUpdated,
}: UseSocketOptions): { status: SocketStatus } {
  const [status, setStatus] = useState<SocketStatus>("disconnected");

  // Keep latest callbacks in refs — avoids re-registering listeners
  const cbRefs = useRef({ onTaskUpdated, onAgentLog, onJobProgress, onPipelineStage, onDeploymentUpdated });
  cbRefs.current = { onTaskUpdated, onAgentLog, onJobProgress, onPipelineStage, onDeploymentUpdated };

  // Register socket event listeners once
  useEffect(() => {
    const socket = getSocket();
    if (!socket.connected) {
      setStatus("connecting");
      socket.connect();
    } else {
      setStatus("connected");
    }

    const onConnect = () => setStatus("connected");
    const onDisconnect = () => setStatus("disconnected");
    const onTaskUpdatedFn = (p: TaskUpdatedPayload) => cbRefs.current.onTaskUpdated?.(p);
    const onAgentLogFn = (p: AgentLogPayload) => cbRefs.current.onAgentLog?.(p);
    const onJobProgressFn = (p: JobProgressPayload) => cbRefs.current.onJobProgress?.(p);
    const onPipelineStageFn = (p: PipelineStagePayload) => cbRefs.current.onPipelineStage?.(p);
    const onDeploymentUpdatedFn = (p: DeploymentUpdatedPayload) => cbRefs.current.onDeploymentUpdated?.(p);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("task:updated", onTaskUpdatedFn);
    socket.on("agent:log", onAgentLogFn);
    socket.on("job:progress", onJobProgressFn);
    socket.on("pipeline:stage", onPipelineStageFn);
    socket.on("deployment:updated", onDeploymentUpdatedFn);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("task:updated", onTaskUpdatedFn);
      socket.off("agent:log", onAgentLogFn);
      socket.off("job:progress", onJobProgressFn);
      socket.off("pipeline:stage", onPipelineStageFn);
      socket.off("deployment:updated", onDeploymentUpdatedFn);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — listeners registered once, callbacks via refs

  // Join/leave project room when projectId changes
  useEffect(() => {
    if (!projectId) return;
    const socket = getSocket();
    const joinRoom = () => socket.emit("room:join", projectId);
    if (socket.connected) joinRoom();
    else socket.once("connect", joinRoom);
    return () => {
      socket.emit("room:leave", projectId);
      socket.off("connect", joinRoom);
    };
  }, [projectId]);

  return { status };
}
