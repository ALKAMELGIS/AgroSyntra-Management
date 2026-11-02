import { Router, Response } from 'express';
import { z } from 'zod';
import { auth } from '../middleware/auth';
import { AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../middleware/validate';
import { requireOrgId } from '../middleware/tenant';
import { assertFieldInOrganization, assertSiteInOrganization } from '../../utils/tenantValidation';
import {
  listSheets,
  createSheet,
  listRecords,
  listRecordsForSite,
  createRecord,
  updateRecord,
  deleteRecord,
  getSummary,
  assertSheetAccess,
  bulkImport,
} from '../../services/irrigationRecord.service';
import { assertCanOperateDataEntry } from '../../utils/roleAccess';

export const irrigationRecordRouter = Router();
irrigationRecordRouter.use(auth);

const sheetQuerySchema = z.object({
  site_id: z.string().uuid(),
  year: z.coerce.number().int().min(2000).max(2100),
});

const createSheetSchema = z.object({
  siteId: z.string().uuid(),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  farmName: z.string().optional(),
});

const recordIdSchema = z.object({ id: z.string().uuid() });

const recordBodySchema = z.object({
  monthSheetId: z.string().uuid(),
  fieldId: z.string().uuid(),
  date: z.string().min(1),
  segmentId: z.string().optional(),
  areaHa: z.number().optional(),
  crop: z.string().optional(),
  flowRateM3Hr: z.number().optional(),
  cycleDurationHr: z.number().optional(),
  authorizedBy: z.string().optional(),
});

const updateRecordSchema = recordBodySchema.partial().omit({ monthSheetId: true });

const importRecordSchema = z.object({
  fieldId: z.string().uuid(),
  date: z.string().min(1),
  segmentId: z.string().optional(),
  areaHa: z.number().optional(),
  crop: z.string().optional(),
  flowRateM3Hr: z.number().optional(),
  cycleDurationHr: z.number().optional(),
  authorizedBy: z.string().optional(),
});

const importBodySchema = z.object({
  siteId: z.string().uuid(),
  year: z.coerce.number().int().min(2000).max(2100),
  farmName: z.string().optional(),
  sheets: z.array(z.object({
    month: z.coerce.number().int().min(1).max(12),
    mode: z.enum(['merge', 'replace']),
    records: z.array(importRecordSchema),
  })),
});

irrigationRecordRouter.get(
  '/sheets',
  validate({ query: sheetQuerySchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { site_id, year } = req.query as unknown as { site_id: string; year: number };
    await assertSiteInOrganization(site_id, requireOrgId(req));
    const data = await listSheets(site_id, year);
    res.json({ success: true, data });
  })
);

irrigationRecordRouter.post(
  '/sheets',
  validate({ body: createSheetSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    assertCanOperateDataEntry(req.user!);
    const { siteId, year, month, farmName } = req.body;
    await assertSiteInOrganization(siteId, requireOrgId(req));
    const data = await createSheet(siteId, year, month, farmName);
    res.status(201).json({ success: true, data });
  })
);

irrigationRecordRouter.get(
  '/summary',
  validate({ query: sheetQuerySchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { site_id, year } = req.query as unknown as { site_id: string; year: number };
    await assertSiteInOrganization(site_id, requireOrgId(req));
    const data = await getSummary(site_id, year);
    res.json({ success: true, data });
  })
);

const siteRecordsQuerySchema = z.object({
  site_id: z.string().uuid(),
  field_id: z.string().uuid().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});

irrigationRecordRouter.get(
  '/records-by-site',
  validate({ query: siteRecordsQuerySchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { site_id, field_id, start_date, end_date } = req.query as unknown as {
      site_id: string;
      field_id?: string;
      start_date?: string;
      end_date?: string;
    };
    const orgId = requireOrgId(req);
    await assertSiteInOrganization(site_id, orgId);
    if (field_id) await assertFieldInOrganization(field_id, orgId);
    const data = await listRecordsForSite({
      siteId: site_id,
      fieldId: field_id,
      startDate: start_date,
      endDate: end_date,
    });
    res.json({ success: true, data });
  })
);

irrigationRecordRouter.get(
  '/records',
  validate({ query: z.object({ month_sheet_id: z.string().uuid() }) }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { month_sheet_id } = req.query as unknown as { month_sheet_id: string };
    const data = await listRecords(month_sheet_id);
    res.json({ success: true, data });
  })
);

irrigationRecordRouter.post(
  '/records',
  validate({ body: recordBodySchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    assertCanOperateDataEntry(req.user!);
    const data = await createRecord(req.body);
    res.status(201).json({ success: true, data });
  })
);

irrigationRecordRouter.put(
  '/records/:id',
  validate({ params: recordIdSchema, body: updateRecordSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    assertCanOperateDataEntry(req.user!);
    const data = await updateRecord(req.params.id, req.body);
    res.json({ success: true, data });
  })
);

irrigationRecordRouter.post(
  '/import',
  validate({ body: importBodySchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    assertCanOperateDataEntry(req.user!);
    const { siteId, year, farmName, sheets } = req.body;
    await assertSiteInOrganization(siteId, requireOrgId(req));
    const data = await bulkImport(siteId, year, farmName, sheets);
    res.status(201).json({ success: true, data });
  })
);

irrigationRecordRouter.delete(
  '/records/:id',
  validate({ params: recordIdSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    assertCanOperateDataEntry(req.user!);
    await deleteRecord(req.params.id);
    res.json({ success: true });
  })
);
