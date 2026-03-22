import "dotenv/config";
import { config } from "./lib/config";

import http from "http";
import crypto from "crypto";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { db } from "./lib/firestore";
import { logger } from "./lib/logger";
import { initSocketServer } from "./lib/socket";
import { errorHandler } from "./lib/errorHandler";
import projectsRouter from "./modules/projects/projects.router";
import tasksRouter from "./modules/tasks/tasks.router";
import aiRouter from "./modules/ai/ai.router";
import agentsRouter from "./agents/agent.router";
import observabilityRouter from "./modules/observability/observability.router";
import filesRouter from "./modules/files/files.router";
import cicdRouter from "./modules/cicd/cicd.router";
import { bootstrapAgents } from "./agents/agent.service";
import { taskQueue } from "./queue/queue";

// importing worker registers the queue listener — must happen after bootstrapAgents
import "./queue/worker";

const app = express();

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: config.CORS_ORIGIN, credentials: true }));

// ── Request ID ────────────────────────────────────────────────────────────────
app.use((req: Request & { id?: string }, _res: Response, next: NextFunction) => {
  req.id = crypto.randomUUID();
  next();
});

// ── Rate limiting ─────────────────────────────────────────────────────────────
app.use("/api", rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
}));

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: "10mb" }));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/projects",  projectsRouter);
app.use("/api/tasks",     tasksRouter);
app.use("/api/ai",        aiRouter);
app.use("/api/agents",    agentsRouter);
app.use("/api/observe",   observabilityRouter);
app.use("/api/files",     filesRouter);
app.use("/api/cicd",      cicdRouter);

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", async (_req, res) => {
  let dbOk = false;
  try {
    await db.collection("_health").limit(1).get();
    dbOk = true;
  } catch { /* Firestore unreachable */ }

  const status = dbOk ? "ok" : "degraded";
  res.status(dbOk ? 200 : 503).json({
    status,
    services: { db: dbOk ? "connected" : "disconnected" },
    timestamp: new Date().toISOString(),
  });
});

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: "Route not found" }));

// ── Error handler ─────────────────────────────────────────────────────────────
app.use(errorHandler);

// ── HTTP + Socket.io ──────────────────────────────────────────────────────────
const httpServer = http.createServer(app);
initSocketServer(httpServer);

// ── Graceful shutdown ─────────────────────────────────────────────────────────
async function shutdown(signal: string) {
  logger.info(`Received ${signal} — shutting down`);
  await taskQueue.close();
  httpServer.close(() => {
    logger.info("Server shut down cleanly");
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception", { error: err.message, stack: err.stack });
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled rejection", { reason: String(reason) });
});

// ── Bootstrap ─────────────────────────────────────────────────────────────────
async function bootstrap() {
  bootstrapAgents();
  logger.info("Firestore connected");
  httpServer.listen(config.PORT, () => {
    logger.info(`Server running on http://localhost:${config.PORT}`);
    logger.info(`Environment: ${config.NODE_ENV}`);
  });
}

bootstrap().catch((err) => {
  logger.error("Failed to start server", { error: (err as Error).message });
  process.exit(1);
});
