import { Router } from 'express';
import { z } from 'zod';
import * as scoutingService from '../../services/scouting.service';
import * as scoutingSummaryService from '../../services/scoutingSummary.service';
import { validate } from '../middleware/validate';
import { AuthRequest, auth } from '../middleware/auth';
import { emitDataChange } from '../../websocket';
import { deliverWebhooks } from '../../services/webhook.service';
import { logAuditEvent } from '../../services/auditLog.service';
import { requireOrgId } from '../middleware/tenant';
import { assertFieldInOrganization } from '../../utils/tenantValidation';
import { AssignmentRepository } from '../../repositories/assignment.repository';
import { assertCanOperateScouting, canOperateScouting } from '../../utils/roleAccess';
import {
  canDeleteScoutingReport,
  canEditScoutingReport,
  canReviewScouting,
  requireIpmCatalogEditor,
} from '../../utils/ipmAccess';

export const scoutingRouter = Router();
const assignmentRepo = new AssignmentRepository();

// ─── Schemas ──────────────────────────────────────────────────────

const idSchema = z.object({ id: z.string().uuid() });

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  field_id: z.string().uuid().optional(),
  site_id: z.string().uuid().optional(),
  pest_disease_id: z.string().uuid().optional(),
  status: z.enum(['submitted', 'reviewed', 'resolved', 'returned']).optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});

const observationSchema = z.object({
  pestDiseaseId: z.string().uuid().optional(),
  pestName: z.string().min(1).max(200),
  category: z.enum(['insect', 'disease']),
  samplingUnit: z.string().max(100).optional(),
  samplingMethod: z.string().max(200).optional(),
  count1: z.number().optional(),
  count2: z.number().optional(),
  count3: z.number().optional(),
  count4: z.number().optional(),
  count5: z.number().optional(),
  count6: z.number().optional(),
  count7: z.number().optional(),
  count8: z.number().optional(),
  count9: z.number().optional(),
  count10: z.number().optional(),
  total: z.number().optional(),
  average: z.number().optional(),
  percent: z.number().min(0).max(100).optional(),
});

const growthStageSchema = z.object({
  numberOfTrusses: z.number().optional(),
  numberOfStems: z.number().optional(),
  stemThickness: z.number().optional(),
  avgFruitWeight: z.number().optional(),
  fruitsPerPlant: z.number().optional(),
});

const trapCardSchema = z.object({
  cardNumber: z.number().int().positive(),
  insectType: z.string().max(50).optional(),
  trapLocation: z.string().max(200).optional(),
  monday: z.number().int().optional(),
  tuesday: z.number().int().optional(),
  wednesday: z.number().int().optional(),
  thursday: z.number().int().optional(),
  friday: z.number().int().optional(),
  saturday: z.number().int().optional(),
  sunday: z.number().int().optional(),
  total: z.number().int().optional(),
});

const createReportSchema = z.object({
  fieldId: z.string().uuid(),
  reportDate: z.string().optional(),
  reportTime: z.string().optional(),
  cropName: z.string().max(100).optional(),
  variety: z.string().max(100).optional(),
  areaVariety: z.string().max(100).optional(),
  densityPerArea: z.number().optional(),
  cropHeight: z.number().optional(),
  soilCondition: z.enum(['wet', 'dry']).optional(),
  weather: z.enum(['sunny', 'cloudy', 'rainy']).optional(),
  wind: z.enum(['none', 'light', 'strong']).optional(),
  bedCode: z.string().max(255).optional(),
  columnCode: z.string().max(255).optional(),
  bayCode: z.string().max(255).optional(),
  valveCode: z.string().max(255).optional(),
  side: z.enum(['fan', 'wet_pad']).optional(),
  previousReportId: z.string().uuid().optional(),
  comments: z.string().optional(),
  // Legacy single-observation fields
  pestDiseaseId: z.string().uuid().optional(),
  customPestName: z.string().max(200).optional(),
  infestationPct: z.number().min(0).max(100).optional(),
  severity: z.enum(['none', 'low', 'medium', 'high', 'critical']).optional(),
  notes: z.string().optional(),
  gpsLat: z.number().optional(),
  gpsLng: z.number().optional(),
  // New child collections
  observations: z.array(observationSchema).optional(),
  growthStage: growthStageSchema.optional(),
  trapCards: z.array(trapCardSchema).optional(),
});

