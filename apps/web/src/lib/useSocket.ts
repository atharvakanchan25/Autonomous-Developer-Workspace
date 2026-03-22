"use client";

import { useEffect, useState, useCallback } from "react";
import { getSocket } from "./socket";
import type { AgentLogPayload, TaskUpdatedPayload, JobProgressPayload, PipelineStagePayload } from "./socket.events";

export type SocketStatus = "connecting" | "connected" | "disconnected";

export interface UseSocketOptions {
  projectId: string | null;
  onTaskUpdated?: (payload: TaskUpdatedPayload) => void;
  onAgentLog?: (payload: AgentLogPayload) => void;
  onJobProgress?: (payload: JobProgressPayload) => void;
  onPipelineStage?: (payload: PipelineStagePayload) => void;
}

export function useSocket({
  projectId,
  onTaskUpdated,
  onAgentLog,
  onJobProgress,
  onPipelineStage,
}: UseSocketOptions): { status: SocketStatus } {
  const [status, setStatus] = useState<SocketStatus>("disconnected");

  // Stable callback refs so we can safely add/remove listeners
  const handleTaskUpdated = useCallback(
    (p: TaskUpdatedPayload) => onTaskUpdated?.(p),
    [onTaskUpdated],
  );
  const handleAgentLog = useCallback(
    (p: AgentLogPayload) => onAgentLog?.(p),
    [onAgentLog],
  );
  const handleJobProgress = useCallback(
    (p: JobProgressPayload) => onJobProgress?.(p),
    [onJobProgress],
  );
  const handlePipelineStage = useCallback(
    (p: PipelineStagePayload) => onPipelineStage?.(p),
    [onPipelineStage],
  );

  useEffect(() => {
    const socket = getSocket();

    if (!socket.connected) {
      setStatus("connecting");
      socket.connect();
    }

    const onConnect = () => setStatus("connected");
    const onDisconnect = () => setStatus("disconnected");

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("task:updated", handleTaskUpdated);
    socket.on("agent:log", handleAgentLog);
    socket.on("job:progress", handleJobProgress);
    socket.on("pipeline:stage", handlePipelineStage);

    if (socket.connected) setStatus("connected");

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("task:updated", handleTaskUpdated);
      socket.off("agent:log", handleAgentLog);
      socket.off("job:progress", handleJobProgress);
      socket.off("pipeline:stage", handlePipelineStage);
    };
  }, [handleTaskUpdated, handleAgentLog, handleJobProgress, handlePipelineStage]);

  // Join / leave project room when projectId changes
  useEffect(() => {
    if (!projectId) return;
    const socket = getSocket();

    const joinRoom = () => socket.emit("room:join", projectId);

    if (socket.connected) {
      joinRoom();
    } else {
      socket.once("connect", joinRoom);
    }

    return () => {
      socket.emit("room:leave", projectId);
      socket.off("connect", joinRoom);
    };
  }, [projectId]);

  return { status };
}
