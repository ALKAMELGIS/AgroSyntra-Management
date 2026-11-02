import { Router, Response } from 'express';
import { z } from 'zod';
import { auth, authorize, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { dbPool } from '../../db/client';
import { requireOrgId } from '../middleware/tenant';
import { AppError } from '../../utils/errors';
import { createCropHistoryForPlanting } from '../../utils/cropHistoryForPlanting';
import {
  approveOpeningRecord,
  assertOpeningRowEditable,
  revokeOpeningApproval,
} from '../../services/plantationOpeningApproval.service';
import {
  assertProposerCanDelete,
  assertProposerCanEdit,
  assertSiteOperationManager,
  closingWriteModeFor,
  ClosingWriteMode,
  loadClosingRow,
  loadClosingSheet,
  notifyClosingPending,
  notifyClosingRejected,
} from '../../services/plantationClosingApproval.service';
import { logAuditEvent } from '../../services/auditLog.service';

export const plantationWorkbookRouter = Router();
plantationWorkbookRouter.use(auth);
plantationWorkbookRouter.use(
  authorize('ceo', 'farm_manager', 'operation_manager', 'agronomist', 'worker'),
);

/**
 * Opening rows (create / edit / delete / bulk) are typed by the operation
 * manager, the agronomist and the data-entry worker. CEO and farm manager only
 * watch. Approve / revoke and the closing sheet keep their own rules below.
 */
const openingRowWriters = authorize('operation_manager', 'agronomist', 'worker');

async function createCropHistoryForOpening(
  fieldId: string,
  cropId: string,
  varietyId: string | null,
  startDate: string,
  client: { query: typeof dbPool.query },
): Promise<string | null> {
  return createCropHistoryForPlanting(fieldId, cropId, varietyId, startDate, client);
}

async function ensureClosingSheets(
  siteId: string,
  orgId: string,
  cropIds: string[],
  client: { query: typeof dbPool.query },
): Promise<void> {
  const unique = [...new Set(cropIds.filter(Boolean))];
  for (const cropId of unique) {
    await client.query(
      `INSERT INTO plantation_closing_sheets (organization_id, site_id, crop_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (site_id, crop_id) DO NOTHING`,
      [orgId, siteId, cropId],
    );
  }
}

async function resolveClosingSheetId(
  body: { closingSheetId?: string; siteId?: string; cropId?: string },
  orgId: string,
  client: { query: typeof dbPool.query },
): Promise<string> {
  if (body.closingSheetId) return body.closingSheetId;
  if (!body.siteId || !body.cropId) {
    throw new AppError('closingSheetId or siteId and cropId is required', 'VALIDATION_ERROR', 400);
  }
  await ensureClosingSheets(body.siteId, orgId, [body.cropId], client);
  const found = await client.query(
    `SELECT id FROM plantation_closing_sheets
     WHERE site_id = $1 AND crop_id = $2
       AND COALESCE(organization_id, $3) = $3
     LIMIT 1`,
    [body.siteId, body.cropId, orgId],
  );
  const id = found.rows[0]?.id as string | undefined;
  if (!id) {
    throw new AppError('Closing sheet not found', 'NOT_FOUND', 404);
  }
  return id;
}

const openingSchema = z.object({
  requestedDate: z.string().optional().nullable(),
  siteCode: z.string().optional().nullable(),
  fiscalYear: z.union([z.number(), z.string()]).optional().nullable(),
  structureType: z.string().optional().nullable(),
  farmName: z.string().optional().nullable(),
  fieldId: z.string().uuid().optional().nullable(),
  section: z.string().optional().nullable(),
  cropId: z.string().uuid().optional().nullable(),
  varietyId: z.string().uuid().optional().nullable(),
  plantsOrKg: z.union([z.number(), z.string()]).optional().nullable(),
  surfaceUnit: z.string().optional().nullable(),
  surfaceArea: z.union([z.number(), z.string()]).optional().nullable(),
  budgeted: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
  requestorName: z.string().optional().nullable(),
  requestorRole: z.string().optional().nullable(),
  requestorEndorsed: z.string().optional().nullable(),
  plantationCode: z.string().optional().nullable(),
});

const closingSchema = openingSchema.extend({
  financeEndorsed: z.string().optional().nullable(),
  financeName: z.string().optional().nullable(),
  financeAddedDate: z.string().optional().nullable(),
  sageCreatedDate: z.string().optional().nullable(),
  sageCreatedBy: z.string().optional().nullable(),
  plantationDescription: z.string().optional().nullable(),
  closureRequestDate: z.string().optional().nullable(),
  closureRequestBy: z.string().optional().nullable(),
  closureFmEndorsed: z.string().optional().nullable(),
  closureFmName: z.string().optional().nullable(),
  closureHooEndorsed: z.string().optional().nullable(),
  closureHooName: z.string().optional().nullable(),
  closureFinanceEndorsed: z.string().optional().nullable(),
  closureFinanceName: z.string().optional().nullable(),
  closedDate: z.string().optional().nullable(),
  sageClosedBy: z.string().optional().nullable(),
});

function parseNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseIntYear(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

const OPENING_INSERT_COLS = `
  organization_id, site_id, requested_date, site_code, fiscal_year, structure_type, farm_name,
  field_id, section, crop_id, variety_id, plants_or_kg, surface_unit, surface_area,
  budgeted, remarks, requestor_name, requestor_role, requestor_endorsed,
  farm_manager_name, farm_manager_date, plantation_code, crop_history_id
`;

async function insertOpeningRow(
  data: z.infer<typeof openingSchema>,
  siteId: string,
  orgId: string,
  client: { query: typeof dbPool.query },
): Promise<{ id: string; crop_id: string | null }> {
  const startDate = data.requestedDate || null;
  let cropHistoryId: string | null = null;
  if (data.fieldId && data.cropId && startDate) {
    cropHistoryId = await createCropHistoryForOpening(
      data.fieldId,
      data.cropId,
      data.varietyId || null,
      startDate,
      client,
    );
  }

  const result = await client.query(
    `INSERT INTO plantation_opening_records (${OPENING_INSERT_COLS})
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
     RETURNING id, crop_id`,
    [
      orgId,
      siteId,
      data.requestedDate || null,
      data.siteCode || null,
      parseIntYear(data.fiscalYear),
      data.structureType || null,
      data.farmName || null,
      data.fieldId || null,
      data.section || null,
      data.cropId || null,
      data.varietyId || null,
      parseNum(data.plantsOrKg),
      data.surfaceUnit || null,
      parseNum(data.surfaceArea),
      data.budgeted || null,
      data.remarks || null,
      data.requestorName || null,
      data.requestorRole || null,
      data.requestorEndorsed || null,
      null,
      null,
      data.plantationCode || null,
      cropHistoryId,
    ],
  );
  return result.rows[0] as { id: string; crop_id: string | null };
}

plantationWorkbookRouter.get(
  '/workbook',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const siteId = req.query.site_id as string;
    if (!siteId) {
      res.status(400).json({ success: false, message: 'site_id required' });
      return;
    }
    const orgId = requireOrgId(req);

    const opening = await dbPool.query(
      `SELECT por.*,
              f.name AS field_name, c.name AS crop_name, cv.name AS variety_name
       FROM plantation_opening_records por
       LEFT JOIN fields f ON f.id = por.field_id
       LEFT JOIN crops c ON c.id = por.crop_id
       LEFT JOIN crop_varieties cv ON cv.id = por.variety_id
       WHERE por.site_id = $1 AND (por.organization_id IS NULL OR por.organization_id = $2)
       ORDER BY por.requested_date ASC NULLS LAST, por.created_at ASC`,
      [siteId, orgId],
    );

    const sheets = await dbPool.query(
      `SELECT pcs.*, c.name AS crop_name
       FROM plantation_closing_sheets pcs
       JOIN crops c ON c.id = pcs.crop_id
       WHERE pcs.site_id = $1 AND (pcs.organization_id IS NULL OR pcs.organization_id = $2)
       ORDER BY c.name ASC`,
      [siteId, orgId],
    );

    const sheetIds = sheets.rows.map((r: { id: string }) => r.id);
    let closingRows: unknown[] = [];
    if (sheetIds.length > 0) {
      const closing = await dbPool.query(
        `SELECT pcr.*,
                f.name AS field_name, c.name AS crop_name, cv.name AS variety_name,
                su.name AS submitted_by_name, au.name AS approved_by_name,
                ru.name AS rejected_by_name
         FROM plantation_closing_records pcr
         LEFT JOIN fields f ON f.id = pcr.field_id
         LEFT JOIN crops c ON c.id = pcr.crop_id
         LEFT JOIN crop_varieties cv ON cv.id = pcr.variety_id
         LEFT JOIN users su ON su.id = pcr.submitted_by
         LEFT JOIN users au ON au.id = pcr.approved_by
         LEFT JOIN users ru ON ru.id = pcr.rejected_by
         WHERE pcr.closing_sheet_id = ANY($1)
         ORDER BY pcr.requested_date ASC NULLS LAST, pcr.created_at ASC`,
        [sheetIds],
      );
      closingRows = closing.rows;
    }

    res.json({
      success: true,
      data: {
        opening: opening.rows,
        closingSheets: sheets.rows,
        closingRecords: closingRows,
      },
    });
  }),
);

