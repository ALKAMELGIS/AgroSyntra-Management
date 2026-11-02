import { Router, Request, Response } from 'express';
import { z } from 'zod';
import * as manpowerService from '../../services/manpower.service';
import { auth, AuthRequest } from '../middleware/auth';
import { requireOrgId } from '../middleware/tenant';
import { workerAuth, requireTeamLeader, WorkerAuthRequest } from '../middleware/workerAuth';
import {
  assertCanManageManpowerRoster,
  assertCanCreateManpowerActivity,
  canCreateHarvestTeamLeader,
  assertCanApproveManpowerRecords,
  assertCanModifyManpowerRecord,
  assertCanEditManpowerReference,
  assertCanSubmitManpower,
  assertCanImportManpower,
  canImportCorrectManpowerRecord,
} from '../../utils/roleAccess';
import { canReviewEntityChangeRequest, ENTITY_MANPOWER_RECORD } from '../../utils/changeRequestAccess';
import { toIpmActor } from '../../utils/ipmAccess';
import { AppError } from '../../utils/errors';
import { assertSiteInOrganization } from '../../utils/tenantValidation';
import * as fieldStaffService from '../../services/fieldStaff.service';
import { validate } from '../middleware/validate';

const idSchema = z.object({ id: z.string().uuid() });

const workersListQuerySchema = z.object({
  search: z.string().optional(),
  category: z.string().optional(),
  is_team_leader: z.enum(['true', 'false']).optional(),
  active_only: z.enum(['true', 'false']).optional(),
  site_id: z.string().uuid().optional(),
});

const recordsListQuerySchema = z.object({
  site_id: z.string().uuid().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  date: z.string().optional(),
  worker_id: z.string().uuid().optional(),
  submitted_by: z.string().uuid().optional(),
  activity: z.string().optional(),
  location: z.string().optional(),
  search: z.string().optional(),
  approval_status: z.string().optional(),
  approved_only: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const detailPivotQuerySchema = z.object({
  start_date: z.string().min(1),
  end_date: z.string().min(1),
  site_id: z.string().uuid().optional(),
  approved_only: z.enum(['true', 'false']).optional(),
});

const overlapsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  worker_ids: z.string().min(1),
});

function parseWorkerIds(raw: string): string[] {
  return [...new Set(
    raw.split(',').map((id) => id.trim()).filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)),
  )];
}

const hoursDetailQuerySchema = z.object({
  start_date: z.string().min(1),
  end_date: z.string().min(1),
  site_id: z.string().uuid().optional(),
  crop: z.string().optional(),
  activity: z.string().min(1),
  variety: z.string().optional(),
  group_by: z.enum(['crop', 'variety']).optional(),
  approved_only: z.enum(['true', 'false']).optional(),
});

const performanceQuerySchema = z.object({
  start_date: z.string().min(1),
  end_date: z.string().min(1),
  site_id: z.string().uuid(),
});

const activityReferenceQuerySchema = z.object({
  site_id: z.string().uuid(),
});

const activityReferenceBodySchema = z.object({
  siteId: z.string().uuid(),
  activity: z.string().min(1),
  crop: z.string().nullable().optional(),
  variety: z.string().nullable().optional(),
  unit: z.string().nullable().optional(),
  target: z.number().nullable().optional(),
  sheet: z.string().max(80).nullable().optional(),
});

const activityReferenceUpdateSchema = z.object({
  activity: z.string().min(1).optional(),
  crop: z.string().nullable().optional(),
  variety: z.string().nullable().optional(),
  unit: z.string().nullable().optional(),
  target: z.number().nullable().optional(),
  sheet: z.string().max(80).nullable().optional(),
});

const pendingApprovalsQuerySchema = z.object({
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  site_id: z.string().uuid().optional(),
});

function assertApprovedManpowerRequiresChangeRequest(
  actor: ReturnType<typeof toIpmActor>,
  record: { approval_status?: string | null },
): void {
  if (record.approval_status === 'approved' && !canReviewEntityChangeRequest(actor, ENTITY_MANPOWER_RECORD)) {
    throw new AppError(
      'Approved manpower records cannot be modified directly. Submit a change request for review.',
      'FORBIDDEN',
      403,
    );
  }
}

export const manpowerRouter = Router();

// ─── Worker Auth (public) ───────────────────────────────────────

