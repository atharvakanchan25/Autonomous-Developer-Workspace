import { Request, Response } from "express";
import { z } from "zod";
import * as cicdService from "./cicd.service";
import { asyncHandler } from "../../lib/asyncHandler";
import { badRequest } from "../../lib/errors";

const triggerSchema = z.object({
  projectId: z.string().cuid("Invalid project ID"),
  taskId: z.string().cuid("Invalid task ID").optional(),
});

export const triggerDeploy = asyncHandler(async (req: Request, res: Response) => {
  const { projectId, taskId } = triggerSchema.parse(req.body);
  // Fire-and-forget — pipeline runs async, client polls or listens via socket
  cicdService.runCicdPipeline(projectId, taskId ?? null).catch(() => null);
  res.status(202).json({ message: "Deployment triggered" });
});

export const listDeployments = asyncHandler(async (req: Request, res: Response) => {
  const { projectId } = req.query;
  if (typeof projectId !== "string" || !projectId) throw badRequest("projectId is required");
  res.json(await cicdService.listDeployments(projectId));
});

export const getDeployment = asyncHandler(async (req: Request, res: Response) => {
  res.json(await cicdService.getDeployment(req.params.id!));
});
