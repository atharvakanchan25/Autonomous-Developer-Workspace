export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
    // Maintains proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }
}

export const notFound = (resource: string) =>
  new AppError(404, `${resource} not found`);

export const badRequest = (message: string) =>
  new AppError(400, message);

export const conflict = (message: string) =>
  new AppError(409, message);

export const internalError = (message: string) =>
  new AppError(500, message);

export const forbidden = (message: string) =>
  new AppError(403, message);
