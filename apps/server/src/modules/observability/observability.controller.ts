import { Request, Response } from "express";
import { LogLevel } from "@prisma/client";
import * as obs from "./observability.service";
import { asyncHandler } from "../../lib/asyncHandler";

export const getSummary = asyncHandler(async (_req, res: Response) => {
  res.json(await obs.getSummaryStats());
});

export const getLogs = asyncHandler(async (req: Request, res: Response) => {
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
});

export const getAgentActivity = asyncHandler(async (req: Request, res: Response) => {
  const limit = req.query.limit ? Number(req.query.limit) : undefined;
  res.json(await obs.getAgentActivity(limit));
});

export const getTimeline = asyncHandler(async (req: Request, res: Response) => {
  const { projectId, limit } = req.query;
  res.json(await obs.getExecutionTimeline(
    projectId as string | undefined,
    limit ? Number(limit) : undefined,
  ));
});

export const getErrors = asyncHandler(async (req: Request, res: Response) => {
  const limit = req.query.limit ? Number(req.query.limit) : undefined;
  res.json(await obs.getErrors(limit));
});