const addPhotosSchema = z.object({
  photos: z.array(z.object({
    filePath: z.string(),
    fileName: z.string().optional(),
    fileSize: z.number().optional(),
    mimeType: z.string().optional(),
    gpsLat: z.number().optional(),
    gpsLng: z.number().optional(),
    caption: z.string().optional(),
  })).min(1),
});

const updateStatusSchema = z.object({
  status: z.enum(['reviewed', 'resolved', 'returned']),
  reason: z.string().max(2000).optional(),
}).refine((b) => b.status !== 'returned' || !!b.reason?.trim(), {
  message: 'A reason is required to send a report back',
  path: ['reason'],
});

const pestCatalogCreateSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.enum(['pest', 'disease', 'other', 'biological_control', 'preventative']),
  description: z.string().optional(),
  recommendedAction: z.string().optional(),
  warningThreshold: z.number().min(0).max(100).optional(),
  criticalThreshold: z.number().min(0).max(100).optional(),
  matchPattern: z.string().max(100).optional(),
  sortOrder: z.number().int().optional(),
  includeInSummary: z.boolean().optional(),
  groupIds: z.array(z.string().uuid()).optional(),
});

const pestCatalogUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  category: z.enum(['pest', 'disease', 'other', 'biological_control', 'preventative']).optional(),
  description: z.string().optional(),
  recommendedAction: z.string().optional(),
  isActive: z.boolean().optional(),
  warningThreshold: z.number().min(0).max(100).optional(),
  criticalThreshold: z.number().min(0).max(100).optional(),
  matchPattern: z.string().max(100).optional(),
  sortOrder: z.number().int().optional(),
  includeInSummary: z.boolean().optional(),
  groupIds: z.array(z.string().uuid()).optional(),
  matchToId: z.string().uuid().nullable().optional(),
});

const pestCatalogListQuerySchema = z.object({
  category: z.string().optional(),
  include_inactive: z.enum(['true', 'false']).optional(),
});

const fieldIdSchema = z.object({ fieldId: z.string().uuid() });

const samplingUnitsUpdateSchema = z.object({
  samplingUnits: z.number().positive(),
});

const samplingUnitsListQuerySchema = z.object({
  site_id: z.string().uuid().optional(),
});

const summaryQuerySchema = z.object({
  site_id: z.string().uuid().optional(),
  field_id: z.string().uuid().optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});

// ─── Field sampling units ─────────────────────────────────────────

scoutingRouter.get(
  '/sampling-units',
  auth,
  validate({ query: samplingUnitsListQuerySchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const orgId = requireOrgId(req);
      const user = req.user!;
      const siteId = (req.query as { site_id?: string }).site_id;

      let rows;
      if (user.role === 'ceo') {
        rows = await scoutingService.listFieldSamplingUnits({ organizationId: orgId, siteId });
      } else {
        const fieldIds = await assignmentRepo.getUserAccessibleFieldIds(user.userId, user.role, orgId);
        if (fieldIds.length === 0) {
          rows = [];
        } else {
          rows = await scoutingService.listFieldSamplingUnits({
            organizationId: orgId,
            siteId,
            fieldIds,
          });
        }
      }
      res.json({ success: true, data: rows });
    } catch (error) {
      next(error);
    }
  },
);