manpowerRouter.post('/auth/login', async (req: Request, res: Response) => {
  try {
    const { employeeId, pin } = req.body;
    if (!employeeId || !pin) {
      return res.status(400).json({ success: false, error: { message: 'Employee ID and PIN are required' } });
    }
    const result = await manpowerService.workerLogin(employeeId, pin);
    return res.json({ success: true, data: result });
  } catch (err: any) {
    return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
  }
});

// ─── Team Leader endpoints (worker auth) ────────────────────────

manpowerRouter.get('/workers/search', workerAuth, async (req: WorkerAuthRequest, res: Response) => {
  try {
    const q = (req.query.q as string) || '';
    const siteId = req.worker?.siteId;
    if (!siteId) {
      return res.status(403).json({ success: false, error: { message: 'No site assigned to your account. Contact your supervisor.' } });
    }
    const workers = await manpowerService.searchWorkers(q, siteId);
    return res.json({ success: true, data: workers });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { message: err.message } });
  }
});

manpowerRouter.get('/activities', workerAuth, async (req: WorkerAuthRequest, res: Response) => {
  try {
    const ctx = req.worker?.workerId
      ? await manpowerService.getWorkerSprayCalendarContext(req.worker.workerId)
      : { siteId: null, organizationId: null };
    const activities = await manpowerService.listActivities({
      siteId: ctx.siteId || undefined,
      organizationId: ctx.organizationId || undefined,
    });
    return res.json({ success: true, data: activities });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { message: err.message } });
  }
});

manpowerRouter.get('/entry/activity-references', workerAuth, async (req: WorkerAuthRequest, res: Response) => {
  try {
    const ctx = await manpowerService.getWorkerSprayCalendarContext(req.worker!.workerId);
    if (!ctx.siteId || !ctx.organizationId) {
      return res.status(403).json({
        success: false,
        error: { message: 'No site assigned to your account. Contact your supervisor.' },
      });
    }
    const data = await manpowerService.listActivityReferences(ctx.organizationId, ctx.siteId);
    return res.json({ success: true, data });
  } catch (err: any) {
    return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
  }
});

manpowerRouter.get('/varieties', workerAuth, async (req: Request, res: Response) => {
  try {
    const cropId = req.query.crop_id as string | undefined;
    const cropName = req.query.crop_name as string | undefined;
    const varieties = await manpowerService.listVarieties(cropId, cropName);
    return res.json({ success: true, data: varieties });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { message: err.message } });
  }
});

manpowerRouter.get('/fields-with-variety', workerAuth, async (req: WorkerAuthRequest, res: Response) => {
  try {
    const siteId = req.worker?.siteId;
    if (!siteId) {
      return res.status(403).json({ success: false, error: { message: 'No site assigned to your account. Contact your supervisor.' } });
    }
    const fields = await manpowerService.getFieldsWithVariety(siteId);
    return res.json({ success: true, data: fields });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { message: err.message } });
  }
});

manpowerRouter.get('/records/overlaps', workerAuth, validate({ query: overlapsQuerySchema }), async (req: WorkerAuthRequest, res: Response) => {
  try {
    const date = req.query.date as string;
    const workerIds = parseWorkerIds(req.query.worker_ids as string);
    if (workerIds.length === 0) {
      return res.json({ success: true, data: [] });
    }
    const orgId = await manpowerService.workerOrganizationId(req.worker!.workerId);
    if (!orgId) {
      return res.status(403).json({ success: false, error: { message: 'No organization linked to your account.' } });
    }
    const data = await manpowerService.findManpowerOverlaps({
      organizationId: orgId,
      recordDate: date,
      workerIds,
    });
    return res.json({ success: true, data });
  } catch (err: any) {
    return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
  }
});

manpowerRouter.get('/spray-calendar/applications', workerAuth, async (req: WorkerAuthRequest, res: Response) => {
  try {
    const ctx = await manpowerService.getWorkerSprayCalendarContext(req.worker!.workerId);
    if (!ctx.siteId) {
      return res.status(403).json({ success: false, error: { message: 'No site assigned to your account.' } });
    }
    if (!ctx.organizationId) {
      return res.status(403).json({
        success: false,
        error: { message: 'No organization linked to your site. Contact your supervisor.' },
      });
    }
    const startDate = req.query.start_date as string;
    const endDate = req.query.end_date as string;
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, error: { message: 'start_date and end_date are required' } });
    }
    const apps = await manpowerService.getSprayCalendarForSite(
      ctx.siteId,
      ctx.organizationId,
      startDate,
      endDate,
    );
    return res.json({ success: true, data: apps });
  } catch (err: any) {
    return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
  }
});

