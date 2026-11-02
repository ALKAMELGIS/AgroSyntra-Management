import { Router } from 'express';
import { z } from 'zod';
import { FieldService } from '../../services/field.service';
import { ValveService } from '../../services/valve.service';
import { AssignmentRepository } from '../../repositories/assignment.repository';
import { validate } from '../middleware/validate';
import { AuthRequest, authorize } from '../middleware/auth';
import { requireOrgId } from '../middleware/tenant';
import { NotFoundError } from '../../utils/errors';
import { buildPaginationMeta, normalizePagination } from '../../utils/pagination';
import { getFieldSummary, getPhiStatusBatch } from '../../services/fieldSummary.service';
import { logAuditEvent } from '../../services/auditLog.service';
import { dbPool } from '../../db/client';
import { AppError } from '../../utils/errors';
import { assertCanOperateDataEntry } from '../../utils/roleAccess';
import { assertFieldDateNotClosed } from '../../services/seasons.service';

export const fieldsRouter = Router();
const service = new FieldService();
const valveService = new ValveService();
const assignmentRepo = new AssignmentRepository();

const idSchema = z.object({ id: z.string().uuid() });
const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  farm_area_id: z.string().uuid().optional(),
  site_id: z.string().uuid().optional(),
});
const polygonSchema = z.array(z.tuple([z.number(), z.number()])).min(3);
const createSchema = z.object({
  farmAreaId: z.string().uuid(),
  fieldTypeId: z.string().uuid().optional(),
  name: z.string().min(1),
  currentCropId: z.string().uuid().optional(),
  varietyId: z.string().uuid().optional().nullable(),
  valveCount: z.number().int().nonnegative().optional(),
  area: z.number().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  polygon: polygonSchema.optional(),
});
const updateSchema = z.object({
  farmAreaId: z.string().uuid().optional(),
  fieldTypeId: z.string().uuid().optional(),
  name: z.string().min(1).optional(),
  currentCropId: z.string().uuid().optional(),
  varietyId: z.string().uuid().optional().nullable(),
  valveCount: z.number().int().nonnegative().optional(),
  area: z.number().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  polygon: z.union([polygonSchema, z.array(z.any()).max(0)]).optional(),
});
const changeCropSchema = z.object({
  cropId: z.string().uuid(),
  varietyId: z.string().uuid().optional().nullable(),
  startDate: z.string().min(1),
});
const addHistorySchema = z.object({
  cropId: z.string().uuid(),
  startDate: z.string().min(1),
  endDate: z.string().optional().nullable(),
});
const CROP_CHANGE_ELSEWHERE = 'Change crops in Crop History → Crop Rotation (workers and agronomists only)';

/**
 * Add, edit, rename and delete fields, including valve counts and valve lists:
 * the operation manager and the data entry worker. The farm manager (no data
 * entry) and the CEO only watch.
 */
const FIELD_EDITOR_ROLES = ['operation_manager', 'worker'] as const;
const authorizeFieldEditors = authorize(...FIELD_EDITOR_ROLES);

/** The field must be in the caller's organization and sites; otherwise it does not exist for them. */
async function assertCanAccessField(req: AuthRequest, fieldId: string): Promise<void> {
  const user = req.user!;
  const canAccess = await assignmentRepo.canUserAccessField(user.userId, user.role, fieldId, requireOrgId(req));
  if (!canAccess) throw new NotFoundError('Field not found');
}

/** A field can only be created in (or moved to) a farm area the caller can reach. */
async function assertCanUseFarmArea(req: AuthRequest, farmAreaId: string): Promise<void> {
  const user = req.user!;
  const canAccess = await assignmentRepo.canUserAccessFarmArea(user.userId, user.role, farmAreaId, requireOrgId(req));
  if (!canAccess) throw new NotFoundError('Farm area not found');
}

/**
 * Crop changes follow the Crop Rotation rule: only workers and agronomists,
 * on fields in their organization.
 */
async function assertCanChangeFieldCrop(req: AuthRequest, fieldId: string): Promise<void> {
  const user = req.user!;
  assertCanOperateDataEntry(user);
  const canAccess = await assignmentRepo.canUserAccessField(user.userId, user.role, fieldId, requireOrgId(req));
  if (!canAccess) throw new NotFoundError('Field not found');
}

const valveSchema = z.object({
  number: z.coerce.number().int().positive(),
  name: z.string().optional(),
});
const valvesSchema = z.object({
  valves: z.array(valveSchema),
});

