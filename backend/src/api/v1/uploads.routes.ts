import { Router, Request, Response, NextFunction } from 'express';
import { auth } from '../middleware/auth';
import { uploadMultiple } from '../middleware/upload';
import { uploadFile, deleteFile } from '../../services/storage.service';
import { dbPool } from '../../db/client';
import { AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError, NotFoundError } from '../../utils/errors';

const uploadsRouter = Router();

// All upload routes require authentication
uploadsRouter.use(auth);

/**
 * POST /uploads/:entity/:entityId
 * Upload one or more files attached to an entity.
 */
uploadsRouter.post(
  '/:entity/:entityId',
  (req: Request, res: Response, next: NextFunction) => {
    uploadMultiple(req, res, (err: any) => {
      if (err) {
        return res.status(400).json({
          success: false,
          error: { code: 'UPLOAD_ERROR', message: err.message },
        });
      }
      next();
    });
  },
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { entity, entityId } = req.params;
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      throw new AppError('No files provided', 'NO_FILES', 400);
    }

    const results = [];
    for (const file of files) {
      const uploaded = await uploadFile(file.buffer, file.originalname, file.mimetype, entity);

      const dbResult = await dbPool.query(
        `INSERT INTO attachments (entity, entity_id, filename, original_name, mime_type, size_bytes, url, storage_key, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          entity,
          entityId,
          uploaded.filename,
          file.originalname,
          file.mimetype,
          file.size,
          uploaded.url,
          uploaded.storageKey,
          req.user!.userId,
        ]
      );

      results.push(dbResult.rows[0]);
    }

    res.status(201).json({ success: true, data: results });
  })
);

/**
 * GET /uploads/:entity/:entityId
 * List all attachments for an entity.
 */
uploadsRouter.get('/:entity/:entityId', asyncHandler(async (req: Request, res: Response) => {
  const { entity, entityId } = req.params;
  const result = await dbPool.query(
    `SELECT a.*, u.name as uploaded_by_name
     FROM attachments a
     LEFT JOIN users u ON a.uploaded_by = u.id
     WHERE a.entity = $1 AND a.entity_id = $2
     ORDER BY a.created_at DESC`,
    [entity, entityId]
  );

  res.json({ success: true, data: result.rows });
}));

/**
 * DELETE /uploads/:id
 * Delete a specific attachment.
 */
uploadsRouter.delete('/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const result = await dbPool.query(
    'SELECT * FROM attachments WHERE id = $1',
    [id]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Attachment not found');
  }

  const attachment = result.rows[0];

  // Only the uploader or managers can delete
  const isOwner = attachment.uploaded_by === req.user!.userId;
  const isManager = ['ceo', 'farm_manager', 'operation_manager'].includes(req.user!.role);
  if (!isOwner && !isManager) {
    throw new AppError('Not authorized to delete this attachment', 'FORBIDDEN', 403);
  }

  // Delete from storage
  await deleteFile(attachment.storage_key);

  // Delete from DB
  await dbPool.query('DELETE FROM attachments WHERE id = $1', [id]);

  res.json({ success: true, data: { id } });
}));

export { uploadsRouter };