manpowerRouter.get('/spray-calendar/fields', workerAuth, async (req: WorkerAuthRequest, res: Response) => {
  try {
    const ctx = await manpowerService.getWorkerSprayCalendarContext(req.worker!.workerId);
    if (!ctx.siteId) {
      return res.status(403).json({ success: false, error: { message: 'No site assigned to your account.' } });
    }
    const fields = await manpowerService.getSprayCalendarFields(ctx.siteId);
    return res.json({ success: true, data: fields });
  } catch (err: any) {
    return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
  }
});

manpowerRouter.post('/records/bulk', workerAuth, requireTeamLeader, async (req: WorkerAuthRequest, res: Response) => {
  try {
    const { records } = req.body;
    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ success: false, error: { message: 'Records array is required' } });
    }
    const enriched = records.map((r: any) => ({
      ...r,
      submittedBy: req.worker!.workerId,
    }));
    const submissionId = manpowerService.createManpowerSubmissionId();
    const result = await manpowerService.bulkCreateRecords(enriched, {
      approvalStatus: 'pending',
      submissionId,
    });
    if (result.length > 0) {
      const orgId = await manpowerService.workerOrganizationId(enriched[0].workerId);
      if (orgId) {
        manpowerService.notifyApproversForNewSubmission(orgId, submissionId, enriched).catch(() => {});
      }
    }
    return res.json({ success: true, data: { inserted: result.length, submissionId } });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// ─── Data Entry Worker / Admin endpoints (main auth) ────────────

// Workers management
manpowerRouter.get('/workers', auth, validate({ query: workersListQuerySchema }), async (req: AuthRequest, res: Response) => {
  try {
    const filters = {
      search: req.query.search as string,
      category: req.query.category as string,
      isTeamLeader: req.query.is_team_leader === 'true' ? true : req.query.is_team_leader === 'false' ? false : undefined,
      activeOnly: req.query.active_only !== 'false',
      siteId: req.query.site_id as string | undefined,
      organizationId: requireOrgId(req),
    };
    const workers = await manpowerService.listWorkers(filters);
    return res.json({ success: true, data: workers });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { message: err.message } });
  }
});

manpowerRouter.post('/workers', auth, async (req: AuthRequest, res: Response) => {
  try {
    assertCanManageManpowerRoster(req.user!);
    const schema = z.object({
      employeeId: z.string().min(1),
      name: z.string().min(1),
      category: z.enum(['Permanent', 'Casual']).default('Casual'),
      isTeamLeader: z.boolean().optional(),
      siteId: z.string().uuid().optional(),
    });
    const data = schema.parse(req.body);
    const isTeamLeader = data.isTeamLeader ?? false;
    if (isTeamLeader && !canCreateHarvestTeamLeader(req.user!.role)) {
      return res.status(403).json({
        success: false,
        error: { message: 'Only data entry workers and Operation Managers may create harvest/maintenance team leaders' },
      });
    }
    if (isTeamLeader) {
      await fieldStaffService.assertHarvestTeamLeaderCreate(req.user!.role, true, null);
    }
    const worker = await manpowerService.createWorker({
      ...data,
      isTeamLeader,
      organizationId: requireOrgId(req),
    });
    return res.status(201).json({ success: true, data: worker });
  } catch (err: any) {
    return res.status(err.status || 400).json({ success: false, error: { message: err.message } });
  }
});

manpowerRouter.post('/workers/bulk', auth, async (req: AuthRequest, res: Response) => {
  try {
    assertCanManageManpowerRoster(req.user!);
    const schema = z.object({
      workers: z.array(z.object({
        employeeId: z.string().min(1),
        name: z.string().min(1),
        category: z.enum(['Permanent', 'Casual']).default('Casual'),
      })).min(1),
      siteId: z.string().uuid().optional(),
    });
    const data = schema.parse(req.body);
    const result = await manpowerService.bulkCreateWorkers(data.workers, data.siteId, requireOrgId(req));
    return res.json({ success: true, data: result });
  } catch (err: any) {
    return res.status(err.status || 400).json({ success: false, error: { message: err.message } });
  }
});

