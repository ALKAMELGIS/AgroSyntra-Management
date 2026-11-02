"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserRepository = void 0;
const client_1 = require("../db/client");
const crypto_1 = __importDefault(require("crypto"));
class UserRepository {
    mapUser(row) {
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
    mapUserPublic(row) {
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
    async findByEmail(email) {
        const result = await client_1.dbPool.query('SELECT * FROM users WHERE email = $1 AND is_active = true AND deleted_at IS NULL', [email.toLowerCase()]);
        return result.rows[0] ? this.mapUser(result.rows[0]) : null;
    }
    async findAccountByEmail(email) {
        const result = await client_1.dbPool.query('SELECT * FROM users WHERE LOWER(email) = $1 AND deleted_at IS NULL', [email.toLowerCase()]);
        return result.rows[0] ? this.mapUser(result.rows[0]) : null;
    }
    async findById(id) {
        const result = await client_1.dbPool.query('SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL', [id]);
        return result.rows[0] ? this.mapUser(result.rows[0]) : null;
    }
    async create(data) {
        const result = await client_1.dbPool.query(`INSERT INTO users (email, password_hash, name, role, organization_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`, [
            data.email.toLowerCase(),
            data.passwordHash,
            data.name,
            data.role || 'worker',
            data.organizationId ?? null,
        ]);
        return this.mapUserPublic(result.rows[0]);
    }
    async getOrganizationId(userId) {
        const result = await client_1.dbPool.query('SELECT organization_id FROM users WHERE id = $1 AND deleted_at IS NULL', [userId]);
        return result.rows[0]?.organization_id ?? null;
    }
    async updateLastLogin(id) {
        await client_1.dbPool.query('UPDATE users SET last_login = NOW(), updated_at = NOW() WHERE id = $1', [id]);
    }
    async list(limit = 200, offset = 0) {
        const result = await client_1.dbPool.query('SELECT * FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]);
        return result.rows.map((row) => this.mapUserPublic(row));
    }
    async softDelete(id) {
        const result = await client_1.dbPool.query(`UPDATE users
       SET deleted_at = NOW(), is_active = false, updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL`, [id]);
        if (result.rowCount === 0) {
            return false;
        }
        await this.revokeAllUserTokens(id);
        return true;
    }
    async update(id, data) {
        const updates = [];
        const values = [];
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
        if (updates.length === 0)
            return this.findById(id).then((u) => u ? this.mapUserPublic(u) : null);
        updates.push(`updated_at = NOW()`);
        values.push(id);
        const result = await client_1.dbPool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex} AND deleted_at IS NULL RETURNING *`, values);
        return result.rows[0] ? this.mapUserPublic(result.rows[0]) : null;
    }
    // Refresh token methods
    async saveRefreshToken(userId, tokenHash, expiresAt) {
        await client_1.dbPool.query(`INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`, [userId, tokenHash, expiresAt.toISOString()]);
    }
    async findRefreshToken(tokenHash) {
        const result = await client_1.dbPool.query(`SELECT * FROM refresh_tokens 
       WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW()`, [tokenHash]);
        if (!result.rows[0])
            return null;
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
    async revokeRefreshToken(tokenHash) {
        await client_1.dbPool.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1', [tokenHash]);
    }
    async revokeAllUserTokens(userId) {
        await client_1.dbPool.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
    }
    // Microsoft SSO methods
    async setMicrosoftId(userId, microsoftId) {
        await client_1.dbPool.query('UPDATE users SET microsoft_id = $1, updated_at = NOW() WHERE id = $2', [microsoftId, userId]);
    }
    async findByMicrosoftId(microsoftId) {
        const result = await client_1.dbPool.query('SELECT * FROM users WHERE microsoft_id = $1 AND is_active = true AND deleted_at IS NULL', [microsoftId]);
        return result.rows[0] ? this.mapUser(result.rows[0]) : null;
    }
    // Password reset methods
    async createPasswordResetToken(userId) {
        const token = crypto_1.default.randomBytes(32).toString('hex');
        const tokenHash = crypto_1.default.createHash('sha256').update(token).digest('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        await client_1.dbPool.query(`INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`, [userId, tokenHash, expiresAt.toISOString()]);
        return token;
    }
    async findPasswordResetToken(token) {
        const tokenHash = crypto_1.default.createHash('sha256').update(token).digest('hex');
        const result = await client_1.dbPool.query(`SELECT user_id, expires_at FROM password_reset_tokens 
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`, [tokenHash]);
        if (!result.rows[0])
            return null;
        return {
            userId: result.rows[0].user_id,
            expiresAt: result.rows[0].expires_at,
        };
    }
    async markPasswordResetTokenUsed(token) {
        const tokenHash = crypto_1.default.createHash('sha256').update(token).digest('hex');
        await client_1.dbPool.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE token_hash = $1', [tokenHash]);
    }
    async updatePassword(userId, passwordHash) {
        await client_1.dbPool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [passwordHash, userId]);
    }
}
exports.UserRepository = UserRepository;
