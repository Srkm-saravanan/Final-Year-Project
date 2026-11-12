import { Prisma } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { env } from '../config/env.js';
import { sendError } from '../utils/response.js';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.name = 'AppError';
  }
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function notFoundHandler(req: Request, res: Response): void {
  sendError(res, 404, 'NOT_FOUND', `Route not found: ${req.method} ${req.originalUrl}`);
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    sendError(res, err.statusCode, err.code, err.message, err.details);
    return;
  }

  if (err instanceof ZodError) {
    sendError(
      res,
      400,
      'VALIDATION_ERROR',
      'Request validation failed',
      err.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }))
    );
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      sendError(res, 409, 'CONFLICT', 'A record with this unique identifier already exists.');
      return;
    }
    if (err.code === 'P2025') {
      sendError(res, 404, 'NOT_FOUND', 'Requested record was not found.');
      return;
    }
    if (err.code === 'P2003') {
      sendError(res, 400, 'FOREIGN_KEY_ERROR', 'Referenced relationship record does not exist.');
      return;
    }
  }

  const message =
    env.NODE_ENV === 'production'
      ? 'An unexpected internal server error occurred.'
      : err instanceof Error
        ? err.message
        : 'Unknown server error';

  console.error('Unhandled backend error:', err);
  sendError(res, 500, 'INTERNAL_ERROR', message);
}

