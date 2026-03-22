import { NextFunction, Request, Response } from "express";
import * as tasksService from "./tasks.service";
import { createTaskSchema, updateTaskStatusSchema } from "./tasks.schema";
import * as queueService from "../../queue/queue.service";

// ── Existing handlers ────────────────────────────────────────────────────────

export async function getTasks(req: Request, res: Response, next: NextFunction) {
  try {
    const { projectId } = req.query;
    const tasks = await tasksService.getAllTasks(
      typeof projectId === "string" ? projectId : undefined,
    );
    res.json(tasks);
  } catch (err) {
    next(err);
  }
}

export async function getTask(req: Request, res: Response, next: NextFunction) {
  try {
    const task = await tasksService.getTaskById(req.params.id);
    res.json(task);
  } catch (err) {
    next(err);
  }
}

export async function createTask(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createTaskSchema.parse(req.body);
    const task = await tasksService.createTask(data);
    res.status(201).json(task);
  } catch (err) {
    next(err);
  }
}

export async function updateTaskStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateTaskStatusSchema.parse(req.body);
    const task = await tasksService.updateTaskStatus(req.params.id, data);
    res.json(task);
  } catch (err) {
    next(err);
  }
}

// ── Queue handlers ───────────────────────────────────────────────────────────

export async function enqueueTask(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await queueService.enqueueTask(req.params.id);
    res.status(202).json(result);
  } catch (err) {
    next(err);
  }
}

export async function getJobStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await queueService.getJobStatus(req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function retryJob(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await queueService.retryJob(req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getQueueMetrics(_req: Request, res: Response, next: NextFunction) {
  try {
    const metrics = await queueService.getQueueMetrics();
    res.json(metrics);
  } catch (err) {
    next(err);
  }
}
