"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getComments = getComments;
exports.addComment = addComment;
exports.deleteComment = deleteComment;
const client_1 = require("../db/client");
/**
 * Get comments for any entity.
 */
async function getComments(entityType, entityId) {
    const result = await client_1.dbPool.query(`SELECT ec.*, u.name as user_name, u.email as user_email
     FROM entity_comments ec
     LEFT JOIN users u ON u.id = ec.user_id
     WHERE ec.entity_type = $1 AND ec.entity_id = $2
     ORDER BY ec.created_at ASC`, [entityType, entityId]);
    return result.rows;
}
/**
 * Add a comment to any entity.
 */
async function addComment(entityType, entityId, userId, comment) {
    const result = await client_1.dbPool.query(`INSERT INTO entity_comments (entity_type, entity_id, user_id, comment)
     VALUES ($1, $2, $3, $4)
     RETURNING *`, [entityType, entityId, userId, comment]);
    // Re-query to include user info
    const full = await client_1.dbPool.query(`SELECT ec.*, u.name as user_name, u.email as user_email
     FROM entity_comments ec
     LEFT JOIN users u ON u.id = ec.user_id
     WHERE ec.id = $1`, [result.rows[0].id]);
    return full.rows[0];
}
/**
 * Delete a comment (only the author or admin can delete).
 */
async function deleteComment(commentId, userId, isAdmin) {
    const query = isAdmin
        ? `DELETE FROM entity_comments WHERE id = $1`
        : `DELETE FROM entity_comments WHERE id = $1 AND user_id = $2`;
    const params = isAdmin ? [commentId] : [commentId, userId];
    const result = await client_1.dbPool.query(query, params);
    return (result.rowCount ?? 0) > 0;
}