plantationWorkbookRouter.post(
  '/opening',
  openingRowWriters,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const siteId = z.string().uuid().parse(req.body.siteId);
    const data = openingSchema.parse(req.body);
    const orgId = requireOrgId(req);

    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');
      const row = await insertOpeningRow(data, siteId, orgId, client);
      if (row.crop_id) {
        await ensureClosingSheets(siteId, orgId, [row.crop_id], client);
      }
      await client.query('COMMIT');
      res.status(201).json({ success: true, data: { id: row.id } });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }),
);

plantationWorkbookRouter.put(
  '/opening/:id',
  openingRowWriters,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const siteId = z.string().uuid().parse(req.body.siteId);
    const data = openingSchema.parse(req.body);
    const orgId = requireOrgId(req);

    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');
      // Lock check first (row held FOR UPDATE) so nothing, crop history included,
      // is written for an approved row.
      await assertOpeningRowEditable(id, orgId, client, { siteId, forUpdate: true });
      const startDate = data.requestedDate || null;
      let cropHistoryId: string | null = null;
      if (data.fieldId && data.cropId && startDate) {
        cropHistoryId = await createCropHistoryForOpening(
          data.fieldId,
          data.cropId,
          data.varietyId || null,
          startDate,
          client,
        );
      }

      await client.query(
        `UPDATE plantation_opening_records SET
          requested_date = $1, site_code = $2, fiscal_year = $3, structure_type = $4, farm_name = $5,
          field_id = $6, section = $7, crop_id = $8, variety_id = $9, plants_or_kg = $10,
          surface_unit = $11, surface_area = $12, budgeted = $13, remarks = $14,
          requestor_name = $15, requestor_role = $16, requestor_endorsed = $17,
          plantation_code = $18,
          crop_history_id = COALESCE($19, crop_history_id), updated_at = NOW()
         WHERE id = $20 AND site_id = $21 AND (organization_id IS NULL OR organization_id = $22)
           AND farm_manager_approved IS NOT TRUE`,
        [
          data.requestedDate || null,
          data.siteCode || null,
          parseIntYear(data.fiscalYear),
          data.structureType || null,
          data.farmName || null,
          data.fieldId || null,
          data.section || null,
          data.cropId || null,
          data.varietyId || null,
          parseNum(data.plantsOrKg),
          data.surfaceUnit || null,
          parseNum(data.surfaceArea),
          data.budgeted || null,
          data.remarks || null,
          data.requestorName || null,
          data.requestorRole || null,
          data.requestorEndorsed || null,
          data.plantationCode || null,
          cropHistoryId,
          id,
          siteId,
          orgId,
        ],
      );
      if (data.cropId) {
        await ensureClosingSheets(siteId, orgId, [data.cropId], client);
      }
      await client.query('COMMIT');
      res.json({ success: true });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }),
);

