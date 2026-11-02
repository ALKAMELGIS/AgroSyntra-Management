import { Router, Response } from 'express';
import { z } from 'zod';
import { auth, authorize, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { dbPool } from '../../db/client';
import { requireDataEntryWriter } from '../middleware/dataEntryWrite';

export const breedersRouter = Router();
breedersRouter.use(auth);
breedersRouter.use(authorize('ceo', 'farm_manager', 'operation_manager', 'agronomist', 'worker'));
// Everyone above may read; only workers and agronomists add breeders.
breedersRouter.use(requireDataEntryWriter);

breedersRouter.get('/', asyncHandler(async (_req: AuthRequest, res: Response) => {
  const result = await dbPool.query(
    `SELECT * FROM breeders ORDER BY name ASC`
  );
  res.json({ success: true, data: result.rows });
}));

breedersRouter.post('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { name, country } = z.object({
    name: z.string().min(1),
    country: z.string().optional().nullable(),
  }).parse(req.body);

  const existing = await dbPool.query(
    `SELECT * FROM breeders WHERE LOWER(name) = LOWER($1)`, [name]
  );
  if (existing.rows.length > 0) {
    return res.json({ success: true, data: existing.rows[0] });
  }

  const result = await dbPool.query(
    `INSERT INTO breeders (name, country) VALUES ($1, $2) RETURNING *`,
    [name.trim(), country || null]
  );
  res.status(201).json({ success: true, data: result.rows[0] });
}));