manpowerRouter.put('/workers/:id', auth, validate({ params: idSchema }), async (req: AuthRequest, res: Response) => {
  try {
    assertCanManageManpowerRoster(req.user!);
    await fieldStaffService.assertWorkerUpdateAllowed(req.params.id, {
      isTeamLeader: req.body.isTeamLeader,
    });
    const worker = await manpowerService.updateWorker(req.params.id, req.body);
    if (!worker) return res.status(404).json({ success: false, error: { message: 'Worker not found' } });
    return res.json({ success: true, data: worker });
  } catch (err: any) {
    return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
  }
});

manpowerRouter.delete('/workers/:id', auth, validate({ params: idSchema }), async (req: AuthRequest, res: Response) => {
  try {
    assertCanManageManpowerRoster(req.user!);
    await manpowerService.deactivateWorker(req.params.id);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
  }
});

manpowerRouter.put('/workers/:id/pin', auth, validate({ params: idSchema }), async (req: AuthRequest, res: Response) => {
  try {
    assertCanManageManpowerRoster(req.user!);
    const { pin } = req.body;
    if (!pin || pin.length < 4) {
      return res.status(400).json({ success: false, error: { message: 'PIN must be at least 4 characters' } });
    }
    await manpowerService.setWorkerPin(req.params.id, pin);
    return res.json({ success: true, data: { message: 'PIN set successfully' } });
  } catch (err: any) {
    return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
  }
});

// Activities (admin read)
const createActivityBodySchema = z.object({
  name: z.string().trim().min(1),
  defaultUnit: z.string().trim().min(1).nullable().optional(),
});

const activityImportMappingsBodySchema = z.object({
  mappings: z.array(z.object({
    sourceName: z.string().trim().min(1),
    action: z.enum(['connect', 'create']),
    catalogName: z.string().trim().min(1),
  })),
});

manpowerRouter.get('/admin/activities', auth, async (req: AuthRequest, res: Response) => {
  try {
    const siteId = req.query.site_id as string | undefined;
    const orgId = requireOrgId(req);
    if (siteId) await assertSiteInOrganization(siteId, orgId);
    const activities = await manpowerService.listActivities(
      siteId ? { siteId, organizationId: orgId } : undefined,
    );
    return res.json({ success: true, data: activities });
  } catch (err: any) {
    return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
  }
});

manpowerRouter.post(
  '/admin/activities',
  auth,
  validate({ body: createActivityBodySchema }),
  async (req: AuthRequest, res: Response) => {
    try {
      assertCanCreateManpowerActivity(req.user!);
      const activity = await manpowerService.ensureManpowerActivity(
        req.body.name,
        req.body.defaultUnit,
      );
      return res.status(201).json({ success: true, data: activity });
    } catch (err: any) {
      return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
    }
  },
);

manpowerRouter.get('/admin/activity-aliases', auth, async (req: AuthRequest, res: Response) => {
  try {
    const aliases = await manpowerService.listActivityAliases(requireOrgId(req));
    return res.json({ success: true, data: aliases });
  } catch (err: any) {
    return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
  }
});

manpowerRouter.post(
  '/admin/activity-import-mappings',
  auth,
  validate({ body: activityImportMappingsBodySchema }),
  async (req: AuthRequest, res: Response) => {
    try {
      assertCanCreateManpowerActivity(req.user!);
      const result = await manpowerService.applyActivityImportMappings(
        requireOrgId(req),
        req.body.mappings,
      );
      return res.json({ success: true, data: result });
    } catch (err: any) {
      return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
    }
  },
);

manpowerRouter.get('/admin/fields-with-variety', auth, async (req: AuthRequest, res: Response) => {
  try {
    const siteId = req.query.site_id as string | undefined;
    if (!siteId) {
      return res.status(400).json({ success: false, error: { message: 'site_id is required' } });
    }
    await assertSiteInOrganization(siteId, requireOrgId(req));
    const fields = await manpowerService.getFieldsWithVariety(siteId);
    return res.json({ success: true, data: fields });
  } catch (err: any) {
    return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
  }
});

