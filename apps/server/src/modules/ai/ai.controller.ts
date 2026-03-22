import { NextFunction, Request, Response } from "express";
import { generatePlanSchema } from "./ai.schema";
import * as aiService from "./ai.service";

export async function generatePlan(req: Request, res: Response, next: NextFunction) {
  try {
    const input = generatePlanSchema.parse(req.body);
    const result = await aiService.generatePlan(input);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}
