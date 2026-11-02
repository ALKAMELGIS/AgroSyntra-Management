"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const validate_1 = require("../middleware/validate");
const auth_1 = require("../middleware/auth");
const tenant_1 = require("../middleware/tenant");
const client_1 = require("../../db/client");
const assignment_repository_1 = require("../../repositories/assignment.repository");
const errors_1 = require("../../utils/errors");
exports.syncRouter = (0, express_1.Router)();
const assignmentRepo = new assignment_repository_1.AssignmentRepository();
// All sync routes require authentication
exports.syncRouter.use(auth_1.auth);
// Schema for batch operations
const batchCreateSchema = zod_1.z.object({
    harvests: zod_1.z.array(zod_1.z.object({
        localId: zod_1.z.string(),
        field_id: zod_1.z.string().uuid(),
        harvest_date: zod_1.z.string(),
        quantity_kg: zod_1.z.number().positive(),
        quality_grade: zod_1.z.string().optional(),
        notes: zod_1.z.string().optional(),
    })).optional(),
    fertigations: zod_1.z.array(zod_1.z.object({
        localId: zod_1.z.string(),
        field_id: zod_1.z.string().uuid(),
        application_date: zod_1.z.string(),
        water_amount: zod_1.z.number().positive(),
        fertilizer_type: zod_1.z.string().optional(),
        fertilizer_amount: zod_1.z.number().optional(),
        notes: zod_1.z.string().optional(),
    })).optional(),
    ecphEntries: zod_1.z.array(zod_1.z.object({
        localId: zod_1.z.string(),
        field_id: zod_1.z.string().uuid(),
        measurement_date: zod_1.z.string(),
        ec_in: zod_1.z.number().optional(),
        ec_out: zod_1.z.number().optional(),
        ph_in: zod_1.z.number().optional(),
        ph_out: zod_1.z.number().optional(),
        drip_volume_ml: zod_1.z.number().optional(),
        notes: zod_1.z.string().optional(),
    })).optional(),
});
// Batch create endpoint for offline sync
exports.syncRouter.post('/batch', (0, validate_1.validate)({ body: batchCreateSchema }), async (req, res, next) => {
    const client = await client_1.dbPool.connect();
    const user = req.user;
    try {
        // Validate field access for non-CEO: workers can only sync data for their assigned fields
        if (user.role !== 'ceo') {
            const fieldIds = new Set();
            for (const h of req.body.harvests ?? [])
                fieldIds.add(h.field_id);
            for (const f of req.body.fertigations ?? [])
                fieldIds.add(f.field_id);
            for (const e of req.body.ecphEntries ?? [])
                fieldIds.add(e.field_id);
            for (const fieldId of fieldIds) {
                const canAccess = await assignmentRepo.canUserAccessField(user.userId, user.role, fieldId, (0, tenant_1.requireOrgId)(req));
                if (!canAccess)
                    throw new errors_1.AppError('You do not have access to one or more fields in this batch', 'FORBIDDEN', 403);
            }
        }
        await client.query('BEGIN');
        const results = {
            harvests: [],
            fertigations: [],
            ecphEntries: [],
        };
        // Process harvests
        if (req.body.harvests?.length) {
            for (const harvest of req.body.harvests) {
                const result = await client.query(`INSERT INTO harvests (field_id, harvest_date, quantity_kg, quality_grade, notes)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id`, [harvest.field_id, harvest.harvest_date, harvest.quantity_kg, harvest.quality_grade, harvest.notes]);
                results.harvests.push({ localId: harvest.localId, serverId: result.rows[0].id });
            }
        }
        // Process fertigations
        if (req.body.fertigations?.length) {
            for (const fert of req.body.fertigations) {
                const result = await client.query(`INSERT INTO fertigation_entries (field_id, date, daily_water, fertilizers)
             VALUES ($1, $2, $3, $4)
             RETURNING id`, [fert.field_id, fert.application_date || fert.date, fert.water_amount || fert.daily_water, fert.fertilizers ? JSON.stringify(fert.fertilizers) : null]);
                results.fertigations.push({ localId: fert.localId, serverId: result.rows[0].id });
            }
        }
        // Process EC/PH entries
        if (req.body.ecphEntries?.length) {
            for (const entry of req.body.ecphEntries) {
                const entryResult = await client.query(`INSERT INTO ecph_entries (field_id, date, time, qty_of_water)
             VALUES ($1, $2, $3, $4)
             RETURNING id`, [entry.field_id, entry.measurement_date || entry.date, entry.time || null, entry.qty_of_water || null]);
                const ecphId = entryResult.rows[0].id;
                // Insert valve reading with EC/PH values
                if (entry.ec_in != null || entry.ph_in != null) {
                    await client.query(`INSERT INTO ecph_valve_readings (ecph_entry_id, valve_number, ec_in, ec, ph_in, ph, drip_volume)
               VALUES ($1, 1, $2, $3, $4, $5, $6)`, [ecphId, entry.ec_in || null, entry.ec_out || null, entry.ph_in || null, entry.ph_out || null, entry.drip_volume_ml || null]);
                }
                results.ecphEntries.push({ localId: entry.localId, serverId: ecphId });
            }
        }
        await client.query('COMMIT');
        res.json({
            success: true,
            data: results,
        });
    }
    catch (error) {
        await client.query('ROLLBACK');
        next(error);
    }
    finally {
        client.release();
    }
});
// Get changes since a timestamp
const changesQuerySchema = zod_1.z.object({
    since: zod_1.z.string().optional(), // ISO timestamp
});
exports.syncRouter.get('/changes', (0, validate_1.validate)({ query: changesQuerySchema }), async (req, res, next) => {
    try {
        const since = req.query.since;
        const sinceDate = since ? new Date(since).toISOString() : new Date(0).toISOString();
        const user = req.user;
        const orgId = (0, tenant_1.requireOrgId)(req);
        // Non-CEO users only get data for their assigned sites/farm areas/fields
        let allowedFieldIds = null;
        let allowedFarmAreaIds = null;
        let allowedSiteIds = null;
        if (user.role !== 'ceo') {
            [allowedSiteIds, allowedFarmAreaIds, allowedFieldIds] = await Promise.all([
                assignmentRepo.getUserAccessibleSiteIds(user.userId, user.role, orgId),
                assignmentRepo.getUserAccessibleFarmAreaIds(user.userId, user.role, orgId),
                assignmentRepo.getUserAccessibleFieldIds(user.userId, user.role, orgId),
            ]);
        }
        const buildFieldFilter = (fieldIdCol, paramIdx) => allowedFieldIds === null ? '' : ` AND ${fieldIdCol} = ANY($${paramIdx}::uuid[])`;
        const orgFieldFilter = ' AND COALESCE({alias}.organization_id, f.organization_id) = $2';
        const harvestOrgFilter = orgFieldFilter.replace('{alias}', 'h');
        const fertOrgFilter = orgFieldFilter.replace('{alias}', 'fe');
        const ecphOrgFilter = orgFieldFilter.replace('{alias}', 'e');
        const harvestFieldFilter = buildFieldFilter('h.field_id', 3);
        const fertFieldFilter = buildFieldFilter('fe.field_id', 3);
        const ecphFieldFilter = buildFieldFilter('e.field_id', 3);
        const harvestParams = allowedFieldIds === null ? [sinceDate, orgId] : [sinceDate, orgId, allowedFieldIds];
        const fertParams = allowedFieldIds === null ? [sinceDate, orgId] : [sinceDate, orgId, allowedFieldIds];
        const ecphParams = allowedFieldIds === null ? [sinceDate, orgId] : [sinceDate, orgId, allowedFieldIds];
        const fieldsQuery = allowedFieldIds === null
            ? client_1.dbPool.query('SELECT * FROM fields WHERE (updated_at > $1 OR created_at > $1) AND organization_id = $2', [sinceDate, orgId])
            : client_1.dbPool.query('SELECT * FROM fields WHERE (updated_at > $1 OR created_at > $1) AND organization_id = $2 AND id = ANY($3::uuid[])', [sinceDate, orgId, allowedFieldIds]);
        const farmAreasQuery = allowedFarmAreaIds === null
            ? client_1.dbPool.query(`SELECT fa.* FROM farm_areas fa
             JOIN sites s ON s.id = fa.site_id
             WHERE (fa.updated_at > $1 OR fa.created_at > $1) AND s.organization_id = $2`, [sinceDate, orgId])
            : client_1.dbPool.query('SELECT * FROM farm_areas WHERE (updated_at > $1 OR created_at > $1) AND id = ANY($3::uuid[])', [sinceDate, orgId, allowedFarmAreaIds]);
        const sitesQuery = allowedSiteIds === null
            ? client_1.dbPool.query('SELECT * FROM sites WHERE (updated_at > $1 OR created_at > $1) AND organization_id = $2', [sinceDate, orgId])
            : client_1.dbPool.query('SELECT * FROM sites WHERE (updated_at > $1 OR created_at > $1) AND organization_id = $2 AND id = ANY($3::uuid[])', [sinceDate, orgId, allowedSiteIds]);
        const [harvests, fertigations, ecphEntries, fieldsResult, farmAreasResult, sitesResult, crops] = await Promise.all([
            client_1.dbPool.query(`SELECT h.*, f.name as field_name 
           FROM harvests h 
           LEFT JOIN fields f ON h.field_id = f.id 
           WHERE (h.updated_at > $1 OR h.created_at > $1)${harvestOrgFilter}${harvestFieldFilter}
           ORDER BY h.created_at DESC`, harvestParams),
            client_1.dbPool.query(`SELECT fe.*, f.name as field_name 
           FROM fertigation_entries fe 
           LEFT JOIN fields f ON fe.field_id = f.id 
           WHERE (fe.updated_at > $1 OR fe.created_at > $1)${fertOrgFilter}${fertFieldFilter}
           ORDER BY fe.created_at DESC`, fertParams),
            client_1.dbPool.query(`SELECT e.*, f.name as field_name 
           FROM ecph_entries e 
           LEFT JOIN fields f ON e.field_id = f.id 
           WHERE (e.updated_at > $1 OR e.created_at > $1)${ecphOrgFilter}${ecphFieldFilter}
           ORDER BY e.created_at DESC`, ecphParams),
            fieldsQuery,
            farmAreasQuery,
            sitesQuery,
            client_1.dbPool.query('SELECT * FROM crops WHERE updated_at > $1 OR created_at > $1', [sinceDate]),
        ]);
        res.json({
            success: true,
            data: {
                harvests: harvests.rows,
                fertigations: fertigations.rows,
                ecphEntries: ecphEntries.rows,
                fields: fieldsResult.rows,
                farmAreas: farmAreasResult.rows,
                sites: sitesResult.rows,
                crops: crops.rows,
                syncTimestamp: new Date().toISOString(),
            },
        });
    }
    catch (error) {
        next(error);
    }
});
