import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "./errors";
import { logger } from "./logger";

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  // zod validation errors — return field-level details to the client
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Validation error", details: err.flatten().fieldErrors });
    return;
  }

  // known app errors — log 5xx, pass message through for 4xx
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error("Application error", {
        statusCode: err.statusCode,
        message: err.message,
        path: req.path,
        method: req.method,
      });
    }
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  // anything else — log full details, never expose internals to the client
  logger.error("Unhandled error", {
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
    path: req.path,
    method: req.method,
  });

  res.status(500).json({ error: "Internal server error" });
}
