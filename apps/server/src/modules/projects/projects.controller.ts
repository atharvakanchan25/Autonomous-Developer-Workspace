import { Request, Response } from "express";
import * as projectsService from "./projects.service";
import { createProjectSchema } from "./projects.schema";
import { asyncHandler } from "../../lib/asyncHandler";

export const getProjects = asyncHandler(async (_req, res) => {
  res.json(await projectsService.getAllProjects());
});

export const getProject = asyncHandler(async (req: Request, res: Response) => {
  res.json(await projectsService.getProjectById(req.params.id!));
});

export const createProject = asyncHandler(async (req: Request, res: Response) => {
  const data = createProjectSchema.parse(req.body);
  res.status(201).json(await projectsService.createProject(data));
});