scoutingRouter.get(
  '/sampling-units/:fieldId',
  auth,
  validate({ params: fieldIdSchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const orgId = requireOrgId(req);
      const user = req.user!;
      await assertFieldInOrganization(req.params.fieldId, orgId);
      const canAccess = await assignmentRepo.canUserAccessField(
        user.userId,
        user.role,
        req.params.fieldId,
        orgId,
      );
      if (!canAccess) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Field not found' },
        });
      }
      const samplingUnits = await scoutingService.getFieldSamplingUnits(req.params.fieldId);
      res.json({ success: true, data: { fieldId: req.params.fieldId, samplingUnits } });
    } catch (error) {
      next(error);
    }
  },
);

scoutingRouter.put(
  '/sampling-units/:fieldId',
  auth,
  requireIpmCatalogEditor,
  validate({ params: fieldIdSchema, body: samplingUnitsUpdateSchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const orgId = requireOrgId(req);
      const user = req.user!;
      await assertFieldInOrganization(req.params.fieldId, orgId);
      const canAccess = await assignmentRepo.canUserAccessField(
        user.userId,
        user.role,
        req.params.fieldId,
        orgId,
      );
      if (!canAccess) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Field not found' },
        });
      }
      const row = await scoutingService.upsertFieldSamplingUnits(
        req.params.fieldId,
        req.body.samplingUnits,
        req.user!.userId,
      );
      res.json({ success: true, data: row });
    } catch (error) {
      next(error);
    }
  },
);

// ─── Pest Catalog Routes ──────────────────────────────────────────

scoutingRouter.get(
  '/pest-catalog',
  auth,
  validate({ query: pestCatalogListQuerySchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const query = req.query as { category?: string; include_inactive?: string };
      const catalog = await scoutingService.getPestCatalog(
        requireOrgId(req),
        query.category,
        query.include_inactive === 'true',
      );
      res.json({ success: true, data: catalog });
    } catch (error) {
      next(error);
    }
  },
);

scoutingRouter.post(
  '/pest-catalog',
  auth,
  requireIpmCatalogEditor,
  validate({ body: pestCatalogCreateSchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const entry = await scoutingService.createPestCatalogEntry({
        ...req.body,
        isCustom: true,
        createdBy: req.user!.userId,
        organizationId: requireOrgId(req),
        warningThreshold: req.body.warningThreshold,
        criticalThreshold: req.body.criticalThreshold,
        groupIds: req.body.groupIds,
      });
      res.status(201).json({ success: true, data: entry });
    } catch (error) {
      next(error);
    }
  }
);

scoutingRouter.put(
  '/pest-catalog/:id',
  auth,
  requireIpmCatalogEditor,
  validate({ params: idSchema, body: pestCatalogUpdateSchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const orgId = requireOrgId(req);
      if (req.body.matchToId) {
        const merged = await scoutingService.mergePestCatalogEntry(
          req.params.id,
          req.body.matchToId,
          orgId,
        );
        res.json({ success: true, data: merged });
        return;
      }
      const { matchToId: ignoredMatchToId, groupIds, ...rest } = req.body;
      void ignoredMatchToId;
      // A shared (foundation) row is copied into this organization before it changes,
      // so `entry.id` may differ from the id in the URL.
      const entry = await scoutingService.updatePestCatalogEntry(
        req.params.id,
        orgId,
        rest,
        req.user!.userId,
      );
      if (groupIds) {
        await scoutingService.setPestCatalogGroups(entry.id, groupIds, orgId);
      }
      const catalog = await scoutingService.getPestCatalog(orgId, undefined, true);
      const latest = catalog.find((row: { id: string }) => row.id === entry.id) || entry;
      res.json({ success: true, data: latest });
    } catch (error) {
      next(error);
    }
  }
);

scoutingRouter.delete(
  '/pest-catalog/:id',
  auth,
  requireIpmCatalogEditor,
  validate({ params: idSchema }),
  async (req: AuthRequest, res, next) => {
    try {
      await scoutingService.deletePestCatalogEntry(req.params.id, requireOrgId(req));
      res.json({ success: true, data: { deleted: true } });
    } catch (error) {
      next(error);
    }
  }
);

// ─── Scouting Report Routes ──────────────────────────────────────

