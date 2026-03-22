import "dotenv/config";
import http from "http";
import express from "express";
import cors from "cors";
import { prisma } from "./lib/prisma";
import { logger } from "./lib/logger";
import { checkRedisHealth, redisClient } from "./lib/redis";
import { initSocketServer } from "./lib/socket";
import { errorHandler } from "./lib/errorHandler";
import projectsRouter from "./modules/projects/projects.router";
import tasksRouter from "./modules/tasks/tasks.router";
import aiRouter from "./modules/ai/ai.router";
import agentsRouter from "./agents/agent.router";
import observabilityRouter from "./modules/observability/observability.router";
import filesRouter from "./modules/files/files.router";
import { bootstrapAgents } from "./agents/agent.service";
import { taskQueue, taskQueueEvents } from "./queue/queue";

// Worker registers itself and starts listening
import "./queue/worker";

const app = express();
const PORT = Number(process.env.PORT ?? 4000);

app.use(cors({ origin: process.env.CORS_ORIGIN ?? "http://localhost:3000" }));
app.use(express.json());

// ── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/projects", projectsRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/ai", aiRouter);
app.use("/api/agents", agentsRouter);
app.use("/api/observe", observabilityRouter);
app.use("/api/files", filesRouter);

// ── Health ───────────────────────────────────────────────────────────────────
app.get("/health", async (_req, res) => {
  const [dbOk, redisOk] = await Promise.all([
    prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
    checkRedisHealth(),
  ]);
  const status = dbOk && redisOk ? "ok" : "degraded";
  res.status(status === "ok" ? 200 : 503).json({
    status,
    services: {
      db: dbOk ? "connected" : "disconnected",
      redis: redisOk ? "connected" : "disconnected",
    },
    timestamp: new Date().toISOString(),
  });
});

app.use(errorHandler);

// ── HTTP + Socket.io server ───────────────────────────────────────────────────
const httpServer = http.createServer(app);
initSocketServer(httpServer);

// ── Graceful shutdown ────────────────────────────────────────────────────────
async function shutdown(signal: string) {
  logger.info(`Received ${signal} — shutting down`);
  await Promise.all([
    taskQueue.close(),
    taskQueueEvents.close(),
    redisClient.quit(),
    prisma.$disconnect(),
  ]);
  httpServer.close(() => {
    logger.info("Server shut down cleanly");
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// ── Bootstrap ────────────────────────────────────────────────────────────────
async function bootstrap() {
  bootstrapAgents();
  await prisma.$connect();
  logger.info("Database connected");

  httpServer.listen(PORT, () => {
    logger.info(`Server running on http://localhost:${PORT}`);
    logger.info(`Socket.io listening on ws://localhost:${PORT}`);
  });
}

bootstrap().catch((err) => {
  logger.error("Failed to start server", { error: (err as Error).message });
  process.exit(1);
});
