import { Request, Response } from "express";
import { generatePlanSchema } from "./ai.schema";
import * as aiService from "./ai.service";
import { asyncHandler } from "../../lib/asyncHandler";

export const generatePlan = asyncHandler(async (req: Request, res: Response) => {
  const input = generatePlanSchema.parse(req.body);
  res.status(201).json(await aiService.generatePlan(input));
});
