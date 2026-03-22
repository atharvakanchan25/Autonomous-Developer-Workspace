import Redis from "ioredis";
import { config } from "./config";
import { logger } from "./logger";

export function parseRedisUrl(url: string): { host: string; port: number; password?: string; tls?: object } {
  const parsed = new URL(url);
  return {
    host: parsed.hostname || "localhost",
    port: parseInt(parsed.port || "6379", 10),
    ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
    // Enable TLS for rediss:// scheme (e.g. Redis Cloud, Upstash)
    ...(parsed.protocol === "rediss:" ? { tls: {} } : {}),
  };
}

export const redisConnectionOptions = parseRedisUrl(config.REDIS_URL);

function createRedisClient(name: string): Redis {
  const client = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
  });

  client.on("connect", () => logger.info(`Redis [${name}] connected`));
  client.on("ready", () => logger.info(`Redis [${name}] ready`));
  client.on("error", (err) => logger.error(`Redis [${name}] error`, { error: err.message }));
  client.on("close", () => logger.warn(`Redis [${name}] connection closed`));
  client.on("reconnecting", () => logger.info(`Redis [${name}] reconnecting…`));

  return client;
}

export const redisClient = createRedisClient("health");

export async function checkRedisHealth(): Promise<boolean> {
  try {
    return (await redisClient.ping()) === "PONG";
  } catch {
    return false;
  }
}
