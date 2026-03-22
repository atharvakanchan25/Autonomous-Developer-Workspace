import Redis from "ioredis";
import { logger } from "./logger";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

// BullMQ bundles its own ioredis — we pass plain connection options (host/port)
// so both the standalone client and BullMQ share the same config without
// conflicting ioredis versions.
export function parseRedisUrl(url: string): { host: string; port: number; password?: string } {
  const parsed = new URL(url);
  return {
    host: parsed.hostname || "localhost",
    port: parseInt(parsed.port || "6379", 10),
    ...(parsed.password ? { password: parsed.password } : {}),
  };
}

// Plain options object — safe to pass directly to BullMQ Queue/Worker/QueueEvents
export const redisConnectionOptions = parseRedisUrl(REDIS_URL);

function createRedisClient(name: string): Redis {
  const client = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
  });

  client.on("connect", () => logger.info(`Redis [${name}] connected`, { url: REDIS_URL }));
  client.on("ready", () => logger.info(`Redis [${name}] ready`));
  client.on("error", (err) => logger.error(`Redis [${name}] error`, { error: err.message }));
  client.on("close", () => logger.warn(`Redis [${name}] connection closed`));
  client.on("reconnecting", () => logger.info(`Redis [${name}] reconnecting…`));

  return client;
}

// Standalone ioredis client — used only for health checks and direct commands
export const redisClient = createRedisClient("health");

export async function checkRedisHealth(): Promise<boolean> {
  try {
    const pong = await redisClient.ping();
    return pong === "PONG";
  } catch {
    return false;
  }
}