manpowerRouter.get('/admin/records/overlaps', auth, validate({ query: overlapsQuerySchema }), async (req: AuthRequest, res: Response) => {
  try {
    const date = req.query.date as string;
    const workerIds = parseWorkerIds(req.query.worker_ids as string);
    if (workerIds.length === 0) {
      return res.json({ success: true, data: [] });
    }
    const data = await manpowerService.findManpowerOverlaps({
      organizationId: requireOrgId(req),
      recordDate: date,
      workerIds,
    });
    return res.json({ success: true, data });
  } catch (err: any) {
    return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
  }
});

const workerDatesQuerySchema = z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

manpowerRouter.get(
  '/admin/records/worker-dates',
  auth,
  validate({ query: workerDatesQuerySchema }),
  async (req: AuthRequest, res: Response) => {
    try {
      const data = await manpowerService.listRecordWorkerDates(
        requireOrgId(req),
        req.query.start_date as string,
        req.query.end_date as string,
      );
      return res.json({ success: true, data });
    } catch (err: any) {
      return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
    }
  },
);

const activityPivotColumnSchema = z.object({
  pivotColumn: z.string().nullable(),
});

manpowerRouter.put(
  '/admin/activities/:id/pivot-column',
  auth,
  validate({ params: idSchema, body: activityPivotColumnSchema }),
  async (req: AuthRequest, res: Response) => {
    try {
      assertCanEditManpowerReference(req.user!);
      const { pivotColumn } = req.body;
      const activity = await manpowerService.updateActivityPivotColumn(req.params.id, pivotColumn);
      return res.json({ success: true, data: activity });
    } catch (err: any) {
      const status = err.status || (err.message?.startsWith('Invalid pivot column') ? 400 : 500);
      return res.status(status).json({ success: false, error: { message: err.message } });
    }
  },
);

// Varieties (admin)
manpowerRouter.get('/admin/varieties', auth, async (req: AuthRequest, res: Response) => {
  try {
    const cropId = req.query.crop_id as string | undefined;
    const cropName = req.query.crop_name as string | undefined;
    const varieties = await manpowerService.listVarieties(cropId, cropName);
    return res.json({ success: true, data: varieties });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { message: err.message } });
  }
});

manpowerRouter.post('/admin/varieties', auth, async (req: AuthRequest, res: Response) => {
  try {
    assertCanManageManpowerRoster(req.user!);
    const { name, cropId } = req.body;
    if (!name) return res.status(400).json({ success: false, error: { message: 'Name is required' } });
    const variety = await manpowerService.createVariety(name, cropId);
    return res.json({ success: true, data: variety });
  } catch (err: any) {
    return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
  }
});

function uniqueReferenceError(err: any) {
  if (err?.code === '23505') {
    return new AppError('A reference already exists for this activity, crop, and variety', 'CONFLICT', 409);
  }
  return err;
}

manpowerRouter.get('/activity-references', auth, validate({ query: activityReferenceQuerySchema }), async (req: AuthRequest, res: Response) => {
  try {
    const siteId = req.query.site_id as string;
    const data = await manpowerService.listActivityReferences(requireOrgId(req), siteId);
    return res.json({ success: true, data });
  } catch (err: any) {
    return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
  }
});

manpowerRouter.post('/activity-references', auth, validate({ body: activityReferenceBodySchema }), async (req: AuthRequest, res: Response) => {
  try {
    assertCanEditManpowerReference(req.user!);
    const body = req.body;
    const data = await manpowerService.createActivityReference({
      organizationId: requireOrgId(req),
      siteId: body.siteId,
      activity: body.activity,
      crop: body.crop,
      variety: body.variety,
      unit: body.unit,
      target: body.target,
      sheet: body.sheet,
      createdBy: req.user!.userId,
    });
    return res.status(201).json({ success: true, data });
  } catch (err: any) {
    const mapped = uniqueReferenceError(err);
    return res.status(mapped.status || 500).json({ success: false, error: { message: mapped.message } });
  }
});

manpowerRouter.put('/activity-references/:id', auth, validate({ params: idSchema, body: activityReferenceUpdateSchema }), async (req: AuthRequest, res: Response) => {
  try {
    assertCanEditManpowerReference(req.user!);
    const data = await manpowerService.updateActivityReference(req.params.id, requireOrgId(req), req.body);
    return res.json({ success: true, data });
  } catch (err: any) {
    const mapped = uniqueReferenceError(err);
    return res.status(mapped.status || 500).json({ success: false, error: { message: mapped.message } });
  }
});

