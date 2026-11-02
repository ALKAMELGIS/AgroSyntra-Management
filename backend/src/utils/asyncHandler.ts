import { Request, Response, NextFunction } from 'express';

/**
 * Wraps an async Express route handler so that any rejected promise is
 * automatically forwarded to the centralised error-handler middleware
 * via `next(error)`.
 *
 * This eliminates repetitive try/catch blocks in every route and ensures
 * ALL errors flow through `errorHandler.ts`, which:
 *   - logs with Pino (structured)
 *   - reports 5xx to Sentry
 *   - maps Postgres error codes to user-friendly responses
 *   - returns a consistent `{ success, error }` envelope
 *
 * Usage:
 *   router.get('/', asyncHandler(async (req, res) => {
 *     const data = await someService();
 *     res.json({ success: true, data });
 *   }));
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
