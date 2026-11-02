import { Router, Response } from 'express';
import { auth } from '../middleware/auth';
import { AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError, NotFoundError } from '../../utils/errors';
import { getComments, addComment, deleteComment } from '../../services/comment.service';

const commentsRouter = Router();
commentsRouter.use(auth);

/** GET /comments/:entity/:entityId */
commentsRouter.get('/:entity/:entityId', asyncHandler(async (req: AuthRequest, res: Response) => {
  const comments = await getComments(req.params.entity, req.params.entityId);
  res.json({ success: true, data: comments });
}));

/** POST /comments/:entity/:entityId */
commentsRouter.post('/:entity/:entityId', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { comment } = req.body;
  if (!comment?.trim()) {
    throw new AppError('Comment is required', 'VALIDATION_ERROR', 400);
  }
  const result = await addComment(req.params.entity, req.params.entityId, req.user!.userId, comment);
  res.status(201).json({ success: true, data: result });
}));

/** DELETE /comments/:commentId */
commentsRouter.delete('/:commentId', asyncHandler(async (req: AuthRequest, res: Response) => {
  const isAdmin = ['ceo', 'farm_manager'].includes(req.user!.role);
  const deleted = await deleteComment(req.params.commentId, req.user!.userId, isAdmin);
  if (!deleted) throw new NotFoundError('Comment not found');
  res.json({ success: true });
}));

export { commentsRouter };
