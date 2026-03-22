import TransportStream from "winston-transport";
import { LogLevel } from "@prisma/client";

// Lazy import to avoid circular dependency at module load time
let prismaInstance: typeof import("./prisma").prisma | null = null;
async function getPrisma() {
  if (!prismaInstance) {
    prismaInstance = (await import("./prisma")).prisma;
  }
  return prismaInstance;
}

const LEVEL_MAP: Record<string, LogLevel> = {
  error: LogLevel.ERROR,
  warn: LogLevel.WARN,
  info: LogLevel.INFO,
  debug: LogLevel.DEBUG,
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

export class PrismaTransport extends TransportStream {
  constructor(opts?: TransportStream.TransportStreamOptions) {
    super(opts);
  }

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

    getPrisma()
      .then((db) =>
        db.observabilityLog.create({
          data: {
            level: LEVEL_MAP[level] ?? LogLevel.INFO,
            source: source ?? "server",
            message: String(message),
            taskId: taskId ?? null,
            projectId: projectId ?? null,
            agentRunId: agentRunId ?? null,
            agentType: agentType ?? null,
            durationMs: durationMs ?? null,
            meta,
          },
        }),
      )
      .catch(() => {
        // Never throw from a transport — DB might not be ready yet
      });

    callback();
  }
}
