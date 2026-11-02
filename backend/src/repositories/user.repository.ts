import { dbPool } from '../db/client';
import { User, UserPublic, RefreshToken } from '../models/user.model';
import crypto from 'crypto';

export class UserRepository {
  private mapUser(row: any): User & { microsoftId?: string } {
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.password_hash,
      name: row.name,
      role: row.role,
      isActive: row.is_active,
      lastLogin: row.last_login,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      microsoftId: row.microsoft_id,
    };
  }

  private mapUserPublic(row: any): UserPublic {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      isActive: row.is_active,
      lastLogin: row.last_login,
      createdAt: row.created_at,
    };
  }

  async findByEmail(email: string): Promise<User | null> {
    const result = await dbPool.query(
      'SELECT * FROM users WHERE email = $1 AND is_active = true AND deleted_at IS NULL',
      [email.toLowerCase()]
    );
    return result.rows[0] ? this.mapUser(result.rows[0]) : null;
  }

  async findAccountByEmail(email: string): Promise<User | null> {
    const result = await dbPool.query(
      'SELECT * FROM users WHERE LOWER(email) = $1 AND deleted_at IS NULL',
      [email.toLowerCase()]
    );
    return result.rows[0] ? this.mapUser(result.rows[0]) : null;
  }

  async findById(id: string): Promise<User | null> {
    const result = await dbPool.query(
      'SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    return result.rows[0] ? this.mapUser(result.rows[0]) : null;
  }

  async create(data: {
    email: string;
    passwordHash: string;
    name: string;
    role?: string;
    organizationId?: string | null;
  }): Promise<UserPublic> {
    const result = await dbPool.query(
      `INSERT INTO users (email, password_hash, name, role, organization_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        data.email.toLowerCase(),
        data.passwordHash,
        data.name,
        data.role || 'worker',
        data.organizationId ?? null,
      ]
    );
    return this.mapUserPublic(result.rows[0]);
  }

  async getOrganizationId(userId: string): Promise<string | null> {
    const result = await dbPool.query(
      'SELECT organization_id FROM users WHERE id = $1 AND deleted_at IS NULL',
      [userId]
    );
    return result.rows[0]?.organization_id ?? null;
  }

  async updateLastLogin(id: string): Promise<void> {
    await dbPool.query(
      'UPDATE users SET last_login = NOW(), updated_at = NOW() WHERE id = $1',
      [id]
    );
  }

  async list(limit = 200, offset = 0): Promise<UserPublic[]> {
    const result = await dbPool.query(
      'SELECT * FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset],
    );
    return result.rows.map((row) => this.mapUserPublic(row));
  }

  async softDelete(id: string): Promise<boolean> {
    const result = await dbPool.query(
      `UPDATE users
       SET deleted_at = NOW(), is_active = false, updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    if (result.rowCount === 0) {
      return false;
    }
    await this.revokeAllUserTokens(id);
    return true;
  }

  async update(id: string, data: Partial<{ name: string; role: string; isActive: boolean }>): Promise<UserPublic | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(data.name);
    }
    if (data.role !== undefined) {
      updates.push(`role = $${paramIndex++}`);
      values.push(data.role);
    }
    if (data.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(data.isActive);
    }

    if (updates.length === 0) return this.findById(id).then((u) => u ? this.mapUserPublic(u as any) : null);

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const result = await dbPool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex} AND deleted_at IS NULL RETURNING *`,
      values
    );
    return result.rows[0] ? this.mapUserPublic(result.rows[0]) : null;
  }

  // Refresh token methods
  async saveRefreshToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await dbPool.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, tokenHash, expiresAt.toISOString()]
    );
  }

  async findRefreshToken(tokenHash: string): Promise<RefreshToken | null> {
    const result = await dbPool.query(
      `SELECT * FROM refresh_tokens 
       WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW()`,
      [tokenHash]
    );
    if (!result.rows[0]) return null;
    const row = result.rows[0];
    return {
      id: row.id,
      userId: row.user_id,
      tokenHash: row.token_hash,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      revokedAt: row.revoked_at,
    };
  }

  async revokeRefreshToken(tokenHash: string): Promise<void> {
    await dbPool.query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1',
      [tokenHash]
    );
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    await dbPool.query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
      [userId]
    );
  }

  // Microsoft SSO methods
  async setMicrosoftId(userId: string, microsoftId: string): Promise<void> {
    await dbPool.query(
      'UPDATE users SET microsoft_id = $1, updated_at = NOW() WHERE id = $2',
      [microsoftId, userId]
    );
  }

  async findByMicrosoftId(microsoftId: string): Promise<User | null> {
    const result = await dbPool.query(
      'SELECT * FROM users WHERE microsoft_id = $1 AND is_active = true AND deleted_at IS NULL',
      [microsoftId]
    );
    return result.rows[0] ? this.mapUser(result.rows[0]) : null;
  }

  // Password reset methods
  async createPasswordResetToken(userId: string): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await dbPool.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, tokenHash, expiresAt.toISOString()]
    );

    return token;
  }

  async findPasswordResetToken(token: string): Promise<{ userId: string; expiresAt: string } | null> {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const result = await dbPool.query(
      `SELECT user_id, expires_at FROM password_reset_tokens 
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
      [tokenHash]
    );
    if (!result.rows[0]) return null;
    return {
      userId: result.rows[0].user_id,
      expiresAt: result.rows[0].expires_at,
    };
  }

  async markPasswordResetTokenUsed(token: string): Promise<void> {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await dbPool.query(
      'UPDATE password_reset_tokens SET used_at = NOW() WHERE token_hash = $1',
      [tokenHash]
    );
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await dbPool.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [passwordHash, userId]
    );
  }
}
