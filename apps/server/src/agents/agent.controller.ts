import { Request, Response } from "express";
import * as agentService from "./agent.service";
import { asyncHandler } from "../lib/asyncHandler";

export const runAgent = asyncHandler(async (req: Request, res: Response) => {
  const input = agentService.runAgentSchema.parse(req.body);
  res.status(202).json(await agentService.runAgent(input));
});

export const getAgentRun = asyncHandler(async (req: Request, res: Response) => {
  res.json(await agentService.getAgentRun(req.params.id!));
});

export const listAgentRuns = asyncHandler(async (req: Request, res: Response) => {
  res.json(await agentService.listAgentRunsForTask(req.params.taskId!));
});

export const listAgents = asyncHandler(async (_req, res: Response) => {
  res.json(agentService.getRegisteredAgents());
});
