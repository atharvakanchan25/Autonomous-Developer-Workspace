import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "./errors";
import { logger } from "./logger";

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Validation error",
      details: err.flatten().fieldErrors,
    });
    return;
  }

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error("Application error", {
        statusCode: err.statusCode,
        message: err.message,
        path: req.path,
        method: req.method,
        requestId: (req as Request & { id?: string }).id,
      });
    }
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  // Unexpected error — log full details, never expose internals
  logger.error("Unhandled error", {
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
    path: req.path,
    method: req.method,
    requestId: (req as Request & { id?: string }).id,
  });

  res.status(500).json({ error: "Internal server error" });
}
