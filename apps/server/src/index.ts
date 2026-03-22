import "dotenv/config";
import express from "express";
import cors from "cors";
import { prisma } from "./lib/prisma";
import { logger } from "./lib/logger";
import { checkRedisHealth, redisClient } from "./lib/redis";
import { errorHandler } from "./lib/errorHandler";
import projectsRouter from "./modules/projects/projects.router";
import tasksRouter from "./modules/tasks/tasks.router";
import aiRouter from "./modules/ai/ai.router";
import { taskQueue, taskQueueEvents } from "./queue/queue";

// Import worker so it registers itself and starts listening
import "./queue/worker";

const app = express();
const PORT = process.env.PORT ?? 4000;

app.use(cors({ origin: process.env.CORS_ORIGIN ?? "http://localhost:3000" }));
app.use(express.json());

// ── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/projects", projectsRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/ai", aiRouter);

// ── Health ───────────────────────────────────────────────────────────────────
app.get("/health", async (_req, res) => {
  const [dbOk, redisOk] = await Promise.all([
    prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
    checkRedisHealth(),
  ]);

  const status = dbOk && redisOk ? "ok" : "degraded";
  res.status(status === "ok" ? 200 : 503).json({
    status,
    services: { db: dbOk ? "connected" : "disconnected", redis: redisOk ? "connected" : "disconnected" },
    timestamp: new Date().toISOString(),
  });
});

app.use(errorHandler);

// ── Graceful shutdown ────────────────────────────────────────────────────────
async function shutdown(signal: string) {
  logger.info(`Received ${signal} — shutting down`);
  await Promise.all([
    taskQueue.close(),
    taskQueueEvents.close(),
    redisClient.quit(),
    prisma.$disconnect(),
  ]);
  logger.info("Server shut down cleanly");
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// ── Bootstrap ────────────────────────────────────────────────────────────────
async function bootstrap() {
  await prisma.$connect();
  logger.info("Database connected");

  app.listen(PORT, () => {
    logger.info(`Server running on http://localhost:${PORT}`);
  });
}

bootstrap().catch((err) => {
  logger.error("Failed to start server", { error: (err as Error).message });
  process.exit(1);
});
