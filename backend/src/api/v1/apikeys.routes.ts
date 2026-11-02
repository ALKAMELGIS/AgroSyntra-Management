import { Router, Response } from 'express';
import { auth, authorize } from '../middleware/auth';
import { AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/errors';
import { dbPool } from '../../db/client';
import { generateApiKey } from '../../utils/apiKey';

const apiKeysRouter = Router();
apiKeysRouter.use(auth);
apiKeysRouter.use(authorize('ceo', 'operation_manager'));

/** POST /api-keys - create a new API key (returns key ONCE) */
apiKeysRouter.post('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { name, permissions, expires_at } = req.body;
  if (!name?.trim()) {
    throw new AppError('Name is required', 'VALIDATION_ERROR', 400);
  }

  const { rawKey, keyHash, keyPrefix } = generateApiKey();

  const result = await dbPool.query(
    `INSERT INTO api_keys (user_id, name, key_hash, key_prefix, permissions, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, name, key_prefix, permissions, expires_at, is_active, created_at`,
    [req.user!.userId, name, keyHash, keyPrefix, JSON.stringify(permissions || []), expires_at || null]
  );

  // Return the raw key ONCE - it can never be retrieved again
  res.status(201).json({
    success: true,
    data: { ...result.rows[0], key: rawKey },
  });
}));

/** GET /api-keys - list user's API keys */
apiKeysRouter.get('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const limit = Math.min(Number(req.query.limit) || 100, 200);
  const result = await dbPool.query(
    `SELECT id, name, key_prefix, permissions, last_used, expires_at, is_active, created_at
     FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [req.user!.userId, limit]
  );
  res.json({ success: true, data: result.rows });
}));

/** DELETE /api-keys/:id - revoke an API key */
apiKeysRouter.delete('/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  await dbPool.query(
    'UPDATE api_keys SET is_active = false WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user!.userId]
  );
  res.json({ success: true });
}));

export { apiKeysRouter };
