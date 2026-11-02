import { dbPool } from '../db/client';

export interface EntityComment {
  id: string;
  entity_type: string;
  entity_id: string;
  user_id: string;
  comment: string;
  created_at: Date;
  user_name?: string;
  user_email?: string;
}

/**
 * Get comments for any entity.
 */
export async function getComments(entityType: string, entityId: string): Promise<EntityComment[]> {
  const result = await dbPool.query(
    `SELECT ec.*, u.name as user_name, u.email as user_email
     FROM entity_comments ec
     LEFT JOIN users u ON u.id = ec.user_id
     WHERE ec.entity_type = $1 AND ec.entity_id = $2
     ORDER BY ec.created_at ASC`,
    [entityType, entityId]
  );
  return result.rows;
}

/**
 * Add a comment to any entity.
 */
export async function addComment(
  entityType: string,
  entityId: string,
  userId: string,
  comment: string
): Promise<EntityComment> {
  const result = await dbPool.query(
    `INSERT INTO entity_comments (entity_type, entity_id, user_id, comment)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [entityType, entityId, userId, comment]
  );

  // Re-query to include user info
  const full = await dbPool.query(
    `SELECT ec.*, u.name as user_name, u.email as user_email
     FROM entity_comments ec
     LEFT JOIN users u ON u.id = ec.user_id
     WHERE ec.id = $1`,
    [result.rows[0].id]
  );
  return full.rows[0];
}

/**
 * Delete a comment (only the author or admin can delete).
 */
export async function deleteComment(commentId: string, userId: string, isAdmin: boolean): Promise<boolean> {
  const query = isAdmin
    ? `DELETE FROM entity_comments WHERE id = $1`
    : `DELETE FROM entity_comments WHERE id = $1 AND user_id = $2`;
  const params = isAdmin ? [commentId] : [commentId, userId];
  const result = await dbPool.query(query, params);
  return (result.rowCount ?? 0) > 0;
}