plantationWorkbookRouter.delete(
  '/opening/:id',
  openingRowWriters,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const orgId = requireOrgId(req);
    await assertOpeningRowEditable(id, orgId);
    await dbPool.query(
      `DELETE FROM plantation_opening_records
       WHERE id = $1 AND COALESCE(organization_id, $2) = $2
         AND farm_manager_approved IS NOT TRUE`,
      [id, orgId],
    );
    res.json({ success: true });
  }),
);

plantationWorkbookRouter.post(
  '/opening/bulk',
  openingRowWriters,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const siteId = z.string().uuid().parse(req.body.siteId);
    const records = z.array(openingSchema).parse(req.body.records);
    const orgId = requireOrgId(req);

    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');
      const cropIds: string[] = [];
      for (const rec of records) {
        const row = await insertOpeningRow(rec, siteId, orgId, client);
        if (row.crop_id) cropIds.push(row.crop_id);
      }
      await ensureClosingSheets(siteId, orgId, cropIds, client);
      await client.query('COMMIT');
      res.json({ success: true, data: { count: records.length } });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }),
);

function requestUser(req: AuthRequest) {
  const user = req.user;
  if (!user?.userId) {
    throw new AppError('Unauthorized', 'UNAUTHORIZED', 401);
  }
  return user;
}

