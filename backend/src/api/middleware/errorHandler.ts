import { NextFunction, Request, Response } from 'express';
import { AppError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { captureException } from '../../utils/sentry';
import { incrementErrorCount } from '../v1/health.routes';

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  incrementErrorCount();

  if (res.headersSent) {
    logger.error({ err, url: req.url, method: req.method }, 'Error after response already sent');
    return;
  }

  const pgErr = err as { code?: string; detail?: string; constraint?: string; table?: string; column?: string };
  if (pgErr?.code === '23505') {
    const conflict = new AppError('Duplicate value', 'CONFLICT', 409, {
      detail: pgErr.detail,
      constraint: pgErr.constraint,
    });
    logger.error({ err }, 'Request failed');
    res.status(conflict.status).json({
      success: false,
      error: {
        code: conflict.code,
        message: conflict.message,
        details: conflict.details,
      },
    });
    return;
  }
  if (pgErr?.code === '42P01' || pgErr?.code === '42883') {
    logger.error({ err, table: pgErr.table }, 'Missing table or function — migration may not have run');
    res.status(503).json({
      success: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Database schema not ready. A required migration may not have run.',
      },
    });
    return;
  }
  if (pgErr?.code === '23503' || pgErr?.code === '23502' || pgErr?.code === '23514' || pgErr?.code === '22P02' || pgErr?.code === '22007') {
    const dbError = new AppError('Database validation error', 'VALIDATION_ERROR', 400, {
      code: pgErr.code,
      detail: pgErr.detail,
      constraint: pgErr.constraint,
      table: pgErr.table,
      column: pgErr.column,
    });
    logger.error({ err }, 'Request failed');
    res.status(dbError.status).json({
      success: false,
      error: {
        code: dbError.code,
        message: dbError.message,
        details: dbError.details,
      },
    });
    return;
  }

  const isDev = process.env.NODE_ENV !== 'production';
  const unknownError =
    err instanceof Error
      ? { message: err.message, stack: isDev ? err.stack : undefined }
      : undefined;

  const error =
    err instanceof AppError
      ? err
      : new AppError(
          isDev && err instanceof Error ? err.message : 'Internal server error',
          'INTERNAL_SERVER_ERROR',
          500,
          isDev ? unknownError : undefined
        );

  logger.error({ err }, 'Request failed');

  // Capture 5xx errors to Sentry
  if (error.status >= 500 && err instanceof Error) {
    captureException(err, {
      url: req.url,
      method: req.method,
      requestId: req.headers['x-request-id'],
    });
  }

  res.status(error.status).json({
    success: false,
    error: {
      code: error.code,
      message: error.message,
      details: error.details,
    },
  });
}
