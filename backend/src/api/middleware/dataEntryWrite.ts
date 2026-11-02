import { NextFunction, Response } from 'express';
import { AuthRequest } from './auth';
import { AppError } from '../../utils/errors';
import { assertCanOperateDataEntry } from '../../utils/roleAccess';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Router-level guard for Crop History data entry (planting, nursery sowing,
 * germination, open field, breeders): reads pass through untouched so every
 * role the router already lets in can keep watching; any write needs a worker
 * or an agronomist.
 */
export function requireDataEntryWriter(req: AuthRequest, _res: Response, next: NextFunction): void {
  if (READ_METHODS.has(req.method)) return next();
  if (!req.user) {
    return next(new AppError('Authentication required', 'UNAUTHORIZED', 401));
  }
  try {
    assertCanOperateDataEntry(req.user);
    next();
  } catch (err) {
    next(err);
  }
}
