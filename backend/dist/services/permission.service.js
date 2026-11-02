"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AVAILABLE_MODULES = void 0;
exports.hasPermission = hasPermission;
exports.listPermissions = listPermissions;
exports.grantPermission = grantPermission;
exports.revokePermission = revokePermission;
exports.listUserPermissions = listUserPermissions;
const client_1 = require("../db/client");
const ROLE_MODULE_DEFAULTS = {
    ceo: { '*': ['read', 'write', 'admin'] },
    farm_manager: { '*': ['read', 'write', 'admin'] },
    operation_manager: { '*': ['read', 'write'] },
    agronomist: { '*': ['read'], recipes: ['read'], inventory: ['read'] },
    worker: { '*': ['read'] },
};
async function hasPermission(userId, role, module, permission) {
    const defaults = ROLE_MODULE_DEFAULTS[role] || {};
    const wildcard = defaults['*'] || [];
    const moduleDefaults = defaults[module] || [];
    if (wildcard.includes(permission) || moduleDefaults.includes(permission)) {
        return true;
    }
    try {
        const result = await client_1.dbPool.query(`SELECT 1 FROM user_permissions
       WHERE user_id = $1 AND module = $2 AND permission = $3
       LIMIT 1`, [userId, module, permission]);
        return (result.rowCount ?? 0) > 0;
    }
    catch (err) {
        if (err.code === '42P01')
            return false;
        throw err;
    }
}
async function listPermissions(userId) {
    const result = await client_1.dbPool.query(`SELECT up.*, u.name AS granted_by_name
     FROM user_permissions up
     LEFT JOIN users u ON u.id = up.granted_by
     WHERE up.user_id = $1
     ORDER BY up.module, up.permission`, [userId]);
    return result.rows;
}
async function grantPermission(userId, module, permission, grantedBy) {
    const result = await client_1.dbPool.query(`INSERT INTO user_permissions (user_id, module, permission, granted_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, module, permission) DO NOTHING
     RETURNING *`, [userId, module, permission, grantedBy]);
    return result.rows[0];
}
async function revokePermission(id) {
    await client_1.dbPool.query('DELETE FROM user_permissions WHERE id = $1', [id]);
}
async function listUserPermissions(userId) {
    return listPermissions(userId);
}
exports.AVAILABLE_MODULES = [
    'recipes', 'inventory', 'fertigation', 'ecph', 'harvest',
    'ipm', 'tasks', 'shifts', 'manpower', 'weather',
    'gis', 'costs', 'reports', 'api_integrations',
];
