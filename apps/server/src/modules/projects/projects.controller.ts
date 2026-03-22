import { NextFunction, Request, Response } from "express";
import * as projectsService from "./projects.service";
import { createProjectSchema } from "./projects.schema";

export async function getProjects(_req: Request, res: Response, next: NextFunction) {
  try {
    const projects = await projectsService.getAllProjects();
    res.json(projects);
  } catch (err) {
    next(err);
  }
}

export async function getProject(req: Request, res: Response, next: NextFunction) {
  try {
    const project = await projectsService.getProjectById(req.params.id);
    res.json(project);
  } catch (err) {
    next(err);
  }
}

export async function createProject(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createProjectSchema.parse(req.body);
    const project = await projectsService.createProject(data);
    res.status(201).json(project);
  } catch (err) {
    next(err);
  }
}
