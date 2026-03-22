import { Router } from "express";
import * as controller from "./agent.controller";

const router = Router();

// GET  /api/agents                        — list all registered agents
// POST /api/agents/run                    — dispatch single agent or full pipeline
// GET  /api/agents/runs/:id               — get a specific AgentRun by ID
// GET  /api/agents/tasks/:taskId/runs     — list all AgentRuns for a task
router.get("/", controller.listAgents);
router.post("/run", controller.runAgent);
router.get("/runs/:id", controller.getAgentRun);
router.get("/tasks/:taskId/runs", controller.listAgentRuns);

export default router;