scoutingRouter.get(
  '/reports',
  auth,
  validate({ query: listQuerySchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const { page, limit, field_id, site_id, pest_disease_id, status, start_date, end_date } = req.query as any;
      const result = await scoutingService.listScoutingReports({
        fieldId: field_id,
        siteId: site_id,
        pestDiseaseId: pest_disease_id,
        status,
        startDate: start_date,
        endDate: end_date,
        page,
        limit,
        organizationId: requireOrgId(req),
      });
      res.json({ success: true, data: result.items, meta: result.meta });
    } catch (error) {
      next(error);
    }
  }
);

scoutingRouter.get(
  '/reports/:id',
  auth,
  validate({ params: idSchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const report = await scoutingService.getScoutingReportById(req.params.id, requireOrgId(req));
      if (!report) {
        return res.status(404).json({ success: false, error: { message: 'Report not found' } });
      }
      res.json({ success: true, data: report });
    } catch (error) {
      next(error);
    }
  }
);

scoutingRouter.post(
  '/reports',
  auth,
  validate({ body: createReportSchema }),
  async (req: AuthRequest, res, next) => {
    try {
      assertCanOperateScouting({ userId: req.user!.userId, role: req.user!.role });
      const orgId = requireOrgId(req);
      if (req.body.fieldId) await assertFieldInOrganization(req.body.fieldId, orgId);
      const report = await scoutingService.createScoutingReport(
        req.body,
        req.user!.userId,
        orgId,
      );
      emitDataChange('scouting_report', 'create', report);
      deliverWebhooks('scouting_report.created', report).catch(() => {});
      res.status(201).json({ success: true, data: report });
    } catch (error) {
      next(error);
    }
  }
);

scoutingRouter.put(
  '/reports/:id',
  auth,
  validate({ params: idSchema, body: createReportSchema }),
  async (req: AuthRequest, res, next) => {
    try {
      // Access control: agronomists, reviewers and managers may edit any
      // report. The scout may edit their own report only while it is
      // submitted or sent back; saving a sent-back report resubmits it.
      const orgId = requireOrgId(req);
      const existing = await scoutingService.getScoutingReportById(req.params.id, orgId);
      if (!existing) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Scouting report not found' },
        });
      }
      const user = req.user!;
      const isOwner = existing.scout_user_id === user.userId;

      if (!canOperateScouting(user.role)) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'You do not have permission to edit scouting reports.' },
        });
      }
      if (!canEditScoutingReport(user, existing)) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: isOwner
              ? 'This report has already been reviewed and can no longer be edited.'
              : 'You can only edit reports you created.',
          },
        });
      }
      if (req.body.fieldId && req.body.fieldId !== existing.field_id) {
        await assertFieldInOrganization(req.body.fieldId, orgId);
      }

      const updated = await scoutingService.updateScoutingReport(
        req.params.id,
        req.body,
        user.userId,
        orgId,
      );
      if (!updated) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Scouting report not found' },
        });
      }
      await logAuditEvent({
        userId: req.user!.userId,
        action: 'UPDATE',
        entity: 'report',
        entityId: req.params.id,
        changes: {
          scope: 'scouting',
          fieldId: req.body?.fieldId,
          reportDate: req.body?.reportDate,
          ...(existing.status !== updated.status
            ? { status: { from: existing.status, to: updated.status } }
            : {}),
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      emitDataChange('scouting_report', 'update', updated);
      deliverWebhooks('scouting_report.updated', updated).catch(() => {});
      res.json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  },
);

scoutingRouter.delete(
  '/reports/:id',
  auth,
  validate({ params: idSchema }),
  async (req: AuthRequest, res, next) => {
    try {
      // Deleting a historical record is more consequential than editing it,
      // so only the pest agronomist and the agronomist may delete. A scouter
      // who made a mistake edits the report instead; managers only watch.
      if (!canDeleteScoutingReport(req.user!)) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Only the pest agronomist and agronomists may delete scouting reports.',
          },
        });
      }

      // Capture a quick snapshot for the audit log so the entry stays
      // useful after the row is gone.
      const orgId = requireOrgId(req);
      let snapshot: any = null;
      try {
        snapshot = await scoutingService.getScoutingReportById(req.params.id, orgId);
      } catch { /* non-fatal */ }

      const deleted = await scoutingService.deleteScoutingReport(req.params.id, orgId);
      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Scouting report not found' },
        });
      }

      await logAuditEvent({
        userId: req.user!.userId,
        action: 'DELETE',
        entity: 'report',
        entityId: req.params.id,
        changes: snapshot
          ? {
              scope: 'scouting',
              fieldId: snapshot.field_id,
              reportDate: snapshot.report_date,
              scoutUserId: snapshot.scout_user_id,
            }
          : { scope: 'scouting' },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      emitDataChange('scouting_report', 'delete', { id: req.params.id });
      res.json({ success: true, data: { deleted: true } });
    } catch (error) {
      next(error);
    }
  },
);