async function approveOpening(req: AuthRequest, res: Response) {
  const orgId = requireOrgId(req);
  const user = requestUser(req);
  const data = await approveOpeningRecord(req.params.id, orgId, user, {
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });
  res.json({ success: true, data });
}

plantationWorkbookRouter.put(
  '/opening/:id/farm-manager-approval',
  asyncHandler(approveOpening),
);

plantationWorkbookRouter.put(
  '/opening/:id/operation-manager-approval',
  asyncHandler(approveOpening),
);

const revokeSchema = z.object({
  reason: z.string().trim().min(1, 'A reason is required to undo an approval'),
});

/** Undo an Operation Manager approval (site OM only, reason required, audited). */
plantationWorkbookRouter.put(
  '/opening/:id/operation-manager-approval/revoke',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    // safeParse: the error handler turns a raw ZodError into a 500, so map it to 400 here.
    const parsed = revokeSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new AppError('A reason is required to undo an approval', 'VALIDATION_ERROR', 400);
    }
    const { reason } = parsed.data;
    const orgId = requireOrgId(req);
    const user = requestUser(req);
    await revokeOpeningApproval(req.params.id, orgId, user, reason, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    res.json({ success: true });
  }),
);

// ---------------------------------------------------------------------------
// Closing rows. The site's Operation Manager writes live (approved); a worker or
// agronomist writes pending rows that the site OM approves or rejects. CEO and
// farm manager are view-only. See plantationClosingApproval.service.ts.

type ClosingData = z.infer<typeof closingSchema>;

type Tx = { query: typeof dbPool.query };

/** The 33 data columns shared by insert and update, in column order. */
function closingDataValues(data: ClosingData): unknown[] {
  return [
    data.requestedDate || null,
    data.siteCode || null,
    parseIntYear(data.fiscalYear),
    data.structureType || null,
    data.farmName || null,
    data.fieldId || null,
    data.section || null,
    data.cropId || null,
    data.varietyId || null,
    parseNum(data.plantsOrKg),
    data.surfaceUnit || null,
    parseNum(data.surfaceArea),
    data.budgeted || null,
    data.remarks || null,
    data.requestorRole || null,
    data.requestorEndorsed || null,
    data.financeEndorsed || null,
    data.financeName || null,
    data.financeAddedDate || null,
    data.sageCreatedDate || null,
    data.sageCreatedBy || null,
    data.plantationCode || null,
    data.plantationDescription || null,
    data.closureRequestDate || null,
    data.closureRequestBy || null,
    data.closureFmEndorsed || null,
    data.closureFmName || null,
    data.closureHooEndorsed || null,
    data.closureHooName || null,
    data.closureFinanceEndorsed || null,
    data.closureFinanceName || null,
    data.closedDate || null,
    data.sageClosedBy || null,
  ];
}

function statusFor(mode: ClosingWriteMode): 'approved' | 'pending' {
  return mode === 'live' ? 'approved' : 'pending';
}

async function insertClosingRow(
  data: ClosingData,
  closingSheetId: string,
  orgId: string,
  userId: string,
  mode: ClosingWriteMode,
  db: Tx,
): Promise<string> {
  const result = await db.query(
    `INSERT INTO plantation_closing_records (
      organization_id, closing_sheet_id, requested_date, site_code, fiscal_year, structure_type,
      farm_name, field_id, section, crop_id, variety_id, plants_or_kg, surface_unit, surface_area,
      budgeted, remarks, requestor_role, requestor_endorsed, finance_endorsed, finance_name,
      finance_added_date, sage_created_date, sage_created_by, plantation_code, plantation_description,
      closure_request_date, closure_request_by, closure_fm_endorsed, closure_fm_name,
      closure_hoo_endorsed, closure_hoo_name, closure_finance_endorsed, closure_finance_name,
      closed_date, sage_closed_by,
      approval_status, submitted_by, submitted_at, approved_by, approved_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,
      $36,$37,NOW(),$38,$39
    ) RETURNING id`,
    [
      orgId,
      closingSheetId,
      ...closingDataValues(data),
      statusFor(mode),
      userId,
      mode === 'live' ? userId : null,
      mode === 'live' ? new Date() : null,
    ],
  );
  return result.rows[0].id as string;
}

const CLOSING_LIVE_SET = `approval_status = 'approved', approved_by = $34, approved_at = NOW(),
  rejected_reason = NULL, rejected_by = NULL, rejected_at = NULL`;
