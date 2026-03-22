import { NextFunction, Request, Response } from "express";
import { LogLevel } from "@prisma/client";
import * as obs from "./observability.service";

export async function getSummary(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await obs.getSummaryStats());
  } catch (err) { next(err); }
}

export async function getLogs(req: Request, res: Response, next: NextFunction) {
  try {
    const { level, source, projectId, taskId, search, limit, cursor } = req.query;
    res.json(await obs.getLogs({
      level: level as LogLevel | undefined,
      source: source as string | undefined,
      projectId: projectId as string | undefined,
      taskId: taskId as string | undefined,
      search: search as string | undefined,
      limit: limit ? Number(limit) : undefined,
      cursor: cursor as string | undefined,
    }));
  } catch (err) { next(err); }
}

export async function getAgentActivity(_req: Request, res: Response, next: NextFunction) {
  try {
    const limit = _req.query.limit ? Number(_req.query.limit) : undefined;
    res.json(await obs.getAgentActivity(limit));
  } catch (err) { next(err); }
}

export async function getTimeline(req: Request, res: Response, next: NextFunction) {
  try {
    const { projectId, limit } = req.query;
    res.json(await obs.getExecutionTimeline(
      projectId as string | undefined,
      limit ? Number(limit) : undefined,
    ));
  } catch (err) { next(err); }
}

export async function getErrors(_req: Request, res: Response, next: NextFunction) {
  try {
    const limit = _req.query.limit ? Number(_req.query.limit) : undefined;
    res.json(await obs.getErrors(limit));
  } catch (err) { next(err); }
}
