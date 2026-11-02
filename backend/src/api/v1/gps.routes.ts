import { Router, Response } from 'express';
import { auth, authorize } from '../middleware/auth';
import { AuthRequest } from '../middleware/auth';
import { requireOrgId } from '../middleware/tenant';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/errors';
import { dbPool } from '../../db/client';
import {
  GPS_POSITION_LIMIT,
  dubaiRangeBounds,
  isEquipmentType,
  isUuid,
  parseIsoDate,
  parseLatLng,
  parseOptionalNumber,
  parseOptionalRecordedAt,
  resolveEquipmentLookup,
} from '../../utils/gpsTracking';

const gpsRouter = Router();
gpsRouter.use(auth);
/** Equipment and position writes: operations manager and worker only. */
export const requireGpsWriter = authorize('operation_manager', 'worker');

async function findOrgEquipment(
  orgId: string,
  lookup: { id?: string; identifier?: string },
): Promise<{ id: string } | null> {
  if (lookup.id) {
    const result = await dbPool.query(
      `SELECT id FROM equipment
       WHERE id = $1 AND organization_id = $2 AND is_active = true`,
      [lookup.id, orgId],
    );
    return result.rows[0] || null;
  }
  if (lookup.identifier) {
    const result = await dbPool.query(
      `SELECT id FROM equipment
       WHERE organization_id = $1 AND is_active = true
         AND LOWER(TRIM(identifier)) = LOWER($2)
       LIMIT 1`,
      [orgId, lookup.identifier],
    );
    return result.rows[0] || null;
  }
  return null;
}

/** GET /gps/equipment - list equipment */
gpsRouter.get('/equipment', asyncHandler(async (req: AuthRequest, res: Response) => {
  const orgId = requireOrgId(req);
  const result = await dbPool.query(
    `SELECT e.*,
      (SELECT json_build_object('latitude', gp.latitude, 'longitude', gp.longitude, 'speed', gp.speed, 'heading', gp.heading, 'recorded_at', gp.recorded_at)
       FROM gps_positions gp WHERE gp.equipment_id = e.id ORDER BY gp.recorded_at DESC LIMIT 1
      ) as last_position
     FROM equipment e
     WHERE e.is_active = true AND e.organization_id = $1
     ORDER BY e.name`,
    [orgId],
  );
  res.json({ success: true, data: result.rows });
}));

/** POST /gps/equipment - create equipment */
gpsRouter.post('/equipment', requireGpsWriter, asyncHandler(async (req: AuthRequest, res: Response) => {
  const orgId = requireOrgId(req);
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const type = req.body?.type;
  const identifier = typeof req.body?.identifier === 'string' ? req.body.identifier.trim() : '';
  if (!name) {
    throw new AppError('Name is required', 'VALIDATION_ERROR', 400);
  }
  if (!isEquipmentType(type)) {
    throw new AppError('Invalid equipment type', 'VALIDATION_ERROR', 400);
  }

  const result = await dbPool.query(
    `INSERT INTO equipment (name, type, identifier, organization_id)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [name, type, identifier || null, orgId],
  );
  res.status(201).json({ success: true, data: result.rows[0] });
}));

/** POST /gps/position - report GPS position (from device) */
gpsRouter.post('/position', requireGpsWriter, asyncHandler(async (req: AuthRequest, res: Response) => {
  const orgId = requireOrgId(req);
  const lookup = resolveEquipmentLookup(req.body || {});
  if (!lookup.id && !lookup.identifier) {
    throw new AppError('equipment_id or identifier is required', 'VALIDATION_ERROR', 400);
  }

  const coords = parseLatLng(req.body?.latitude, req.body?.longitude);
  if (!coords) {
    throw new AppError('latitude and longitude must be valid coordinates', 'VALIDATION_ERROR', 400);
  }

  let speed: number | undefined;
  let heading: number | undefined;
  let recordedAt: Date | undefined;
  try {
    speed = parseOptionalNumber(req.body?.speed, 0, 9999);
    heading = parseOptionalNumber(req.body?.heading, 0, 360);
    recordedAt = parseOptionalRecordedAt(req.body?.recorded_at ?? req.body?.recordedAt);
  } catch (err) {
    throw new AppError(err instanceof Error ? err.message : 'Invalid position fields', 'VALIDATION_ERROR', 400);
  }

  const equipment = await findOrgEquipment(orgId, lookup);
  if (!equipment) {
    throw new AppError('Equipment not found', 'NOT_FOUND', 404);
  }

  const result = await dbPool.query(
    `INSERT INTO gps_positions (equipment_id, latitude, longitude, speed, heading, recorded_at)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6, NOW())) RETURNING *`,
    [equipment.id, coords.latitude, coords.longitude, speed ?? null, heading ?? null, recordedAt ?? null],
  );
  res.status(201).json({ success: true, data: result.rows[0] });
}));

/** GET /gps/positions/:equipmentId - history for equipment */
gpsRouter.get('/positions/:equipmentId', asyncHandler(async (req: AuthRequest, res: Response) => {
  const orgId = requireOrgId(req);
  if (!isUuid(req.params.equipmentId)) {
    throw new AppError('Invalid equipment id', 'VALIDATION_ERROR', 400);
  }

  const equipment = await findOrgEquipment(orgId, { id: req.params.equipmentId });
  if (!equipment) {
    throw new AppError('Equipment not found', 'NOT_FOUND', 404);
  }

  const fromYmd = parseIsoDate(req.query.from);
  const toYmd = parseIsoDate(req.query.to) || fromYmd;
  if ((req.query.from && !fromYmd) || (req.query.to && !parseIsoDate(req.query.to))) {
    throw new AppError('from and to must be YYYY-MM-DD', 'VALIDATION_ERROR', 400);
  }
  if (fromYmd && toYmd && toYmd < fromYmd) {
    throw new AppError('to must be on or after from', 'VALIDATION_ERROR', 400);
  }

  const requestedLimit = parseInt(String(req.query.limit ?? ''), 10);
  const limit = Math.min(
    Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : (fromYmd ? GPS_POSITION_LIMIT : 200),
    GPS_POSITION_LIMIT,
  );

  let result;
  if (fromYmd && toYmd) {
    const { start, endExclusive } = dubaiRangeBounds(fromYmd, toYmd);
    result = await dbPool.query(
      `SELECT * FROM gps_positions
       WHERE equipment_id = $1 AND recorded_at >= $2 AND recorded_at < $3
       ORDER BY recorded_at ASC
       LIMIT $4`,
      [equipment.id, start.toISOString(), endExclusive.toISOString(), limit],
    );
  } else {
    result = await dbPool.query(
      `SELECT * FROM (
         SELECT * FROM gps_positions
         WHERE equipment_id = $1
         ORDER BY recorded_at DESC
         LIMIT $2
       ) recent
       ORDER BY recorded_at ASC`,
      [equipment.id, limit],
    );
  }

  res.json({ success: true, data: result.rows });
}));

/** DELETE /gps/equipment/:id */
gpsRouter.delete('/equipment/:id', requireGpsWriter, asyncHandler(async (req: AuthRequest, res: Response) => {
  const orgId = requireOrgId(req);
  if (!isUuid(req.params.id)) {
    throw new AppError('Invalid equipment id', 'VALIDATION_ERROR', 400);
  }
  const result = await dbPool.query(
    'UPDATE equipment SET is_active = false WHERE id = $1 AND organization_id = $2 RETURNING id',
    [req.params.id, orgId],
  );
  if (!result.rows[0]) {
    throw new AppError('Equipment not found', 'NOT_FOUND', 404);
  }
  res.json({ success: true });
}));

export { gpsRouter };