manpowerRouter.delete('/activity-references/:id', auth, validate({ params: idSchema }), async (req: AuthRequest, res: Response) => {
  try {
    assertCanEditManpowerReference(req.user!);
    await manpowerService.deleteActivityReference(req.params.id, requireOrgId(req));
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
  }
});

// Records management (admin)
manpowerRouter.get('/records', auth, validate({ query: recordsListQuerySchema }), async (req: AuthRequest, res: Response) => {
  try {
    const filters = {
      organizationId: requireOrgId(req),
      siteId: req.query.site_id as string | undefined,
      startDate: req.query.start_date as string,
      endDate: req.query.end_date as string,
      date: req.query.date as string,
      workerId: req.query.worker_id as string,
      activity: req.query.activity as string,
      location: req.query.location as string,
      submittedBy: req.query.submitted_by as string,
      search: req.query.search as string,
      approvalStatus: req.query.approval_status as string,
      approvedOnly: req.query.approved_only === 'true',
      limit: req.query.limit ? Math.min(parseInt(req.query.limit as string), 100) : 50,
      offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
    };
    const result = await manpowerService.listRecords(filters);
    return res.json({ success: true, data: result.data, meta: { total: result.total } });
  } catch (err: any) {
    return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
  }
});

/**
 * Copy client rows without the fields the server decides: who created the row,
 * which organization it belongs to, and its approval status / submission.
 */
function stripServerDecidedFields(records: any[], userId: string | undefined) {
  return records.map((r: any) => {
    const {
      approvalStatus: _approvalStatus,
      approval_status: _approvalStatusSnake,
      submissionId: _submissionId,
      organizationId: _organizationId,
      createdBy: _createdBy,
      ...rest
    } = r || {};
    return { ...rest, createdBy: userId };
  });
}

/**
 * Typed manpower (Daily Activity Sheet, single add): worker or operator only.
 * Always stored pending for the operation manager, whatever the body says.
 */
async function createPendingSubmission(req: AuthRequest, records: any[]) {
  const orgId = requireOrgId(req);
  const enriched = stripServerDecidedFields(records, req.user?.userId);
  const submissionId = manpowerService.createManpowerSubmissionId();
  const result = await manpowerService.bulkCreateRecords(enriched, {
    approvalStatus: 'pending',
    submissionId,
  });
  if (result.length > 0) {
    manpowerService.notifyApproversForNewSubmission(orgId, submissionId, enriched).catch(() => {});
  }
  return { result, submissionId };
}

manpowerRouter.post('/records', auth, async (req: AuthRequest, res: Response) => {
  try {
    assertCanSubmitManpower(req.user!);
    const { result, submissionId } = await createPendingSubmission(req, [req.body]);
    return res.status(201).json({
      success: true,
      data: { ...result[0], approval_status: 'pending', submission_id: submissionId },
    });
  } catch (err: any) {
    return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
  }
});

manpowerRouter.post('/admin/records/bulk', auth, async (req: AuthRequest, res: Response) => {
  try {
    assertCanSubmitManpower(req.user!);
    const { records } = req.body;
    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ success: false, error: { message: 'Records array is required' } });
    }
    // Any approvalStatus in the body is ignored: typed days always wait for approval.
    const { result, submissionId } = await createPendingSubmission(req, records);
    return res.json({
      success: true,
      data: { inserted: result.length, submissionId, approvalStatus: 'pending' },
    });
  } catch (err: any) {
    return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
  }
});

/** Excel import of manpower days: data entry worker only, stored approved. */
manpowerRouter.post('/admin/records/import', auth, async (req: AuthRequest, res: Response) => {
  try {
    assertCanImportManpower(req.user!);
    const { records } = req.body;
    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ success: false, error: { message: 'Records array is required' } });
    }
    const enriched = stripServerDecidedFields(records, req.user?.userId);
    const result = await manpowerService.bulkCreateRecords(enriched, {
      approvalStatus: 'approved',
      submissionId: null,
    });
    return res.json({ success: true, data: { inserted: result.length, approvalStatus: 'approved' } });
  } catch (err: any) {
    return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
  }
});

