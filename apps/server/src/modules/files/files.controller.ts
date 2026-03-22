import { NextFunction, Request, Response } from "express";
import * as filesService from "./files.service";
import { createFileSchema, updateFileSchema, renameFileSchema } from "./files.schema";

export async function listFiles(req: Request, res: Response, next: NextFunction) {
  try {
    const { projectId } = req.query;
    if (typeof projectId !== "string") {
      res.status(400).json({ error: "projectId query param is required" });
      return;
    }
    res.json(await filesService.listFiles(projectId));
  } catch (err) { next(err); }
}

export async function getFile(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await filesService.getFile(req.params.id));
  } catch (err) { next(err); }
}

export async function createFile(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createFileSchema.parse(req.body);
    res.status(201).json(await filesService.createFile(data));
  } catch (err) { next(err); }
}

export async function updateFile(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateFileSchema.parse(req.body);
    res.json(await filesService.updateFile(req.params.id, data));
  } catch (err) { next(err); }
}

export async function renameFile(req: Request, res: Response, next: NextFunction) {
  try {
    const data = renameFileSchema.parse(req.body);
    res.json(await filesService.renameFile(req.params.id, data));
  } catch (err) { next(err); }
}

export async function deleteFile(req: Request, res: Response, next: NextFunction) {
  try {
    await filesService.deleteFile(req.params.id);
    res.status(204).send();
  } catch (err) { next(err); }
}

export async function listVersions(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await filesService.listVersions(req.params.id));
  } catch (err) { next(err); }
}

export async function getVersion(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await filesService.getVersion(req.params.versionId));
  } catch (err) { next(err); }
}

export async function restoreVersion(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await filesService.restoreVersion(req.params.id, req.params.versionId));
  } catch (err) { next(err); }
}