/**
 * GET /fields/gis-orphans
 *
 * Returns fields that are linked to a GIS external id (`gis_external_id`)
 * whose corresponding feature has disappeared from every currently-known
 * GIS layer. These are "orphaned" — the polygon they used to reference
 * has been deleted or renamed on the ArcGIS side, and any map-based view
 * won't find them.
 *
 * Why this matters: we match fields by stable external id to survive
 * renames on the GIS source. But if the feature is deleted on the ArcGIS
 * side, the field silently loses its polygon. This endpoint surfaces that
 * state so an operator can either:
 *   a) re-sync from a newer layer that still has the polygon, or
 *   b) decide the field really is retired and soft-delete it.
 *
 * The endpoint does NOT mutate — it's a read-only diagnostic. We don't
 * auto-unlink or auto-delete; the operator has to decide.
 */
fieldsRouter.get('/gis-orphans', async (req: AuthRequest, res, next) => {
  try {
    const user = req.user!;
    const orgId = requireOrgId(req);

    const q = `
      SELECT f.id,
             f.name,
             f.gis_external_id,
             fa.name AS farm_area_name,
             s.name  AS site_name,
             c.name  AS zone_name,
             f.updated_at
        FROM fields f
        JOIN farm_areas fa ON fa.id = f.farm_area_id
        JOIN sites      s  ON s.id  = fa.site_id
        JOIN countries  c  ON c.id  = s.country_id
       WHERE f.deleted_at IS NULL
         AND f.organization_id = $1
         AND s.organization_id = $1
         AND f.gis_external_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1
             FROM gis_features gf
            WHERE gf.external_id = f.gis_external_id
         )
       ORDER BY c.name, s.name, fa.name, f.name`;
    const result = await dbPool.query(q, [orgId]);
    let rows: any[] = result.rows;

    if (user.role !== 'ceo') {
      const accessibleIds = await assignmentRepo.getUserAccessibleFieldIds(user.userId, user.role, orgId);
      const idSet = new Set(accessibleIds);
      rows = rows.filter((r) => idSet.has(r.id));
    }

    res.json({ success: true, data: rows });
  } catch (err) {
    // If gis_features doesn't exist yet (fresh install, no layer synced)
    // just return an empty list — there are no orphans by definition.
    if ((err as any)?.code === '42P01') {
      return res.json({ success: true, data: [] });
    }
    next(err);
  }
});

