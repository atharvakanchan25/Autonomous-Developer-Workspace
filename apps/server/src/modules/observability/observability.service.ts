import { db } from "../../lib/firestore";

const DEFAULT_LIMIT = 100;

export async function getSummaryStats() {
  const [tasksSnap, agentRunsSnap, errorLogsSnap] = await Promise.all([
    db.collection("tasks").get(),
    db.collection("agentRuns").get(),
    db.collection("observabilityLogs").where("level", "==", "ERROR").orderBy("createdAt", "desc").limit(5).get(),
  ]);

  const tasksByStatus: Record<string, number> = {};
  tasksSnap.docs.forEach((d) => {
    const s = d.data().status as string;
    tasksByStatus[s] = (tasksByStatus[s] ?? 0) + 1;
  });

  const agentRunsByStatus: Record<string, number> = {};
  let totalDuration = 0;
  let completedCount = 0;
  agentRunsSnap.docs.forEach((d) => {
    const data = d.data();
    const s = data.status as string;
    agentRunsByStatus[s] = (agentRunsByStatus[s] ?? 0) + 1;
    if (s === "COMPLETED" && data.durationMs) {
      totalDuration += data.durationMs as number;
      completedCount++;
    }
  });

  const recentErrors = errorLogsSnap.docs.map((d) => {
    const data = d.data();
    return { id: d.id, message: data.message, source: data.source, createdAt: data.createdAt, agentType: data.agentType };
  });

  return {
    tasks: { total: tasksSnap.size, byStatus: tasksByStatus },
    agentRuns: {
      total: agentRunsSnap.size,
      byStatus: agentRunsByStatus,
      avgDurationMs: completedCount > 0 ? Math.round(totalDuration / completedCount) : 0,
    },
    errors: { total: errorLogsSnap.size, recent: recentErrors },
  };
}

export interface LogsQuery {
  level?: string;
  source?: string;
  projectId?: string;
  taskId?: string;
  limit?: number;
  cursor?: string;
}

export async function getLogs(query: LogsQuery = {}) {
  const { level, source, projectId, taskId, limit = DEFAULT_LIMIT, cursor } = query;

  let q = db.collection("observabilityLogs").orderBy("createdAt", "desc") as FirebaseFirestore.Query;
  if (level) q = q.where("level", "==", level);
  if (source) q = q.where("source", "==", source);
  if (projectId) q = q.where("projectId", "==", projectId);
  if (taskId) q = q.where("taskId", "==", taskId);
  if (cursor) q = q.where("createdAt", "<", cursor);

  const snap = await q.limit(Math.min(limit, 500)).get();
  const logs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  return {
    logs,
    nextCursor: logs.length === limit ? (logs[logs.length - 1] as Record<string, unknown>).createdAt as string : null,
  };
}

export async function getAgentActivity(limit = 50) {
  const snap = await db.collection("agentRuns").orderBy("createdAt", "desc").limit(limit).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getExecutionTimeline(projectId?: string, limit = 20) {
  let q = db.collection("tasks")
    .where("status", "in", ["COMPLETED", "FAILED", "IN_PROGRESS"])
    .orderBy("updatedAt", "desc") as FirebaseFirestore.Query;
  if (projectId) q = q.where("projectId", "==", projectId);

  const snap = await q.limit(limit).get();

  return Promise.all(
    snap.docs.map(async (d) => {
      const task = { id: d.id, ...d.data() } as Record<string, unknown>;
      const runsSnap = await db.collection("agentRuns")
        .where("taskId", "==", d.id)
        .orderBy("createdAt", "asc")
        .get();
      const stages = runsSnap.docs.map((r) => ({ id: r.id, ...r.data() }));
      const totalDurationMs = stages.reduce((sum, r) => sum + ((r as Record<string, unknown>).durationMs as number ?? 0), 0);
      return { taskId: task.id, title: task.title, status: task.status, projectId: task.projectId, createdAt: task.createdAt, updatedAt: task.updatedAt, totalDurationMs, stages };
    }),
  );
}

export async function getErrors(limit = 50) {
  const snap = await db.collection("observabilityLogs")
    .where("level", "==", "ERROR")
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