/**
 * Hours corrections sent by the Excel import. Importers only; and every record
 * in the batch must be the caller's own, either still pending or stored by
 * their own Excel import (canImportCorrectManpowerRecord). Approved typed days
 * and other people's records need a change request, so the whole batch is
 * refused if any record falls outside that rule.
 */
manpowerRouter.post('/admin/records/bulk-update', auth, async (req: AuthRequest, res: Response) => {
  try {
    assertCanImportManpower(req.user!);
    const { records } = req.body;
    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ success: false, error: { message: 'Records array is required' } });
    }
    const orgId = requireOrgId(req);
    const ids = [...new Set(records.map((r: any) => String(r?.id || '')))];
    if (ids.some((id) => !z.string().uuid().safeParse(id).success)) {
      return res.status(400).json({ success: false, error: { message: 'Every record needs a valid id' } });
    }
    const infos = await manpowerService.getRecordsAccessInfo(ids, orgId);
    const byId = new Map(infos.map((info) => [info.id, info]));
    const blocked = ids.filter((id) => {
      const info = byId.get(id);
      return !info || !canImportCorrectManpowerRecord(req.user!, info);
    });
    if (blocked.length > 0) {
      throw new AppError(
        'You can only correct your own pending or Excel-imported manpower records; use a change request for the others',
        'FORBIDDEN',
        403,
        { recordIds: blocked.slice(0, 50) },
      );
    }
    // Changed approved records go back to pending for the Operation Manager.
    const result = await manpowerService.bulkUpdateRecords(orgId, records);
    for (const submission of result.sentForApproval) {
      manpowerService.notifyApproversForNewSubmission(orgId, submission.submissionId, submission.records)
        .catch(() => {});
    }
    const sentForApproval = result.sentForApproval.reduce((n, s) => n + s.records.length, 0);
    return res.json({ success: true, data: { updated: result.updated.length, sentForApproval } });
  } catch (err: any) {
    return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
  }
});

manpowerRouter.put('/records/:id', auth, validate({ params: idSchema }), async (req: AuthRequest, res: Response) => {
  try {
    const orgId = requireOrgId(req);
    const existing = await manpowerService.getRecordById(req.params.id, orgId);
    assertCanModifyManpowerRecord(req.user!, existing);
    assertApprovedManpowerRequiresChangeRequest(toIpmActor(req.user!), existing);
    const record = await manpowerService.updateRecord(req.params.id, orgId, req.body);
    if (!record) return res.status(404).json({ success: false, error: { message: 'Record not found' } });
    return res.json({ success: true, data: record });
  } catch (err: any) {
    return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
  }
});

manpowerRouter.delete('/records/:id', auth, validate({ params: idSchema }), async (req: AuthRequest, res: Response) => {
  try {
    const orgId = requireOrgId(req);
    const existing = await manpowerService.getRecordById(req.params.id, orgId);
    assertCanModifyManpowerRecord(req.user!, existing);
    assertApprovedManpowerRequiresChangeRequest(toIpmActor(req.user!), existing);
    await manpowerService.deleteRecord(req.params.id, orgId);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
  }
});

// Summary
manpowerRouter.get('/summary', auth, async (req: AuthRequest, res: Response) => {
  try {
    const date = (req.query.date as string) || new Date().toISOString().split('T')[0];
    const summary = await manpowerService.getDailySummary(requireOrgId(req), date);
    return res.json({ success: true, data: summary });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { message: err.message } });
  }
});

manpowerRouter.get('/summary/detail-pivot', auth, validate({ query: detailPivotQuerySchema }), async (req: AuthRequest, res: Response) => {
  try {
    const startDate = req.query.start_date as string;
    const endDate = req.query.end_date as string;
    const siteId = req.query.site_id as string | undefined;
    const approvedOnly = req.query.approved_only === 'true';
    const data = await manpowerService.getDetailPivotSummary(requireOrgId(req), {
      startDate,
      endDate,
      siteId,
      approvedOnly,
    });
    return res.json({ success: true, data });
  } catch (err: any) {
    return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
  }
});

