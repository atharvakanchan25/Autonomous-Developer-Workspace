import { Router } from "express";
import * as ctrl from "./observability.controller";

const router = Router();

// GET /api/observe/summary        — stats cards
// GET /api/observe/logs           — paginated log feed
// GET /api/observe/agents         — agent run activity table
// GET /api/observe/timeline       — task execution timeline
// GET /api/observe/errors         — error-only feed
router.get("/summary", ctrl.getSummary);
router.get("/logs", ctrl.getLogs);
router.get("/agents", ctrl.getAgentActivity);
router.get("/timeline", ctrl.getTimeline);
router.get("/errors", ctrl.getErrors);

export default router;