const CLOSING_PENDING_SET = `approval_status = 'pending', submitted_by = $34, submitted_at = NOW(),
  approved_by = NULL, approved_at = NULL, rejected_reason = NULL, rejected_by = NULL, rejected_at = NULL`;

function auditMeta(req: AuthRequest) {
  return { ipAddress: req.ip, userAgent: req.headers['user-agent'] };
}

async function inTransaction<T>(fn: (client: Tx) => Promise<T>): Promise<T> {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

plantationWorkbookRouter.post(
  '/closing',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const closingSheetId = z.string().uuid().parse(req.body.closingSheetId);
    const data = closingSchema.parse(req.body);
    const orgId = requireOrgId(req);
    const user = requestUser(req);

    const sheet = await loadClosingSheet(closingSheetId, orgId);
    const mode = await closingWriteModeFor(user, sheet.site_id);
    const id = await insertClosingRow(data, sheet.id, orgId, user.userId, mode, dbPool);
    if (mode === 'pending') await notifyClosingPending(sheet.site_id, orgId, sheet.id, 1);
    res.status(201).json({ success: true, data: { id, approvalStatus: statusFor(mode) } });
  }),
);

plantationWorkbookRouter.put(
  '/closing/:id',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const data = closingSchema.parse(req.body);
    const orgId = requireOrgId(req);
    const user = requestUser(req);

    const { row, mode } = await inTransaction(async (client) => {
      const row = await loadClosingRow(id, orgId, client, { forUpdate: true });
      const mode = await closingWriteModeFor(user, row.site_id, client);
      if (mode === 'pending') assertProposerCanEdit(row);
      await client.query(
        `UPDATE plantation_closing_records SET
          requested_date = $1, site_code = $2, fiscal_year = $3, structure_type = $4, farm_name = $5,
          field_id = $6, section = $7, crop_id = $8, variety_id = $9, plants_or_kg = $10,
          surface_unit = $11, surface_area = $12, budgeted = $13, remarks = $14,
          requestor_role = $15, requestor_endorsed = $16, finance_endorsed = $17, finance_name = $18,
          finance_added_date = $19, sage_created_date = $20, sage_created_by = $21,
          plantation_code = $22, plantation_description = $23, closure_request_date = $24,
          closure_request_by = $25, closure_fm_endorsed = $26, closure_fm_name = $27,
          closure_hoo_endorsed = $28, closure_hoo_name = $29, closure_finance_endorsed = $30,
          closure_finance_name = $31, closed_date = $32, sage_closed_by = $33,
          ${mode === 'live' ? CLOSING_LIVE_SET : CLOSING_PENDING_SET}, updated_at = NOW()
         WHERE id = $35`,
        [...closingDataValues(data), user.userId, id],
      );
      return { row, mode };
    });

    if (mode === 'pending') await notifyClosingPending(row.site_id, orgId, row.closing_sheet_id, 1);
    res.json({ success: true, data: { approvalStatus: statusFor(mode) } });
  }),
);

plantationWorkbookRouter.delete(
  '/closing/:id',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const orgId = requireOrgId(req);
    const user = requestUser(req);

    await inTransaction(async (client) => {
      const row = await loadClosingRow(id, orgId, client, { forUpdate: true });
      const mode = await closingWriteModeFor(user, row.site_id, client);
      if (mode === 'pending') assertProposerCanDelete(row, user);
      await client.query(`DELETE FROM plantation_closing_records WHERE id = $1`, [id]);
    });
    res.json({ success: true });
  }),
);

plantationWorkbookRouter.post(
  '/closing/bulk',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const body = z.object({
      closingSheetId: z.string().uuid().optional(),
      siteId: z.string().uuid().optional(),
      cropId: z.string().uuid().optional(),
      records: z.array(closingSchema),
    }).parse(req.body);
    const orgId = requireOrgId(req);
    const user = requestUser(req);

    const { sheet, mode } = await inTransaction(async (client) => {
      const sheetId = await resolveClosingSheetId(body, orgId, client);
      const sheet = await loadClosingSheet(sheetId, orgId, client);
      const mode = await closingWriteModeFor(user, sheet.site_id, client);
      for (const data of body.records) {
        await insertClosingRow(data, sheet.id, orgId, user.userId, mode, client);
      }
      return { sheet, mode };
    });

    if (mode === 'pending') {
      await notifyClosingPending(sheet.site_id, orgId, sheet.id, body.records.length);
    }
    res.json({
      success: true,
      data: { count: body.records.length, approvalStatus: statusFor(mode) },
    });
  }),
);