manpowerRouter.get('/summary/hours-detail', auth, validate({ query: hoursDetailQuerySchema }), async (req: AuthRequest, res: Response) => {
  try {
    const startDate = req.query.start_date as string;
    const endDate = req.query.end_date as string;
    const siteId = req.query.site_id as string | undefined;
    const crop = req.query.crop as string;
    const activity = req.query.activity as string;
    const variety = req.query.variety as string | undefined;
    const groupBy = (req.query.group_by as 'crop' | 'variety') || 'crop';
    const approvedOnly = req.query.approved_only !== 'false';

    if (groupBy === 'crop' && !crop) {
      return res.status(400).json({
        success: false,
        error: { message: 'crop is required when group_by is crop' },
      });
    }

    const data = await manpowerService.getHoursDetail(requireOrgId(req), {
      startDate,
      endDate,
      siteId,
      crop,
      variety,
      activity,
      groupBy,
      approvedOnly,
    });
    return res.json({ success: true, data });
  } catch (err: any) {
    return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
  }
});

manpowerRouter.get('/summary/performance', auth, validate({ query: performanceQuerySchema }), async (req: AuthRequest, res: Response) => {
  try {
    const data = await manpowerService.getPerformanceSummary(requireOrgId(req), {
      startDate: req.query.start_date as string,
      endDate: req.query.end_date as string,
      siteId: req.query.site_id as string,
    });
    return res.json({ success: true, data });
  } catch (err: any) {
    return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
  }
});

manpowerRouter.get('/approvals/pending-count', auth, async (req: AuthRequest, res: Response) => {
  try {
    assertCanApproveManpowerRecords(req.user!);
    const orgId = requireOrgId(req);
    const count = await manpowerService.countPendingManpowerApprovals(orgId);
    const clashCount = await manpowerService.countPendingManpowerApprovalClashes(orgId);
    const badgeCount = manpowerService.badgeCountForManpowerApprovals(req.user?.role, count);
    return res.json({ success: true, data: { count, badgeCount, clashCount } });
  } catch (err: any) {
    return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
  }
});

manpowerRouter.get('/approvals/pending', auth, validate({ query: pendingApprovalsQuerySchema }), async (req: AuthRequest, res: Response) => {
  try {
    assertCanApproveManpowerRecords(req.user!);
    const data = await manpowerService.listPendingApprovals(requireOrgId(req), {
      startDate: req.query.start_date as string,
      endDate: req.query.end_date as string,
      siteId: req.query.site_id as string | undefined,
    });
    return res.json({ success: true, data });
  } catch (err: any) {
    return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
  }
});

manpowerRouter.post('/approvals/submissions/:submissionKey/approve', auth, async (req: AuthRequest, res: Response) => {
  try {
    assertCanApproveManpowerRecords(req.user!);
    const result = await manpowerService.approveManpowerSubmission(
      req.params.submissionKey,
      requireOrgId(req),
      req.user!.userId,
    );
    return res.json({ success: true, data: result });
  } catch (err: any) {
    return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
  }
});

manpowerRouter.post('/approvals/submissions/:submissionKey/reject', auth, async (req: AuthRequest, res: Response) => {
  try {
    assertCanApproveManpowerRecords(req.user!);
    const result = await manpowerService.rejectManpowerSubmission(
      req.params.submissionKey,
      requireOrgId(req),
      req.user!.userId,
      req.body?.reason,
    );
    return res.json({ success: true, data: result });
  } catch (err: any) {
    return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
  }
});

manpowerRouter.post('/approvals/submissions/:submissionKey/workers/:workerId/approve', auth, async (req: AuthRequest, res: Response) => {
  try {
    assertCanApproveManpowerRecords(req.user!);
    const result = await manpowerService.approveManpowerWorkerInSubmission(
      req.params.submissionKey,
      req.params.workerId,
      requireOrgId(req),
      req.user!.userId,
    );
    return res.json({ success: true, data: result });
  } catch (err: any) {
    return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
  }
});

manpowerRouter.post('/approvals/submissions/:submissionKey/workers/:workerId/reject', auth, async (req: AuthRequest, res: Response) => {
  try {
    assertCanApproveManpowerRecords(req.user!);
    const result = await manpowerService.rejectManpowerWorkerInSubmission(
      req.params.submissionKey,
      req.params.workerId,
      requireOrgId(req),
      req.user!.userId,
      req.body?.reason,
    );
    return res.json({ success: true, data: result });
  } catch (err: any) {
    return res.status(err.status || 500).json({ success: false, error: { message: err.message } });
  }
});
