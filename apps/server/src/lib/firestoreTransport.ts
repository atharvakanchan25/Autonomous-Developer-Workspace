import TransportStream from "winston-transport";

// lazy import to avoid circular dependency at module load time
// (logger → firestoreTransport → firestore → config → logger would blow up)
let dbInstance: typeof import("./firestore").db | null = null;
async function getDb() {
  if (!dbInstance) dbInstance = (await import("./firestore")).db;
  return dbInstance;
}

const LEVEL_MAP: Record<string, string> = {
  error: "ERROR",
  warn:  "WARN",
  info:  "INFO",
  debug: "DEBUG",
};

interface LogInfo {
  level: string;
  message: string;
  source?: string;
  taskId?: string;
  projectId?: string;
  agentRunId?: string;
  agentType?: string;
  durationMs?: number;
  [key: string]: unknown;
}

export class FirestoreTransport extends TransportStream {
  log(info: LogInfo, callback: () => void): void {
    setImmediate(() => this.emit("logged", info));

    const {
      level, message, source, taskId, projectId,
      agentRunId, agentType, durationMs,
      // strip winston internals before storing as meta
      service, timestamp, stack, ...rest
    } = info;

    const metaKeys = Object.keys(rest);
    const meta = metaKeys.length > 0 ? JSON.stringify(rest) : null;

    getDb()
      .then((db) =>
        db.collection("observabilityLogs").add({
          level: LEVEL_MAP[level] ?? "INFO",
          source: source ?? "server",
          message: String(message),
          taskId: taskId ?? null,
          projectId: projectId ?? null,
          agentRunId: agentRunId ?? null,
          agentType: agentType ?? null,
          durationMs: durationMs ?? null,
          meta,
          createdAt: new Date().toISOString(),
        }),
      )
      .catch(() => {
        // never throw from a transport — Firestore might not be ready yet
      });

    callback();
  }
}