plantationWorkbookRouter.post(
  '/closing/approve-all',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const parsed = z.object({ closingSheetId: z.string().uuid() }).safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new AppError('closingSheetId is required', 'VALIDATION_ERROR', 400);
    }
    const orgId = requireOrgId(req);
    const user = requestUser(req);

    const { sheet, ids } = await inTransaction(async (client) => {
      const sheet = await loadClosingSheet(parsed.data.closingSheetId, orgId, client);
      await assertSiteOperationManager(user, sheet.site_id, client);
      const updated = await client.query(
        `UPDATE plantation_closing_records SET
          approval_status = 'approved', approved_by = $1, approved_at = NOW(), updated_at = NOW()
         WHERE closing_sheet_id = $2 AND approval_status = 'pending'
           AND (organization_id IS NULL OR organization_id = $3)
         RETURNING id`,
        [user.userId, sheet.id, orgId],
      );
      return { sheet, ids: updated.rows.map((r: { id: string }) => r.id) };
    });

    if (ids.length > 0) {
      await logAuditEvent({
        userId: user.userId,
        action: 'APPROVE',
        entity: 'plantation_closing',
        entityId: sheet.id,
        changes: { approval_status: { from: 'pending', to: 'approved' } },
        metadata: {
          type: 'plantation_closing_approved_all',
          siteId: sheet.site_id,
          closingSheetId: sheet.id,
          count: ids.length,
          recordIds: ids,
        },
        ...auditMeta(req),
      });
    }
    res.json({ success: true, data: { approved: ids.length } });
  }),
);

plantationWorkbookRouter.post(
  '/closing/:id/approve',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const orgId = requireOrgId(req);
    const user = requestUser(req);

    const row = await inTransaction(async (client) => {
      const row = await loadClosingRow(id, orgId, client, { forUpdate: true });
      await assertSiteOperationManager(user, row.site_id, client);
      if (row.approval_status === 'approved') {
        throw new AppError('This closing row is already approved', 'CONFLICT', 409);
      }
      await client.query(
        `UPDATE plantation_closing_records SET
          approval_status = 'approved', approved_by = $1, approved_at = NOW(),
          rejected_reason = NULL, rejected_by = NULL, rejected_at = NULL, updated_at = NOW()
         WHERE id = $2`,
        [user.userId, id],
      );
      return row;
    });

    await logAuditEvent({
      userId: user.userId,
      action: 'APPROVE',
      entity: 'plantation_closing',
      entityId: id,
      changes: { approval_status: { from: row.approval_status, to: 'approved' } },
      metadata: {
        type: 'plantation_closing_approved',
        siteId: row.site_id,
        closingSheetId: row.closing_sheet_id,
      },
      ...auditMeta(req),
    });
    res.json({ success: true, data: { approvalStatus: 'approved' } });
  }),
);

const closingRejectSchema = z.object({
  reason: z.string().trim().min(1, 'A reason is required to reject a row'),
});

plantationWorkbookRouter.post(
  '/closing/:id/reject',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const parsed = closingRejectSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new AppError('A reason is required to reject a row', 'VALIDATION_ERROR', 400);
    }
    const { reason } = parsed.data;
    const { id } = req.params;
    const orgId = requireOrgId(req);
    const user = requestUser(req);

    const row = await inTransaction(async (client) => {
      const row = await loadClosingRow(id, orgId, client, { forUpdate: true });
      await assertSiteOperationManager(user, row.site_id, client);
      if (row.approval_status !== 'pending') {
        throw new AppError('Only pending closing rows can be rejected', 'CONFLICT', 409);
      }
      await client.query(
        `UPDATE plantation_closing_records SET
          approval_status = 'rejected', rejected_reason = $1, rejected_by = $2, rejected_at = NOW(),
          approved_by = NULL, approved_at = NULL, updated_at = NOW()
         WHERE id = $3`,
        [reason, user.userId, id],
      );
      return row;
    });

    await logAuditEvent({
      userId: user.userId,
      action: 'UPDATE',
      entity: 'plantation_closing',
      entityId: id,
      changes: { approval_status: { from: 'pending', to: 'rejected' } },
      metadata: {
        type: 'plantation_closing_rejected',
        siteId: row.site_id,
        closingSheetId: row.closing_sheet_id,
        reason,
      },
      ...auditMeta(req),
    });
    await notifyClosingRejected(row.submitted_by, id, reason);
    res.json({ success: true, data: { approvalStatus: 'rejected' } });
  }),
);
