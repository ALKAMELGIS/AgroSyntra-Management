"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listGroups = listGroups;
exports.createGroup = createGroup;
exports.updateGroup = updateGroup;
exports.deleteGroup = deleteGroup;
const client_1 = require("../db/client");
const errors_1 = require("../utils/errors");
function mapGroup(row) {
    return {
        id: row.id,
        organizationId: row.organization_id,
        siteId: row.site_id,
        name: row.name,
        fieldIds: row.field_ids || [],
        defaultRecipeId: row.default_recipe_id ?? null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
async function assertFieldsBelongToSite(siteId, fieldIds, organizationId) {
    if (!fieldIds.length) {
        throw new errors_1.AppError('At least one field is required', 'VALIDATION_ERROR', 400);
    }
    const result = await client_1.dbPool.query(`SELECT f.id
     FROM fields f
     JOIN farm_areas fa ON fa.id = f.farm_area_id
     JOIN sites s ON s.id = fa.site_id
     WHERE fa.site_id = $1
       AND f.deleted_at IS NULL
       AND f.id = ANY($2::uuid[])
       AND COALESCE(f.organization_id, s.organization_id) = $3`, [siteId, fieldIds, organizationId]);
    if (result.rowCount !== fieldIds.length) {
        throw new errors_1.AppError('One or more fields do not belong to this site', 'VALIDATION_ERROR', 400);
    }
}
async function listGroups(siteId, organizationId) {
    const result = await client_1.dbPool.query(`SELECT *
     FROM fertigation_field_groups
     WHERE site_id = $1 AND organization_id = $2
     ORDER BY name ASC`, [siteId, organizationId]);
    return result.rows.map(mapGroup);
}
async function createGroup(input) {
    const name = input.name.trim();
    if (!name)
        throw new errors_1.AppError('Group name is required', 'VALIDATION_ERROR', 400);
    await assertFieldsBelongToSite(input.siteId, input.fieldIds, input.organizationId);
    const result = await client_1.dbPool.query(`INSERT INTO fertigation_field_groups
       (organization_id, site_id, name, field_ids, default_recipe_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`, [input.organizationId, input.siteId, name, input.fieldIds, input.defaultRecipeId ?? null]);
    return mapGroup(result.rows[0]);
}
async function updateGroup(id, organizationId, input) {
    const existing = await client_1.dbPool.query(`SELECT * FROM fertigation_field_groups WHERE id = $1 AND organization_id = $2`, [id, organizationId]);
    if (!existing.rowCount)
        throw new errors_1.NotFoundError('Field group not found');
    const current = mapGroup(existing.rows[0]);
    const name = input.name !== undefined ? input.name.trim() : current.name;
    const fieldIds = input.fieldIds ?? current.fieldIds;
    const defaultRecipeId = input.defaultRecipeId !== undefined ? input.defaultRecipeId : current.defaultRecipeId;
    if (!name)
        throw new errors_1.AppError('Group name is required', 'VALIDATION_ERROR', 400);
    await assertFieldsBelongToSite(current.siteId, fieldIds, organizationId);
    const result = await client_1.dbPool.query(`UPDATE fertigation_field_groups
     SET name = $1, field_ids = $2, default_recipe_id = $3, updated_at = NOW()
     WHERE id = $4 AND organization_id = $5
     RETURNING *`, [name, fieldIds, defaultRecipeId ?? null, id, organizationId]);
    return mapGroup(result.rows[0]);
}
async function deleteGroup(id, organizationId) {
    const result = await client_1.dbPool.query(`DELETE FROM fertigation_field_groups WHERE id = $1 AND organization_id = $2`, [id, organizationId]);
    if (!result.rowCount)
        throw new errors_1.NotFoundError('Field group not found');
}
