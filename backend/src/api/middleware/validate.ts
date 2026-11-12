import { NextFunction, Request, Response } from 'express';
import { ZodError, ZodSchema } from 'zod';
import { AppError } from '../../utils/errors';
import { logger } from '../../utils/logger';

/**
 * Top-level body keys the schema threw away. A form field whose name does not
 * match the schema (e.g. `minStockLevel` vs `min_stock_level`) is silently
 * lost; outside production that is logged so the mismatch is found early.
 */
export function droppedKeys(before: unknown, after: unknown): string[] {
  if (!before || typeof before !== 'object' || Array.isArray(before)) return [];
  if (!after || typeof after !== 'object' || Array.isArray(after)) return [];
  const kept = after as Record<string, unknown>;
  return Object.keys(before as Record<string, unknown>).filter(
    (k) => !(k in kept) && (before as Record<string, unknown>)[k] !== undefined
      && (before as Record<string, unknown>)[k] !== null && (before as Record<string, unknown>)[k] !== '',
  );
}

type SchemaGroup = {
  body?: ZodSchema;
  params?: ZodSchema;
  query?: ZodSchema;
};

export function validate(schemas: SchemaGroup) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as typeof req.params;
      }
      if (schemas.query) {
        req.query = schemas.query.parse(req.query) as typeof req.query;
      }
      if (schemas.body) {
        const raw = req.body;
        req.body = schemas.body.parse(req.body);
        if (process.env.NODE_ENV !== 'production') {
          const dropped = droppedKeys(raw, req.body);
          if (dropped.length) {
            logger.warn({ method: req.method, path: req.originalUrl, dropped }, '[validate] body fields dropped by schema');
          }
        }
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return next(
          new AppError('Validation failed', 'VALIDATION_ERROR', 400, {
            issues: error.issues,
          })
        );
      }
      next(error);
    }
  };
}
