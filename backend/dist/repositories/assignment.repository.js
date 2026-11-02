"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssignmentRepository = void 0;
const client_1 = require("../db/client");
class AssignmentRepository {
    // ============ Site Assignments ============
    async assignUserToSite(userId, siteId, assignedBy) {
        const result = await client_1.dbPool.query(`INSERT INTO user_site_assignments (user_id, site_id, assigned_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, site_id) DO NOTHING
       RETURNING *`, [userId, siteId, assignedBy]);
        return this.mapSiteAssignment(result.rows[0]);
    }
    async removeUserFromSite(userId, siteId) {
        await client_1.dbPool.query('DELETE FROM user_site_assignments WHERE user_id = $1 AND site_id = $2', [userId, siteId]);
    }
    async getUserSiteAssignments(userId) {
        const result = await client_1.dbPool.query(`SELECT usa.*, s.name as site_name
       FROM user_site_assignments usa
       JOIN sites s ON usa.site_id = s.id
       WHERE usa.user_id = $1`, [userId]);
        return result.rows.map(this.mapSiteAssignment);
    }
    async getSiteUsers(siteId) {
        const result = await client_1.dbPool.query(`SELECT usa.*, u.name as user_name, u.email as user_email, u.role as user_role
       FROM user_site_assignments usa
       JOIN users u ON usa.user_id = u.id
       WHERE usa.site_id = $1
       ORDER BY u.name`, [siteId]);
        return result.rows.map(this.mapSiteAssignment);
    }
    async getUserAccessibleSiteIds(userId, role, organizationId) {
        if (role === 'ceo') {
            const result = await client_1.dbPool.query('SELECT id FROM sites WHERE organization_id = $1 AND deleted_at IS NULL', [organizationId]);
            return result.rows.map(r => r.id);
        }
        const result = await client_1.dbPool.query(`SELECT usa.site_id
       FROM user_site_assignments usa
       JOIN sites s ON s.id = usa.site_id
       WHERE usa.user_id = $1 AND s.organization_id = $2 AND s.deleted_at IS NULL`, [userId, organizationId]);
        return result.rows.map(r => r.site_id);
    }
    // ============ Farm Area Assignments ============
    async assignUserToFarmArea(userId, farmAreaId, assignedBy) {
        const result = await client_1.dbPool.query(`INSERT INTO user_farm_area_assignments (user_id, farm_area_id, assigned_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, farm_area_id) DO NOTHING
       RETURNING *`, [userId, farmAreaId, assignedBy]);
        return this.mapFarmAreaAssignment(result.rows[0]);
    }
    async removeUserFromFarmArea(userId, farmAreaId) {
        await client_1.dbPool.query('DELETE FROM user_farm_area_assignments WHERE user_id = $1 AND farm_area_id = $2', [userId, farmAreaId]);
    }
    async getUserFarmAreaAssignments(userId) {
        const result = await client_1.dbPool.query(`SELECT ufa.*, fa.name as farm_area_name, s.name as site_name
       FROM user_farm_area_assignments ufa
       JOIN farm_areas fa ON ufa.farm_area_id = fa.id
       JOIN sites s ON fa.site_id = s.id
       WHERE ufa.user_id = $1`, [userId]);
        return result.rows.map(this.mapFarmAreaAssignment);
    }
    async getUserAccessibleFarmAreaIds(userId, role, organizationId) {
        if (role === 'ceo') {
            const result = await client_1.dbPool.query(`SELECT fa.id FROM farm_areas fa
         JOIN sites s ON s.id = fa.site_id
         WHERE s.organization_id = $1 AND fa.deleted_at IS NULL AND s.deleted_at IS NULL`, [organizationId]);
            return result.rows.map(r => r.id);
        }
        if (role === 'farm_manager' || role === 'operation_manager') {
            const result = await client_1.dbPool.query(`SELECT DISTINCT fa.id
         FROM farm_areas fa
         JOIN sites s ON s.id = fa.site_id
         JOIN user_site_assignments usa ON usa.site_id = fa.site_id
         WHERE usa.user_id = $1 AND s.organization_id = $2
         UNION
         SELECT ufa.farm_area_id FROM user_farm_area_assignments ufa
         JOIN farm_areas fa2 ON fa2.id = ufa.farm_area_id
         JOIN sites s2 ON s2.id = fa2.site_id
         WHERE ufa.user_id = $1 AND s2.organization_id = $2`, [userId, organizationId]);
            return result.rows.map(r => r.id);
        }
        const result = await client_1.dbPool.query(`SELECT DISTINCT fa.id
         FROM farm_areas fa
         JOIN sites s ON s.id = fa.site_id
         JOIN user_site_assignments usa ON usa.site_id = fa.site_id
         WHERE usa.user_id = $1 AND s.organization_id = $2
       UNION
       SELECT ufa.farm_area_id FROM user_farm_area_assignments ufa
       JOIN farm_areas fa2 ON fa2.id = ufa.farm_area_id
       JOIN sites s2 ON s2.id = fa2.site_id
       WHERE ufa.user_id = $1 AND s2.organization_id = $2`, [userId, organizationId]);
        return result.rows.map(r => r.id);
    }
    // ============ Field Assignments ============
    async assignUserToField(userId, fieldId, assignedBy) {
        const result = await client_1.dbPool.query(`INSERT INTO user_field_assignments (user_id, field_id, assigned_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, field_id) DO NOTHING
       RETURNING *`, [userId, fieldId, assignedBy]);
        return this.mapFieldAssignment(result.rows[0]);
    }
    async removeUserFromField(userId, fieldId) {
        await client_1.dbPool.query('DELETE FROM user_field_assignments WHERE user_id = $1 AND field_id = $2', [userId, fieldId]);
    }
    async getUserFieldAssignments(userId) {
        const result = await client_1.dbPool.query(`SELECT uff.*, f.name as field_name, fa.name as farm_area_name
       FROM user_field_assignments uff
       JOIN fields f ON uff.field_id = f.id
       JOIN farm_areas fa ON f.farm_area_id = fa.id
       WHERE uff.user_id = $1`, [userId]);
        return result.rows.map(this.mapFieldAssignment);
    }
    async getUserAccessibleFieldIds(userId, role, organizationId) {
        if (role === 'ceo') {
            const result = await client_1.dbPool.query('SELECT id FROM fields WHERE organization_id = $1 AND deleted_at IS NULL', [organizationId]);
            return result.rows.map(r => r.id);
        }
        if (role === 'farm_manager' || role === 'operation_manager') {
            const result = await client_1.dbPool.query(`SELECT DISTINCT f.id
         FROM fields f
         JOIN farm_areas fa ON f.farm_area_id = fa.id
         JOIN sites s ON fa.site_id = s.id
         JOIN user_site_assignments usa ON usa.site_id = fa.site_id
         WHERE usa.user_id = $1 AND s.organization_id = $2
         UNION
         SELECT f.id FROM fields f
         JOIN user_farm_area_assignments ufa ON ufa.farm_area_id = f.farm_area_id
         JOIN farm_areas fa2 ON fa2.id = f.farm_area_id
         JOIN sites s2 ON fa2.site_id = s2.id
         WHERE ufa.user_id = $1 AND s2.organization_id = $2
         UNION
         SELECT uff.field_id FROM user_field_assignments uff
         JOIN fields f2 ON f2.id = uff.field_id
         WHERE uff.user_id = $1 AND f2.organization_id = $2`, [userId, organizationId]);
            return result.rows.map(r => r.id);
        }
        const result = await client_1.dbPool.query(`SELECT DISTINCT f.id
         FROM fields f
         JOIN farm_areas fa ON f.farm_area_id = fa.id
         JOIN sites s ON fa.site_id = s.id
         JOIN user_site_assignments usa ON usa.site_id = fa.site_id
         WHERE usa.user_id = $1 AND s.organization_id = $2
       UNION
       SELECT DISTINCT f.id FROM fields f
         JOIN user_farm_area_assignments ufa ON ufa.farm_area_id = f.farm_area_id
         JOIN farm_areas fa2 ON fa2.id = f.farm_area_id
         JOIN sites s2 ON fa2.site_id = s2.id
         WHERE ufa.user_id = $1 AND s2.organization_id = $2
       UNION
       SELECT uff.field_id FROM user_field_assignments uff
       JOIN fields f2 ON f2.id = uff.field_id
       WHERE uff.user_id = $1 AND f2.organization_id = $2`, [userId, organizationId]);
        return result.rows.map(r => r.id);
    }
    // ============ Check Access ============
    async canUserAccessSite(userId, role, siteId, organizationId) {
        if (role === 'ceo') {
            const result = await client_1.dbPool.query('SELECT 1 FROM sites WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL', [siteId, organizationId]);
            return result.rows.length > 0;
        }
        const result = await client_1.dbPool.query(`SELECT 1 FROM user_site_assignments usa
       JOIN sites s ON s.id = usa.site_id
       WHERE usa.user_id = $1 AND usa.site_id = $2 AND s.organization_id = $3`, [userId, siteId, organizationId]);
        return result.rows.length > 0;
    }
    async canUserAccessFarmArea(userId, role, farmAreaId, organizationId) {
        if (role === 'ceo') {
            const result = await client_1.dbPool.query(`SELECT 1 FROM farm_areas fa
         JOIN sites s ON s.id = fa.site_id
         WHERE fa.id = $1 AND s.organization_id = $2`, [farmAreaId, organizationId]);
            return result.rows.length > 0;
        }
        const directResult = await client_1.dbPool.query(`SELECT 1 FROM user_farm_area_assignments ufa
       JOIN farm_areas fa ON fa.id = ufa.farm_area_id
       JOIN sites s ON s.id = fa.site_id
       WHERE ufa.user_id = $1 AND ufa.farm_area_id = $2 AND s.organization_id = $3`, [userId, farmAreaId, organizationId]);
        if (directResult.rows.length > 0)
            return true;
        const siteResult = await client_1.dbPool.query(`SELECT 1 FROM user_site_assignments usa
       JOIN farm_areas fa ON fa.site_id = usa.site_id
       JOIN sites s ON s.id = fa.site_id
       WHERE usa.user_id = $1 AND fa.id = $2 AND s.organization_id = $3`, [userId, farmAreaId, organizationId]);
        return siteResult.rows.length > 0;
    }
    async canUserAccessField(userId, role, fieldId, organizationId) {
        if (role === 'ceo') {
            const result = await client_1.dbPool.query('SELECT 1 FROM fields WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL', [fieldId, organizationId]);
            return result.rows.length > 0;
        }
        const fieldResult = await client_1.dbPool.query(`SELECT 1 FROM user_field_assignments uff
       JOIN fields f ON f.id = uff.field_id
       WHERE uff.user_id = $1 AND uff.field_id = $2 AND f.organization_id = $3`, [userId, fieldId, organizationId]);
        if (fieldResult.rows.length > 0)
            return true;
        const farmAreaResult = await client_1.dbPool.query(`SELECT 1 FROM user_farm_area_assignments ufa
       JOIN fields f ON f.farm_area_id = ufa.farm_area_id
       WHERE ufa.user_id = $1 AND f.id = $2 AND f.organization_id = $3`, [userId, fieldId, organizationId]);
        if (farmAreaResult.rows.length > 0)
            return true;
        const siteResult = await client_1.dbPool.query(`SELECT 1 FROM user_site_assignments usa
       JOIN farm_areas fa ON fa.site_id = usa.site_id
       JOIN fields f ON f.farm_area_id = fa.id
       JOIN sites s ON s.id = fa.site_id
       WHERE usa.user_id = $1 AND f.id = $2 AND f.organization_id = $3`, [userId, fieldId, organizationId]);
        return siteResult.rows.length > 0;
    }
    // ============ Mappers ============
    mapSiteAssignment(row) {
        if (!row)
            return row;
        return {
            id: row.id,
            userId: row.user_id,
            siteId: row.site_id,
            assignedBy: row.assigned_by,
            createdAt: row.created_at,
            userName: row.user_name,
            userEmail: row.user_email,
            userRole: row.user_role,
            siteName: row.site_name,
        };
    }
    mapFarmAreaAssignment(row) {
        if (!row)
            return row;
        return {
            id: row.id,
            userId: row.user_id,
            farmAreaId: row.farm_area_id,
            assignedBy: row.assigned_by,
            createdAt: row.created_at,
            userName: row.user_name,
            farmAreaName: row.farm_area_name,
            siteName: row.site_name,
        };
    }
    mapFieldAssignment(row) {
        if (!row)
            return row;
        return {
            id: row.id,
            userId: row.user_id,
            fieldId: row.field_id,
            assignedBy: row.assigned_by,
            createdAt: row.created_at,
            userName: row.user_name,
            fieldName: row.field_name,
            farmAreaName: row.farm_area_name,
        };
    }
}
exports.AssignmentRepository = AssignmentRepository;
