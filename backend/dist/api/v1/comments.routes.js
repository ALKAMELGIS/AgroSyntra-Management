"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.commentsRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const asyncHandler_1 = require("../../utils/asyncHandler");
const errors_1 = require("../../utils/errors");
const comment_service_1 = require("../../services/comment.service");
const commentsRouter = (0, express_1.Router)();
exports.commentsRouter = commentsRouter;
commentsRouter.use(auth_1.auth);
/** GET /comments/:entity/:entityId */
commentsRouter.get('/:entity/:entityId', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const comments = await (0, comment_service_1.getComments)(req.params.entity, req.params.entityId);
    res.json({ success: true, data: comments });
}));
/** POST /comments/:entity/:entityId */
commentsRouter.post('/:entity/:entityId', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { comment } = req.body;
    if (!comment?.trim()) {
        throw new errors_1.AppError('Comment is required', 'VALIDATION_ERROR', 400);
    }
    const result = await (0, comment_service_1.addComment)(req.params.entity, req.params.entityId, req.user.userId, comment);
    res.status(201).json({ success: true, data: result });
}));
/** DELETE /comments/:commentId */
commentsRouter.delete('/:commentId', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const isAdmin = ['ceo', 'farm_manager'].includes(req.user.role);
    const deleted = await (0, comment_service_1.deleteComment)(req.params.commentId, req.user.userId, isAdmin);
    if (!deleted)
        throw new errors_1.NotFoundError('Comment not found');
    res.json({ success: true });
}));
