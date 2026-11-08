import { Router, Response } from 'express';
import { z } from 'zod';
import { auth, authorize, AuthRequest } from '../middleware/auth';
import { requireOrgId } from '../middleware/tenant';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import * as forms from '../../services/formRegistry.service';

/**
 * Unified forms API (Persistent Form Identity layer). Read only.
 * Works with a user session or an API key (x-api-key) — e.g. Power BI "Web" source.
 *
 *   GET /forms                                   all forms (?counts=1 adds record counts)
 *   GET /forms/records/:recordId                 any record by id (form resolved automatically)
 *   GET /forms/:ref                              one form: FORM_ID, FORM_KEY or FORM_PATH (?path=… also works)
 *   GET /forms/:ref/records                      records, keyset paged (from, to, site_id, field_id, updated_since, limit, cursor)
 *   GET /forms/:ref/records/:recordId            full record: values, lines, photos, attachments, comments, relations
 *   GET /forms/:ref/export?format=csv|ndjson     whole form as a file (up to 50 000 records)
 */
export const formsRouter = Router();

formsRouter.use(auth, authorize('ceo', 'operation_manager', 'farm_manager', 'agronomist', 'pest_agronomist'));

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const recordsQuery = z.object({
  from: dateStr.optional(),
  to: dateStr.optional(),
  site_id: z.string().uuid().optional(),
  field_id: z.string().uuid().optional(),
  updated_since: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  cursor: z.string().max(200).optional(),
  values: z.enum(['0', '1']).optional(),
});
const toQuery = (q: any): forms.RecordQuery => ({
  from: q.from, to: q.to, siteId: q.site_id, fieldId: q.field_id, updatedSince: q.updated_since,
  limit: q.limit, cursor: q.cursor, includeValues: q.values !== '0',
});
const recordParams = z.object({ ref: z.string().min(1).max(255).optional(), recordId: z.string().uuid() });

formsRouter.get('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const orgId = requireOrgId(req);
  if (typeof req.query.path === 'string' && req.query.path) {
    const form = await forms.resolveForm(req.query.path, orgId);
    return res.json({ success: true, data: await forms.getFormSchema(form, orgId) });
  }
  const data = await forms.listForms(orgId, {
    includeCounts: req.query.counts === '1',
    includeRetired: req.query.retired === '1',
  });
  return res.json({ success: true, data });
}));

formsRouter.get('/records/:recordId', validate({ params: recordParams }), asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json({ success: true, data: await forms.getRecord(requireOrgId(req), req.params.recordId) });
}));

formsRouter.get('/:ref', asyncHandler(async (req: AuthRequest, res: Response) => {
  const orgId = requireOrgId(req);
  const form = await forms.resolveForm(decodeURIComponent(req.params.ref), orgId);
  res.json({ success: true, data: await forms.getFormSchema(form, orgId) });
}));

formsRouter.get('/:ref/records', validate({ query: recordsQuery }), asyncHandler(async (req: AuthRequest, res: Response) => {
  const orgId = requireOrgId(req);
  const form = await forms.resolveForm(decodeURIComponent(req.params.ref), orgId);
  const page = await forms.listRecords(form, orgId, toQuery(req.query));
  res.json({ success: true, data: page.records, form: page.form, nextCursor: page.nextCursor });
}));

formsRouter.get('/:ref/records/:recordId', validate({ params: recordParams }), asyncHandler(async (req: AuthRequest, res: Response) => {
  const orgId = requireOrgId(req);
  res.json({ success: true, data: await forms.getRecord(orgId, req.params.recordId, decodeURIComponent(String(req.params.ref))) });
}));

formsRouter.get('/:ref/export', validate({ query: recordsQuery.extend({ format: z.enum(['csv', 'ndjson']).optional() }) }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const orgId = requireOrgId(req);
    const form = await forms.resolveForm(decodeURIComponent(req.params.ref), orgId);
    const format = (req.query.format as string) || 'csv';
    const all: any[] = [];
    let cursor: string | undefined;
    do {
      // eslint-disable-next-line no-await-in-loop
      const page = await forms.listRecords(form, orgId, { ...toQuery(req.query), limit: 1000, cursor });
      all.push(...page.records);
      cursor = page.nextCursor || undefined;
    } while (cursor && all.length < 50000);
    const name = form.form_path.replace(/\//g, '_');
    if (format === 'ndjson') {
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${name}.ndjson"`);
      return res.send(all.map((r) => JSON.stringify(r)).join('\n'));
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name}.csv"`);
    return res.send(`﻿${forms.toCsv(all)}`);
  }));
