"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isFeatureEnabled = isFeatureEnabled;
exports.listFlags = listFlags;
exports.updateFlag = updateFlag;
exports.createFlag = createFlag;
exports.deleteFlag = deleteFlag;
const client_1 = require("../db/client");
const logger_1 = require("../utils/logger");
let cache = new Map();
let cacheExpiry = 0;
const CACHE_TTL_MS = 60_000;
async function refreshCache() {
    if (Date.now() < cacheExpiry)
        return;
    try {
        const result = await client_1.dbPool.query('SELECT * FROM feature_flags');
        cache = new Map(result.rows.map((r) => [r.key, r]));
        cacheExpiry = Date.now() + CACHE_TTL_MS;
    }
    catch (err) {
        if (err.code === '42P01') {
            cache = new Map();
            cacheExpiry = Date.now() + CACHE_TTL_MS;
            return;
        }
        logger_1.logger.error({ err: err.message }, 'Failed to refresh feature flag cache');
    }
}
async function isFeatureEnabled(key, userRole) {
    await refreshCache();
    const flag = cache.get(key);
    if (!flag)
        return true;
    if (!flag.enabled)
        return false;
    if (flag.roles && flag.roles.length > 0 && userRole) {
        return flag.roles.includes(userRole);
    }
    return true;
}
async function listFlags() {
    const result = await client_1.dbPool.query('SELECT * FROM feature_flags ORDER BY key');
    return result.rows;
}
async function updateFlag(id, data) {
    const sets = [];
    const vals = [];
    let p = 1;
    if (data.enabled !== undefined) {
        sets.push(`enabled = $${p++}`);
        vals.push(data.enabled);
    }
    if (data.description !== undefined) {
        sets.push(`description = $${p++}`);
        vals.push(data.description);
    }
    if (data.roles !== undefined) {
        sets.push(`roles = $${p++}`);
        vals.push(data.roles);
    }
    sets.push(`updated_at = NOW()`);
    vals.push(id);
    const result = await client_1.dbPool.query(`UPDATE feature_flags SET ${sets.join(', ')} WHERE id = $${p} RETURNING *`, vals);
    cacheExpiry = 0;
    return result.rows[0];
}
async function createFlag(key, description, enabled = false) {
    const result = await client_1.dbPool.query(`INSERT INTO feature_flags (key, description, enabled) VALUES ($1, $2, $3) RETURNING *`, [key, description, enabled]);
    cacheExpiry = 0;
    return result.rows[0];
}
async function deleteFlag(id) {
    await client_1.dbPool.query('DELETE FROM feature_flags WHERE id = $1', [id]);
    cacheExpiry = 0;
}
