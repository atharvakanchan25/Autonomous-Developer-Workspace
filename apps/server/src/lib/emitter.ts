import { getIO } from "./socket";
import type {
  TaskUpdatedPayload,
  AgentLogPayload,
  JobProgressPayload,
  PipelineStagePayload,
} from "./socket.events";

// Emit to all sockets in a project room
function toProject(projectId: string) {
  return getIO().to(`project:${projectId}`);
}

export const emitter = {
  taskUpdated(payload: TaskUpdatedPayload) {
    toProject(payload.projectId).emit("task:updated", payload);
  },

  agentLog(payload: AgentLogPayload) {
    toProject(payload.projectId).emit("agent:log", payload);
  },

  jobProgress(payload: JobProgressPayload) {
    toProject(payload.projectId).emit("job:progress", payload);
  },

  pipelineStage(payload: PipelineStagePayload) {
    toProject(payload.projectId).emit("pipeline:stage", payload);
  },
};