scoutingRouter.post(
  '/reports/:id/photos',
  auth,
  validate({ params: idSchema, body: addPhotosSchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const report = await scoutingService.getScoutingReportById(req.params.id, requireOrgId(req));
      if (!report) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Scouting report not found' },
        });
      }
      // Adding photos changes the report: same rule as editing it.
      const user = req.user!;
      if (!canOperateScouting(user.role) || !canEditScoutingReport(user, report)) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'You do not have permission to add photos to this report.' },
        });
      }
      const photos = await scoutingService.addScoutingPhotos(req.params.id, req.body.photos);
      res.status(201).json({ success: true, data: photos });
    } catch (error) {
      next(error);
    }
  }
);

scoutingRouter.patch(
  '/reports/:id/status',
  auth,
  validate({ params: idSchema, body: updateStatusSchema }),
  async (req: AuthRequest, res, next) => {
    try {
      // Only the pest agronomist (or the IPM admin) reviews scouting reports.
      if (!canReviewScouting(req.user!)) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Only the pest agronomist may review scouting reports.',
          },
        });
      }
      const orgId = requireOrgId(req);
      const existing = await scoutingService.getScoutingReportById(req.params.id, orgId);
      if (!existing) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Scouting report not found' },
        });
      }
      const { status, reason } = req.body as { status: scoutingService.ScoutingReviewStatus; reason?: string };
      const report = await scoutingService.updateScoutingReportStatus(
        req.params.id,
        status,
        req.user!.userId,
        orgId,
        reason,
      );
      await logAuditEvent({
        userId: req.user!.userId,
        action: 'UPDATE',
        entity: 'report',
        entityId: req.params.id,
        changes: {
          scope: 'scouting',
          status: { from: existing.status, to: report.status },
          ...(status === 'returned' ? { reason: reason?.trim() } : {}),
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      emitDataChange('scouting_report', 'update', report);
      res.json({ success: true, data: report });
    } catch (error) {
      next(error);
    }
  }
);

// ─── Scouting Summary ─────────────────────────────────────────────

scoutingRouter.get(
  '/summary',
  auth,
  validate({ query: summaryQuerySchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const query = req.query as {
        site_id?: string;
        field_id?: string;
        year?: number;
        start_date?: string;
        end_date?: string;
      };
      const summary = await scoutingSummaryService.getScoutingSummary({
        organizationId: requireOrgId(req),
        siteId: query.site_id,
        fieldId: query.field_id,
        year: query.year,
        startDate: query.start_date,
        endDate: query.end_date,
      });
      res.json({ success: true, data: summary });
    } catch (error) {
      next(error);
    }
  },
);

// ─── Stats ────────────────────────────────────────────────────────

scoutingRouter.get('/stats', auth, async (req: AuthRequest, res, next) => {
  try {
    const fieldId = req.query.field_id as string | undefined;
    const siteId = req.query.site_id as string | undefined;
    const stats = await scoutingService.getScoutingStats(requireOrgId(req), fieldId, siteId);
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
});