fieldsRouter.get('/phi-status', async (req: AuthRequest, res, next) => {
  try {
    const orgId = requireOrgId(req);
    let data = await getPhiStatusBatch(orgId);
    const user = req.user!;
    if (user.role !== 'ceo') {
      const accessibleIds = await assignmentRepo.getUserAccessibleFieldIds(user.userId, user.role, orgId);
      const idSet = new Set(accessibleIds);
      data = data.filter((item) => idSet.has(item.fieldId));
    }
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

fieldsRouter.get(
  '/',
  validate({ query: listQuerySchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const { page, limit, farm_area_id, site_id } = req.query as {
        page?: number;
        limit?: number;
        farm_area_id?: string;
        site_id?: string;
      };
      const user = req.user!;
      const orgId = requireOrgId(req);
      let result;
      if (user.role === 'ceo') {
        result = await service.list({ page, limit, farmAreaId: farm_area_id, siteId: site_id, organizationId: orgId });
      } else {
        const fieldIds = await assignmentRepo.getUserAccessibleFieldIds(user.userId, user.role, orgId);
        if (fieldIds.length === 0) {
          const { page: p, limit: l } = normalizePagination({ page, limit });
          result = { items: [], meta: buildPaginationMeta(0, p, l) };
        } else {
          result = await service.list({ page, limit, farmAreaId: farm_area_id, fieldIds, siteId: site_id });
        }
      }
      res.json({ success: true, data: result.items, meta: result.meta });
    } catch (error) {
      next(error);
    }
  }
);

fieldsRouter.get('/:id', validate({ params: idSchema }), async (req: AuthRequest, res, next) => {
  try {
    const field = await service.getById(req.params.id);
    const user = req.user!;
    const canAccess = await assignmentRepo.canUserAccessField(user.userId, user.role, field.id, requireOrgId(req));
    if (!canAccess) throw new NotFoundError('Field not found');
    res.json({ success: true, data: field });
  } catch (error) {
    next(error);
  }
});

fieldsRouter.post('/', authorizeFieldEditors, validate({ body: createSchema }), async (req: AuthRequest, res, next) => {
  try {
    const body = req.body as { farmAreaId: string };
    await assertCanUseFarmArea(req, body.farmAreaId);
    const field = await service.create({ ...req.body, organizationId: requireOrgId(req) });
    res.status(201).json({ success: true, data: field });
  } catch (error) {
    next(error);
  }
});

fieldsRouter.put(
  '/:id',
  authorizeFieldEditors,
  validate({ params: idSchema, body: updateSchema }),
  async (req: AuthRequest, res, next) => {
    try {
      await assertCanAccessField(req, req.params.id);
      const body = req.body as {
        farmAreaId?: string;
        currentCropId?: string;
        varietyId?: string | null;
      };
      if (body.currentCropId !== undefined || body.varietyId !== undefined) {
        const current = await service.getById(req.params.id);
        // Nobody changes the crop or variety here: that goes through Crop Rotation,
        // which checks the site and closed seasons. Resending unchanged values is fine.
        const cropChanged = body.currentCropId !== undefined
          && body.currentCropId !== (current.currentCropId ?? undefined);
        const varietyChanged = body.varietyId !== undefined
          && (body.varietyId ?? null) !== (current.varietyId ?? null);
        if (cropChanged || varietyChanged) {
          throw new AppError(CROP_CHANGE_ELSEWHERE, 'FORBIDDEN', 403);
        }
      }
      if (body.farmAreaId !== undefined) {
        await assertCanUseFarmArea(req, body.farmAreaId);
      }
      const field = await service.update(req.params.id, req.body);
      res.json({ success: true, data: field });
    } catch (error) {
      next(error);
    }
  }
);

fieldsRouter.delete('/:id', authorizeFieldEditors, validate({ params: idSchema }), async (req: AuthRequest, res, next) => {
  try {
    await assertCanAccessField(req, req.params.id);
    // Capture a snapshot of the field before deletion so the audit log
    // remains useful once the row is gone.
    let snapshot: any = null;
    try {
      snapshot = await service.getById(req.params.id);
    } catch { /* non-fatal */ }

    await service.remove(req.params.id);

    await logAuditEvent({
      userId: req.user!.userId,
      action: 'DELETE',
      entity: 'field',
      entityId: req.params.id,
      changes: snapshot
        ? { name: snapshot.name, farmAreaId: snapshot.farmAreaId ?? snapshot.farm_area_id }
        : undefined,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    next(error);
  }
});

fieldsRouter.put(
  '/:id/crop',
  validate({ params: idSchema, body: changeCropSchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const { cropId, startDate, varietyId } = req.body as { cropId: string; startDate: string; varietyId?: string | null };
      await assertCanChangeFieldCrop(req, req.params.id);
      await assertFieldDateNotClosed(req.params.id, startDate);
      const field = await service.changeCrop(req.params.id, cropId, startDate, varietyId);
      res.json({ success: true, data: field });
    } catch (error) {
      next(error);
    }
  }
);

fieldsRouter.get(
  '/:id/crop-history',
  validate({ params: idSchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const user = req.user!;
      const canAccess = await assignmentRepo.canUserAccessField(user.userId, user.role, req.params.id, requireOrgId(req));
      if (!canAccess) throw new NotFoundError('Field not found');
      const history = await service.getCropHistory(req.params.id);
      res.json({ success: true, data: history });
    } catch (error) {
      next(error);
    }
  }
);

fieldsRouter.post(
  '/:id/crop-history',
  validate({ params: idSchema, body: addHistorySchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const { cropId, startDate, endDate } = req.body as {
        cropId: string;
        startDate: string;
        endDate?: string | null;
      };
      await assertCanChangeFieldCrop(req, req.params.id);
      await assertFieldDateNotClosed(req.params.id, startDate);
      await service.addHistory(req.params.id, cropId, startDate, endDate);
      const history = await service.getCropHistory(req.params.id);
      res.status(201).json({ success: true, data: history });
    } catch (error) {
      next(error);
    }
  }
);

fieldsRouter.get(
  '/:id/summary',
  validate({ params: idSchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const user = req.user!;
      const canAccess = await assignmentRepo.canUserAccessField(user.userId, user.role, req.params.id, requireOrgId(req));
      if (!canAccess) throw new NotFoundError('Field not found');
      const summary = await getFieldSummary(req.params.id);
      res.json({ success: true, data: summary });
    } catch (error) {
      next(error);
    }
  }
);

fieldsRouter.get(
  '/:id/valves',
  validate({ params: idSchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const user = req.user!;
      const canAccess = await assignmentRepo.canUserAccessField(user.userId, user.role, req.params.id, requireOrgId(req));
      if (!canAccess) throw new NotFoundError('Field not found');
      const data = await valveService.listByField(req.params.id);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
);

fieldsRouter.put(
  '/:id/valves',
  authorizeFieldEditors,
  validate({ params: idSchema, body: valvesSchema }),
  async (req: AuthRequest, res, next) => {
    try {
      await assertCanAccessField(req, req.params.id);
      const { valves } = req.body as { valves: Array<{ number: number; name?: string }> };
      await valveService.replaceForField(req.params.id, valves);
      const data = await valveService.listByField(req.params.id);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
);
