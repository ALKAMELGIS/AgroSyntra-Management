import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config';

export interface WorkerAuthRequest extends Request {
  worker?: {
    workerId: string;
    employeeId: string;
    name: string;
    isTeamLeader: boolean;
    siteId: string | null;
  };
}

/**
 * Middleware that validates worker JWT tokens (separate from main user auth).
 * Workers log in with employee_id + PIN and receive a limited-scope JWT.
 */
export function workerAuth(req: WorkerAuthRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: { message: 'Worker authentication required' } });
    }

    const token = authHeader.substring(7);
    const payload = jwt.verify(token, config.auth.jwtSecret) as any;

    if (payload.tokenType !== 'worker') {
      return res.status(401).json({ success: false, error: { message: 'Invalid worker token' } });
    }

    req.worker = {
      workerId: payload.workerId,
      employeeId: payload.employeeId,
      name: payload.name,
      isTeamLeader: payload.isTeamLeader,
      siteId: payload.siteId ?? null,
    };

    return next();
  } catch {
    return res.status(401).json({ success: false, error: { message: 'Invalid or expired worker token' } });
  }
}

/**
 * Requires the worker to be a team leader.
 */
export function requireTeamLeader(req: WorkerAuthRequest, res: Response, next: NextFunction) {
  if (!req.worker?.isTeamLeader) {
    return res.status(403).json({ success: false, error: { message: 'Team leader access required' } });
  }
  return next();
}
