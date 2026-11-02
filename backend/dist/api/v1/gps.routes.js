"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.gpsRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const tenant_1 = require("../middleware/tenant");
const asyncHandler_1 = require("../../utils/asyncHandler");
const errors_1 = require("../../utils/errors");
const client_1 = require("../../db/client");
const gpsTracking_1 = require("../../utils/gpsTracking");
const gpsRouter = (0, express_1.Router)();
exports.gpsRouter = gpsRouter;
gpsRouter.use(auth_1.auth);
async function findOrgEquipment(orgId, lookup) {
    if (lookup.id) {
        const result = await client_1.dbPool.query(`SELECT id FROM equipment
       WHERE id = $1 AND organization_id = $2 AND is_active = true`, [lookup.id, orgId]);
        return result.rows[0] || null;
    }
    if (lookup.identifier) {
        const result = await client_1.dbPool.query(`SELECT id FROM equipment
       WHERE organization_id = $1 AND is_active = true
         AND LOWER(TRIM(identifier)) = LOWER($2)
       LIMIT 1`, [orgId, lookup.identifier]);
        return result.rows[0] || null;
    }
    return null;
}
/** GET /gps/equipment - list equipment */
gpsRouter.get('/equipment', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const orgId = (0, tenant_1.requireOrgId)(req);
    const result = await client_1.dbPool.query(`SELECT e.*,
      (SELECT json_build_object('latitude', gp.latitude, 'longitude', gp.longitude, 'speed', gp.speed, 'heading', gp.heading, 'recorded_at', gp.recorded_at)
       FROM gps_positions gp WHERE gp.equipment_id = e.id ORDER BY gp.recorded_at DESC LIMIT 1
      ) as last_position
     FROM equipment e
     WHERE e.is_active = true AND e.organization_id = $1
     ORDER BY e.name`, [orgId]);
    res.json({ success: true, data: result.rows });
}));
/** POST /gps/equipment - create equipment */
gpsRouter.post('/equipment', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const orgId = (0, tenant_1.requireOrgId)(req);
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const type = req.body?.type;
    const identifier = typeof req.body?.identifier === 'string' ? req.body.identifier.trim() : '';
    if (!name) {
        throw new errors_1.AppError('Name is required', 'VALIDATION_ERROR', 400);
    }
    if (!(0, gpsTracking_1.isEquipmentType)(type)) {
        throw new errors_1.AppError('Invalid equipment type', 'VALIDATION_ERROR', 400);
    }
    const result = await client_1.dbPool.query(`INSERT INTO equipment (name, type, identifier, organization_id)
     VALUES ($1, $2, $3, $4) RETURNING *`, [name, type, identifier || null, orgId]);
    res.status(201).json({ success: true, data: result.rows[0] });
}));
/** POST /gps/position - report GPS position (from device) */
gpsRouter.post('/position', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const orgId = (0, tenant_1.requireOrgId)(req);
    const lookup = (0, gpsTracking_1.resolveEquipmentLookup)(req.body || {});
    if (!lookup.id && !lookup.identifier) {
        throw new errors_1.AppError('equipment_id or identifier is required', 'VALIDATION_ERROR', 400);
    }
    const coords = (0, gpsTracking_1.parseLatLng)(req.body?.latitude, req.body?.longitude);
    if (!coords) {
        throw new errors_1.AppError('latitude and longitude must be valid coordinates', 'VALIDATION_ERROR', 400);
    }
    let speed;
    let heading;
    let recordedAt;
    try {
        speed = (0, gpsTracking_1.parseOptionalNumber)(req.body?.speed, 0, 9999);
        heading = (0, gpsTracking_1.parseOptionalNumber)(req.body?.heading, 0, 360);
        recordedAt = (0, gpsTracking_1.parseOptionalRecordedAt)(req.body?.recorded_at ?? req.body?.recordedAt);
    }
    catch (err) {
        throw new errors_1.AppError(err instanceof Error ? err.message : 'Invalid position fields', 'VALIDATION_ERROR', 400);
    }
    const equipment = await findOrgEquipment(orgId, lookup);
    if (!equipment) {
        throw new errors_1.AppError('Equipment not found', 'NOT_FOUND', 404);
    }
    const result = await client_1.dbPool.query(`INSERT INTO gps_positions (equipment_id, latitude, longitude, speed, heading, recorded_at)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6, NOW())) RETURNING *`, [equipment.id, coords.latitude, coords.longitude, speed ?? null, heading ?? null, recordedAt ?? null]);
    res.status(201).json({ success: true, data: result.rows[0] });
}));
/** GET /gps/positions/:equipmentId - history for equipment */
gpsRouter.get('/positions/:equipmentId', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const orgId = (0, tenant_1.requireOrgId)(req);
    if (!(0, gpsTracking_1.isUuid)(req.params.equipmentId)) {
        throw new errors_1.AppError('Invalid equipment id', 'VALIDATION_ERROR', 400);
    }
    const equipment = await findOrgEquipment(orgId, { id: req.params.equipmentId });
    if (!equipment) {
        throw new errors_1.AppError('Equipment not found', 'NOT_FOUND', 404);
    }
    const fromYmd = (0, gpsTracking_1.parseIsoDate)(req.query.from);
    const toYmd = (0, gpsTracking_1.parseIsoDate)(req.query.to) || fromYmd;
    if ((req.query.from && !fromYmd) || (req.query.to && !(0, gpsTracking_1.parseIsoDate)(req.query.to))) {
        throw new errors_1.AppError('from and to must be YYYY-MM-DD', 'VALIDATION_ERROR', 400);
    }
    if (fromYmd && toYmd && toYmd < fromYmd) {
        throw new errors_1.AppError('to must be on or after from', 'VALIDATION_ERROR', 400);
    }
    const requestedLimit = parseInt(String(req.query.limit ?? ''), 10);
    const limit = Math.min(Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : (fromYmd ? gpsTracking_1.GPS_POSITION_LIMIT : 200), gpsTracking_1.GPS_POSITION_LIMIT);
    let result;
    if (fromYmd && toYmd) {
        const { start, endExclusive } = (0, gpsTracking_1.dubaiRangeBounds)(fromYmd, toYmd);
        result = await client_1.dbPool.query(`SELECT * FROM gps_positions
       WHERE equipment_id = $1 AND recorded_at >= $2 AND recorded_at < $3
       ORDER BY recorded_at ASC
       LIMIT $4`, [equipment.id, start.toISOString(), endExclusive.toISOString(), limit]);
    }
    else {
        result = await client_1.dbPool.query(`SELECT * FROM (
         SELECT * FROM gps_positions
         WHERE equipment_id = $1
         ORDER BY recorded_at DESC
         LIMIT $2
       ) recent
       ORDER BY recorded_at ASC`, [equipment.id, limit]);
    }
    res.json({ success: true, data: result.rows });
}));
/** DELETE /gps/equipment/:id */
gpsRouter.delete('/equipment/:id', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const orgId = (0, tenant_1.requireOrgId)(req);
    if (!(0, gpsTracking_1.isUuid)(req.params.id)) {
        throw new errors_1.AppError('Invalid equipment id', 'VALIDATION_ERROR', 400);
    }
    const result = await client_1.dbPool.query('UPDATE equipment SET is_active = false WHERE id = $1 AND organization_id = $2 RETURNING id', [req.params.id, orgId]);
    if (!result.rows[0]) {
        throw new errors_1.AppError('Equipment not found', 'NOT_FOUND', 404);
    }
    res.json({ success: true });
}));
