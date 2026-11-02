"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stampOrgIfNullSql = stampOrgIfNullSql;
exports.stampOrgIfNull = stampOrgIfNull;
const client_1 = require("../db/client");
function stampOrgIfNullSql(table) {
    switch (table) {
        case 'countries':
            return `UPDATE countries SET organization_id = $2, updated_at = NOW() WHERE id = $1 AND organization_id IS NULL`;
        case 'sites':
            return `UPDATE sites SET organization_id = $2, updated_at = NOW() WHERE id = $1 AND organization_id IS NULL`;
        case 'fields':
            return `UPDATE fields SET organization_id = $2, updated_at = NOW() WHERE id = $1 AND organization_id IS NULL`;
        default: {
            const _exhaustive = table;
            throw new Error(`Unknown org stamp table: ${_exhaustive}`);
        }
    }
}
async function stampOrgIfNull(table, id, organizationId) {
    await client_1.dbPool.query(stampOrgIfNullSql(table), [id, organizationId]);
}
