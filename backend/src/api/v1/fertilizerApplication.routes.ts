import { Router, Response } from 'express';
import { z } from 'zod';
import { auth, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../middleware/validate';
import {
  listFertilizerProducts,
  upsertFertilizerProduct,
  syncFertilizerProducts,
  getWorkbook,
  ensureWorkbook,
  listRecords,
  createRecord,
  updateRecord,
  deleteRecord,
  bulkImport,
} from '../../services/fertilizerApplication.service';
import { requireOrgId } from '../middleware/tenant';
import { assertFieldInOrganization, assertSiteInOrganization } from '../../utils/tenantValidation';
import { requireDataEntryWriter } from '../middleware/dataEntryWrite';

export const fertilizerApplicationRouter = Router();
fertilizerApplicationRouter.use(auth);
// Reads stay open to every signed-in role; records, import, workbook and the
// fertilizer product list are written by the data-entry worker and agronomist only.
fertilizerApplicationRouter.use(requireDataEntryWriter);

const getOrgId = (req: AuthRequest) => requireOrgId(req);

const recordsQuerySchema = z.object({
  site_id: z.string().uuid(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  field_id: z.string().uuid().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});

const recordIdSchema = z.object({ id: z.string().uuid() });

const recordBodySchema = z.object({
  siteId: z.string().uuid(),
  fieldId: z.string().uuid(),
  date: z.string().min(1),
  segmentId: z.string().optional(),
  areaHa: z.number().optional(),
  crop: z.string().optional(),
  fertilizerProductId: z.string().uuid().optional(),
  fertilizerName: z.string().min(1),
  fertilizerTypeConc: z.string().optional(),
  totalKg: z.number().optional(),
  operatorName: z.string().optional(),
  authorizedBy: z.string().optional(),
  misNo: z.string().optional(),
  docNo: z.string().optional(),
});

const updateRecordSchema = recordBodySchema.partial().omit({ siteId: true });

const productBodySchema = z.object({
  name: z.string().min(1),
  typeConc: z.string().optional(),
});

const workbookBodySchema = z.object({
  siteId: z.string().uuid(),
  farmName: z.string().optional(),
});

const importRecordSchema = z.object({
  fieldId: z.string().uuid(),
  date: z.string().min(1),
  segmentId: z.string().optional(),
  areaHa: z.number().optional(),
  crop: z.string().optional(),
  fertilizerName: z.string().min(1),
  fertilizerTypeConc: z.string().optional(),
  totalKg: z.number().optional(),
  operatorName: z.string().optional(),
  authorizedBy: z.string().optional(),
  misNo: z.string().optional(),
  docNo: z.string().optional(),
});

const importBodySchema = z.object({
  siteId: z.string().uuid(),
  farmName: z.string().optional(),
  mode: z.enum(['merge', 'replace']),
  records: z.array(importRecordSchema),
});

fertilizerApplicationRouter.get(
  '/fertilizer-products',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = await listFertilizerProducts(getOrgId(req));
    res.json({ success: true, data });
  })
);

fertilizerApplicationRouter.post(
  '/fertilizer-products',
  validate({ body: productBodySchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { name, typeConc } = req.body;
    const data = await upsertFertilizerProduct(getOrgId(req), name, typeConc);
    res.status(201).json({ success: true, data });
  })
);

fertilizerApplicationRouter.post(
  '/fertilizer-products/sync',
  validate({ body: z.object({ names: z.array(z.string().min(1)) }) }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { names } = req.body;
    const data = await syncFertilizerProducts(getOrgId(req), names);
    res.status(201).json({ success: true, data });
  })
);

fertilizerApplicationRouter.get(
  '/workbook',
  validate({ query: z.object({ site_id: z.string().uuid() }) }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { site_id } = req.query as unknown as { site_id: string };
    await assertSiteInOrganization(site_id, requireOrgId(req));
    const data = await getWorkbook(site_id);
    res.json({ success: true, data });
  })
);

fertilizerApplicationRouter.post(
  '/workbook',
  validate({ body: workbookBodySchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { siteId, farmName } = req.body;
    await assertSiteInOrganization(siteId, requireOrgId(req));
    const data = await ensureWorkbook(siteId, farmName);
    res.status(201).json({ success: true, data });
  })
);

fertilizerApplicationRouter.get(
  '/records',
  validate({ query: recordsQuerySchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { site_id, year, field_id, start_date, end_date } = req.query as unknown as {
      site_id: string;
      year?: number;
      field_id?: string;
      start_date?: string;
      end_date?: string;
    };
    const orgId = requireOrgId(req);
    await assertSiteInOrganization(site_id, orgId);
    const data = await listRecords({
      siteId: site_id,
      organizationId: orgId,
      year,
      fieldId: field_id,
      startDate: start_date,
      endDate: end_date,
    });
    res.json({ success: true, data });
  })
);

fertilizerApplicationRouter.post(
  '/records',
  validate({ body: recordBodySchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const orgId = requireOrgId(req);
    await assertSiteInOrganization(req.body.siteId, orgId);
    await assertFieldInOrganization(req.body.fieldId, orgId);
    const data = await createRecord(req.body);
    res.status(201).json({ success: true, data });
  })
);

fertilizerApplicationRouter.put(
  '/records/:id',
  validate({ params: recordIdSchema, body: updateRecordSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = await updateRecord(req.params.id, req.body);
    res.json({ success: true, data });
  })
);

fertilizerApplicationRouter.delete(
  '/records/:id',
  validate({ params: recordIdSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    await deleteRecord(req.params.id);
    res.json({ success: true });
  })
);

fertilizerApplicationRouter.post(
  '/import',
  validate({ body: importBodySchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { siteId, farmName, mode, records } = req.body;
    await assertSiteInOrganization(siteId, requireOrgId(req));
    const data = await bulkImport(getOrgId(req), siteId, farmName, mode, records);
    res.status(201).json({ success: true, data });
  })
);
