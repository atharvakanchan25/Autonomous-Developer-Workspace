import { Router } from "express";
import * as controller from "./tasks.controller";

const router = Router();

// ── CRUD ─────────────────────────────────────────────────────────────────────
router.get("/", controller.getTasks);
router.get("/:id", controller.getTask);
router.post("/", controller.createTask);
router.patch("/:id/status", controller.updateTaskStatus);

// ── Queue ─────────────────────────────────────────────────────────────────────
// POST   /tasks/:id/enqueue  — push task onto the queue
// GET    /tasks/:id/job      — poll job state + progress
// POST   /tasks/:id/retry    — manually retry a failed job
// GET    /tasks/queue/metrics — queue-level counts
router.get("/queue/metrics", controller.getQueueMetrics);
router.post("/:id/enqueue", controller.enqueueTask);
router.get("/:id/job", controller.getJobStatus);
router.post("/:id/retry", controller.retryJob);

export default router;
