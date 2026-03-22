// A typed error class so controllers and middleware can distinguish
// expected app errors (4xx/5xx) from unexpected crashes.
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
    if (Error.captureStackTrace) Error.captureStackTrace(this, AppError);
  }
}

export const notFound    = (resource: string) => new AppError(404, `${resource} not found`);
export const badRequest  = (message: string)  => new AppError(400, message);
export const conflict    = (message: string)  => new AppError(409, message);
export const forbidden   = (message: string)  => new AppError(403, message);
export const internalError = (message: string) => new AppError(500, message);
