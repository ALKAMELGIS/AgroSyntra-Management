"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadsRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const upload_1 = require("../middleware/upload");
const storage_service_1 = require("../../services/storage.service");
const client_1 = require("../../db/client");
const asyncHandler_1 = require("../../utils/asyncHandler");
const errors_1 = require("../../utils/errors");
const uploadsRouter = (0, express_1.Router)();
exports.uploadsRouter = uploadsRouter;
// All upload routes require authentication
uploadsRouter.use(auth_1.auth);
/**
 * POST /uploads/:entity/:entityId
 * Upload one or more files attached to an entity.
 */
uploadsRouter.post('/:entity/:entityId', (req, res, next) => {
    (0, upload_1.uploadMultiple)(req, res, (err) => {
        if (err) {
            return res.status(400).json({
                success: false,
                error: { code: 'UPLOAD_ERROR', message: err.message },
            });
        }
        next();
    });
}, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { entity, entityId } = req.params;
    const files = req.files;
    if (!files || files.length === 0) {
        throw new errors_1.AppError('No files provided', 'NO_FILES', 400);
    }
    const results = [];
    for (const file of files) {
        const uploaded = await (0, storage_service_1.uploadFile)(file.buffer, file.originalname, file.mimetype, entity);
        const dbResult = await client_1.dbPool.query(`INSERT INTO attachments (entity, entity_id, filename, original_name, mime_type, size_bytes, url, storage_key, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`, [
            entity,
            entityId,
            uploaded.filename,
            file.originalname,
            file.mimetype,
            file.size,
            uploaded.url,
            uploaded.storageKey,
            req.user.userId,
        ]);
        results.push(dbResult.rows[0]);
    }
    res.status(201).json({ success: true, data: results });
}));
/**
 * GET /uploads/:entity/:entityId
 * List all attachments for an entity.
 */
uploadsRouter.get('/:entity/:entityId', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { entity, entityId } = req.params;
    const result = await client_1.dbPool.query(`SELECT a.*, u.name as uploaded_by_name
     FROM attachments a
     LEFT JOIN users u ON a.uploaded_by = u.id
     WHERE a.entity = $1 AND a.entity_id = $2
     ORDER BY a.created_at DESC`, [entity, entityId]);
    res.json({ success: true, data: result.rows });
}));
/**
 * DELETE /uploads/:id
 * Delete a specific attachment.
 */
uploadsRouter.delete('/:id', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const result = await client_1.dbPool.query('SELECT * FROM attachments WHERE id = $1', [id]);
    if (result.rows.length === 0) {
        throw new errors_1.NotFoundError('Attachment not found');
    }
    const attachment = result.rows[0];
    // Only the uploader or managers can delete
    const isOwner = attachment.uploaded_by === req.user.userId;
    const isManager = ['ceo', 'farm_manager', 'operation_manager'].includes(req.user.role);
    if (!isOwner && !isManager) {
        throw new errors_1.AppError('Not authorized to delete this attachment', 'FORBIDDEN', 403);
    }
    // Delete from storage
    await (0, storage_service_1.deleteFile)(attachment.storage_key);
    // Delete from DB
    await client_1.dbPool.query('DELETE FROM attachments WHERE id = $1', [id]);
    res.json({ success: true, data: { id } });
}));
