import { Request, Response } from "express";
import * as tasksService from "./tasks.service";
import { createTaskSchema, updateTaskStatusSchema } from "./tasks.schema";
import * as queueService from "../../queue/queue.service";
import { asyncHandler } from "../../lib/asyncHandler";

export const getTasks = asyncHandler(async (req: Request, res: Response) => {
  const { projectId } = req.query;
  res.json(await tasksService.getAllTasks(typeof projectId === "string" ? projectId : undefined));
});

export const getTask = asyncHandler(async (req: Request, res: Response) => {
  res.json(await tasksService.getTaskById(req.params.id!));
});

export const createTask = asyncHandler(async (req: Request, res: Response) => {
  const data = createTaskSchema.parse(req.body);
  res.status(201).json(await tasksService.createTask(data));
});

export const updateTaskStatus = asyncHandler(async (req: Request, res: Response) => {
  const data = updateTaskStatusSchema.parse(req.body);
  res.json(await tasksService.updateTaskStatus(req.params.id!, data));
});

export const enqueueTask = asyncHandler(async (req: Request, res: Response) => {
  res.status(202).json(await queueService.enqueueTask(req.params.id!));
});

export const getJobStatus = asyncHandler(async (req: Request, res: Response) => {
  res.json(await queueService.getJobStatus(req.params.id!));
});

export const retryJob = asyncHandler(async (req: Request, res: Response) => {
  res.json(await queueService.retryJob(req.params.id!));
});

export const getQueueMetrics = asyncHandler(async (_req, res: Response) => {
  res.json(await queueService.getQueueMetrics());
});
