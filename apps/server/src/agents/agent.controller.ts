import { NextFunction, Request, Response } from "express";
import * as agentService from "./agent.service";

export async function runAgent(req: Request, res: Response, next: NextFunction) {
  try {
    const input = agentService.runAgentSchema.parse(req.body);
    const result = await agentService.runAgent(input);
    res.status(202).json(result);
  } catch (err) {
    next(err);
  }
}

export async function getAgentRun(req: Request, res: Response, next: NextFunction) {
  try {
    const run = await agentService.getAgentRun(req.params.id);
    res.json(run);
  } catch (err) {
    next(err);
  }
}

export async function listAgentRuns(req: Request, res: Response, next: NextFunction) {
  try {
    const runs = await agentService.listAgentRunsForTask(req.params.taskId);
    res.json(runs);
  } catch (err) {
    next(err);
  }
}

export async function listAgents(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(agentService.getRegisteredAgents());
  } catch (err) {
    next(err);
  }
}
