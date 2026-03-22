import { NextFunction, Request, Response } from "express";
import * as cicdService from "./cicd.service";

export async function triggerDeploy(req: Request, res: Response, next: NextFunction) {
  try {
    const { projectId, taskId } = req.body as { projectId: string; taskId?: string };
    if (!projectId) { res.status(400).json({ error: "projectId is required" }); return; }
    cicdService.runCicdPipeline(projectId, taskId ?? null).catch(() => null);
    res.status(202).json({ message: "Deployment triggered" });
  } catch (err) { next(err); }
}

export async function listDeployments(req: Request, res: Response, next: NextFunction) {
  try {
    const { projectId } = req.query;
    if (typeof projectId !== "string") { res.status(400).json({ error: "projectId is required" }); return; }
    res.json(await cicdService.listDeployments(projectId));
  } catch (err) { next(err); }
}

export async function getDeployment(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await cicdService.getDeployment(req.params.id));
  } catch (err) { next(err); }
}
