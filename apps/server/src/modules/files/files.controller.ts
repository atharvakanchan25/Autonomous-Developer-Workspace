import { Request, Response } from "express";
import * as filesService from "./files.service";
import { createFileSchema, updateFileSchema, renameFileSchema } from "./files.schema";
import { asyncHandler } from "../../lib/asyncHandler";
import { badRequest } from "../../lib/errors";

export const listFiles = asyncHandler(async (req: Request, res: Response) => {
  const { projectId } = req.query;
  if (typeof projectId !== "string" || !projectId) throw badRequest("projectId query param is required");
  res.json(await filesService.listFiles(projectId));
});

export const getFile = asyncHandler(async (req: Request, res: Response) => {
  res.json(await filesService.getFile(req.params.id!));
});

export const createFile = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await filesService.createFile(createFileSchema.parse(req.body)));
});

export const updateFile = asyncHandler(async (req: Request, res: Response) => {
  res.json(await filesService.updateFile(req.params.id!, updateFileSchema.parse(req.body)));
});

export const renameFile = asyncHandler(async (req: Request, res: Response) => {
  res.json(await filesService.renameFile(req.params.id!, renameFileSchema.parse(req.body)));
});

export const deleteFile = asyncHandler(async (req: Request, res: Response) => {
  await filesService.deleteFile(req.params.id!);
  res.status(204).send();
});

export const listVersions = asyncHandler(async (req: Request, res: Response) => {
  res.json(await filesService.listVersions(req.params.id!));
});

export const getVersion = asyncHandler(async (req: Request, res: Response) => {
  res.json(await filesService.getVersion(req.params.versionId!));
});

export const restoreVersion = asyncHandler(async (req: Request, res: Response) => {
  res.json(await filesService.restoreVersion(req.params.id!, req.params.versionId!));
});
