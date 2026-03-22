export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (resource: string) =>
  new AppError(404, `${resource} not found`);

export const badRequest = (message: string) =>
  new AppError(400, message);
