"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertFieldInOrganization = assertFieldInOrganization;
exports.assertSiteInOrganization = assertSiteInOrganization;
const client_1 = require("../db/client");
const errors_1 = require("./errors");
async function assertFieldInOrganization(fieldId, organizationId) {
    const result = await client_1.dbPool.query(`SELECT id FROM fields WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`, [fieldId, organizationId]);
    if (result.rows.length === 0) {
        throw new errors_1.AppError('Field not found in organization', 'FORBIDDEN', 403);
    }
}
async function assertSiteInOrganization(siteId, organizationId) {
    const result = await client_1.dbPool.query(`SELECT id FROM sites WHERE id = $1 AND organization_id = $2`, [siteId, organizationId]);
    if (result.rows.length === 0) {
        throw new errors_1.AppError('Site not found in organization', 'FORBIDDEN', 403);
    }
}
