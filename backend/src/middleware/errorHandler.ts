import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  status?: number;
  statusCode?: number;
}

export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const status = err.status ?? err.statusCode ?? 500;
  const message = err.message || 'Internal Server Error';
  res.status(status).json({ error: message });
}
