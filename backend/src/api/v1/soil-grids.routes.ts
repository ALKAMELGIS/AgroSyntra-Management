import { Router } from 'express';
import { z } from 'zod';
import { AuthRequest, authorize } from '../middleware/auth';
import * as soil from '../../services/soilGrids.service';
import { AppError } from '../../utils/errors';
import { AssignmentRepository } from '../../repositories/assignment.repository';

/** Global soil maps (OpenLandMap): point profiles and stored field profiles. */
export const soilGridsRouter = Router();

soilGridsRouter.get('/datasets', (_req, res) => {
  res.json({ success: true, data: soil.datasetCatalog() });
});

const pointSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
  depths: z.string().optional(),
  datasets: z.string().optional(),
});

soilGridsRouter.get('/point', async (req: AuthRequest, res, next) => {
  try {
    const q = pointSchema.parse(req.query);
    // Inside an AgroCloud field the field type decides (open field / pivot only).
    const field = await soil.fieldAtPoint(req.user!.organizationId!, q.lon, q.lat).catch(() => null);
    if (field) {
      const applies = soil.soilApplies(field.type);
      if (!applies.allowed) throw new AppError(`${field.name}: ${applies.reason}`, 'NOT_APPLICABLE', 422);
    }
    const depths = q.depths ? q.depths.split(',').map(Number) : [0, 30, 60];
    const keys = q.datasets ? q.datasets.split(',') : undefined;
    res.json({ success: true, data: { ...(await soil.pointProfile(q.lon, q.lat, keys, depths)), field: field ? { name: field.name, type: field.type } : null } });
  } catch (e) { next(e); }
});

async function assertFieldAccess(req: AuthRequest, fieldId: string) {
  const user = req.user!;
  if (user.role === 'ceo') return;
  const repo = new AssignmentRepository();
  const sites: string[] = await repo.getUserAccessibleSiteIds(user.userId, user.role, user.organizationId!);
  const { dbPool } = await import('../../db/client');
  const { rows } = await dbPool.query(
    `SELECT fa.site_id FROM fields f JOIN farm_areas fa ON fa.id = f.farm_area_id WHERE f.id = $1`, [fieldId],
  );
  if (!rows[0] || !sites.includes(rows[0].site_id)) throw new AppError('Field not found', 'NOT_FOUND', 404);
}

soilGridsRouter.get('/fields/:fieldId', async (req: AuthRequest, res, next) => {
  try {
    const fieldId = z.string().uuid().parse(req.params.fieldId);
    await assertFieldAccess(req, fieldId);
    res.json({ success: true, data: await soil.storedFieldProfile(req.user!.organizationId!, fieldId) });
  } catch (e) { next(e); }
});

/** Sample the soil maps inside the field and store the result (managers). */
soilGridsRouter.post('/fields/:fieldId/refresh', authorize('ceo', 'farm_manager', 'operation_manager', 'agronomist'), async (req: AuthRequest, res, next) => {
  try {
    const fieldId = z.string().uuid().parse(req.params.fieldId);
    await assertFieldAccess(req, fieldId);
    res.json({ success: true, data: await soil.refreshFieldProfile(req.user!.organizationId!, fieldId) });
  } catch (e) { next(e); }
});
