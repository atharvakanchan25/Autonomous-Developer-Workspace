import { LogLevel, AgentRunStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma";

const DEFAULT_LIMIT = 100;

// ── Summary stats ─────────────────────────────────────────────────────────────

export async function getSummaryStats() {
  const [
    totalTasks,
    tasksByStatus,
    totalAgentRuns,
    agentRunsByStatus,
    errorCount,
    avgAgentDuration,
    recentErrors,
  ] = await Promise.all([
    prisma.task.count(),
    prisma.task.groupBy({ by: ["status"], _count: { id: true } }),
    prisma.agentRun.count(),
    prisma.agentRun.groupBy({ by: ["status"], _count: { id: true } }),
    prisma.observabilityLog.count({ where: { level: LogLevel.ERROR } }),
    prisma.agentRun.aggregate({
      _avg: { durationMs: true },
      where: { status: AgentRunStatus.COMPLETED, durationMs: { not: null } },
    }),
    prisma.observabilityLog.findMany({
      where: { level: LogLevel.ERROR },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, message: true, source: true, createdAt: true, agentType: true },
    }),
  ]);

  return {
    tasks: {
      total: totalTasks,
      byStatus: Object.fromEntries(tasksByStatus.map((r) => [r.status, r._count.id])),
    },
    agentRuns: {
      total: totalAgentRuns,
      byStatus: Object.fromEntries(agentRunsByStatus.map((r) => [r.status, r._count.id])),
      avgDurationMs: Math.round(avgAgentDuration._avg.durationMs ?? 0),
    },
    errors: { total: errorCount, recent: recentErrors },
  };
}

// ── Logs feed ─────────────────────────────────────────────────────────────────

export interface LogsQuery {
  level?: LogLevel;
  source?: string;
  projectId?: string;
  taskId?: string;
  search?: string;
  limit?: number;
  cursor?: string; // createdAt ISO string for cursor pagination
}

export async function getLogs(query: LogsQuery = {}) {
  const { level, source, projectId, taskId, search, limit = DEFAULT_LIMIT, cursor } = query;

  const logs = await prisma.observabilityLog.findMany({
    where: {
      ...(level ? { level } : {}),
      ...(source ? { source } : {}),
      ...(projectId ? { projectId } : {}),
      ...(taskId ? { taskId } : {}),
      ...(search ? { message: { contains: search, mode: "insensitive" } } : {}),
      ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 500),
  });

  return {
    logs,
    nextCursor: logs.length === limit ? logs[logs.length - 1]!.createdAt.toISOString() : null,
  };
}

// ── Agent activity ────────────────────────────────────────────────────────────

export async function getAgentActivity(limit = 50) {
  const runs = await prisma.agentRun.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      task: { select: { id: true, title: true, projectId: true } },
    },
  });

  return runs.map((r) => ({
    id: r.id,
    agentType: r.agentType,
    status: r.status,
    durationMs: r.durationMs,
    errorMsg: r.errorMsg,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    task: r.task,
  }));
}

// ── Execution timeline ────────────────────────────────────────────────────────
// Returns per-task execution data: start time, end time, agent stages

export async function getExecutionTimeline(projectId?: string, limit = 20) {
  const tasks = await prisma.task.findMany({
    where: {
      ...(projectId ? { projectId } : {}),
      status: { in: ["COMPLETED", "FAILED", "IN_PROGRESS"] },
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
    include: {
      agentRuns: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          agentType: true,
          status: true,
          durationMs: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      project: { select: { id: true, name: true } },
    },
  });

  return tasks.map((t) => {
    const totalDurationMs = t.agentRuns.reduce((sum, r) => sum + (r.durationMs ?? 0), 0);
    return {
      taskId: t.id,
      title: t.title,
      status: t.status,
      project: t.project,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      totalDurationMs,
      stages: t.agentRuns,
    };
  });
}

// ── Error details ─────────────────────────────────────────────────────────────

export async function getErrors(limit = 50) {
  return prisma.observabilityLog.findMany({
    where: { level: LogLevel.ERROR },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
