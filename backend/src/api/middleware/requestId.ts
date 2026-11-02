import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

export function requestId(req: Request, res: Response, next: NextFunction) {
  const header = req.headers['x-request-id'];
  const id = typeof header === 'string' && header.length > 0 ? header : randomUUID();
  (req as unknown as { id: string }).id = id;
  res.setHeader('x-request-id', id);
  next();
}
