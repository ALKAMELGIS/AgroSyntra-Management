/**
 * Plantation closing rows: the site Operation Manager writes live, workers and
 * agronomists write pending rows the OM approves or rejects; CEO and farm
 * manager are view-only. Exercised through the real router and error handler on
 * an ephemeral port, with an in-memory database fake that answers by SQL shape.
 */
jest.mock('../../db/client', () => ({
  dbPool: { query: jest.fn(), connect: jest.fn() },
}));
jest.mock('../middleware/auth', () => ({
  auth: (req: any, _res: any, next: any) => {
    const raw = req.headers['x-test-user'];
    if (raw) req.user = JSON.parse(String(raw));
    next();
  },
  authorize: () => (_req: any, _res: any, next: any) => next(),
}));
jest.mock('../middleware/tenant', () => ({
  requireOrgId: () => 'org-1',
}));
jest.mock('../../services/auditLog.service', () => ({
  logAuditEvent: jest.fn(async () => undefined),
}));
jest.mock('../../services/userNotify.service', () => ({
  notifyUser: jest.fn(async () => undefined),
  notifyUsersByRoles: jest.fn(async () => undefined),
}));
jest.mock('../v1/health.routes', () => ({ incrementErrorCount: jest.fn() }));
jest.mock('../../utils/sentry', () => ({ captureException: jest.fn() }));
jest.mock('../../utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { dbPool } from '../../db/client';
import { logAuditEvent } from '../../services/auditLog.service';
import { notifyUser } from '../../services/userNotify.service';
import { plantationWorkbookRouter } from '../v1/plantationWorkbook.routes';
import { errorHandler } from '../middleware/errorHandler';

const SITE = '11111111-1111-4111-8111-111111111111';
const SITE2 = '33333333-3333-4333-8333-333333333333';
const SHEET = '44444444-4444-4444-8444-444444444444';
const FOREIGN_SHEET = '55555555-5555-4555-8555-555555555555';
const CROP = '66666666-6666-4666-8666-666666666666';
const ROW = '22222222-2222-4222-8222-222222222222';

const OM = { userId: 'om-1', role: 'operation_manager', email: 'om@example.com' };
const OTHER_SITE_OM = { userId: 'om-2', role: 'operation_manager', email: 'om2@example.com' };
const WORKER = { userId: 'w-1', role: 'worker', email: 'w@example.com' };
const WORKER2 = { userId: 'w-2', role: 'worker', email: 'w2@example.com' };
const AGRONOMIST = { userId: 'ag-1', role: 'agronomist', email: 'ag@example.com' };
const FARM_MANAGER = { userId: 'fm-1', role: 'farm_manager', email: 'fm@example.com' };
const CEO = { userId: 'ceo-1', role: 'ceo', email: 'ceo@example.com' };

interface ClosingRow {
  id: string;
  closing_sheet_id: string;
  remarks: string | null;
  approval_status: 'approved' | 'pending' | 'rejected';
  submitted_by: string | null;
  approved_by: string | null;
  rejected_reason: string | null;
  rejected_by: string | null;
}

const sheets = new Map([
  [SHEET, { id: SHEET, site_id: SITE, organization_id: 'org-1', crop_id: CROP }],
  [FOREIGN_SHEET, { id: FOREIGN_SHEET, site_id: SITE2, organization_id: 'org-2', crop_id: CROP }],
]);
const assignments = new Set([
  `${OM.userId}:${SITE}`,
  `${OTHER_SITE_OM.userId}:${SITE2}`,
  `${WORKER.userId}:${SITE}`,
  `${FARM_MANAGER.userId}:${SITE}`,
]);

let rows: Map<string, ClosingRow>;
let openingInserts: number;
let closingSheetEnsures: unknown[][];
let nextId: number;

function row(overrides: Partial<ClosingRow> = {}): ClosingRow {
  return {
    id: ROW,
    closing_sheet_id: SHEET,
    remarks: 'original',
    approval_status: 'approved',
    submitted_by: OM.userId,
    approved_by: OM.userId,
    rejected_reason: null,
    rejected_by: null,
    ...overrides,
  };
}

const query = jest.fn(async (sql: string, params: unknown[] = []) => {
  const text = sql.replace(/\s+/g, ' ').trim();
  if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(text)) return { rows: [], rowCount: 0 };

  if (text.startsWith('SELECT 1 FROM user_site_assignments')) {
    const hit = assignments.has(`${params[0]}:${params[1]}`);
    return { rows: hit ? [{ '?column?': 1 }] : [], rowCount: hit ? 1 : 0 };
  }
  if (text.startsWith('SELECT u.id FROM users u JOIN user_site_assignments')) {
    const ids = assignments.has(`${OM.userId}:${params[0]}`) ? [{ id: OM.userId }] : [];
    return { rows: ids, rowCount: ids.length };
  }
  if (text.startsWith('INSERT INTO plantation_closing_sheets')) {
    closingSheetEnsures.push(params);
    return { rows: [], rowCount: 1 };
  }
  if (text.startsWith('SELECT id FROM plantation_closing_sheets')) {
    const s = [...sheets.values()].find((x) => x.site_id === params[0] && x.crop_id === params[1]);
    return { rows: s ? [{ id: s.id }] : [], rowCount: s ? 1 : 0 };
  }
  if (text.startsWith('SELECT id, site_id FROM plantation_closing_sheets')) {
    const s = sheets.get(params[0] as string);
    if (!s || (s.organization_id && s.organization_id !== params[1])) return { rows: [], rowCount: 0 };
    return { rows: [{ id: s.id, site_id: s.site_id }], rowCount: 1 };
  }
  if (text.startsWith('SELECT pcr.id, pcr.closing_sheet_id')) {
    const r = rows.get(params[0] as string);
    if (!r) return { rows: [], rowCount: 0 };
    const s = sheets.get(r.closing_sheet_id)!;
    return {
      rows: [{
        id: r.id,
        closing_sheet_id: r.closing_sheet_id,
        approval_status: r.approval_status,
        submitted_by: r.submitted_by,
        site_id: s.site_id,
      }],
      rowCount: 1,
    };
  }
  if (text.startsWith('INSERT INTO plantation_closing_records')) {
    const id = `new-${nextId++}`;
    rows.set(id, {
      id,
      closing_sheet_id: params[1] as string,
      remarks: params[15] as string | null,
      approval_status: params[35] as ClosingRow['approval_status'],
      submitted_by: params[36] as string,
      approved_by: params[37] as string | null,
      rejected_reason: null,
      rejected_by: null,
    });
    return { rows: [{ id }], rowCount: 1 };
  }
  if (text.startsWith('UPDATE plantation_closing_records SET requested_date')) {
    const r = rows.get(params[34] as string)!;
    r.remarks = params[13] as string | null;
    r.rejected_reason = null;
    r.rejected_by = null;
    if (text.includes("approval_status = 'approved'")) {
      r.approval_status = 'approved';
      r.approved_by = params[33] as string;
    } else {
      r.approval_status = 'pending';
      r.submitted_by = params[33] as string;
      r.approved_by = null;
    }
    return { rows: [], rowCount: 1 };
  }
  if (text.startsWith("UPDATE plantation_closing_records SET approval_status = 'approved'")) {
    if (text.includes('WHERE closing_sheet_id')) {
      const hit = [...rows.values()].filter(
        (r) => r.closing_sheet_id === params[1] && r.approval_status === 'pending',
      );
      for (const r of hit) Object.assign(r, { approval_status: 'approved', approved_by: params[0] });
      return { rows: hit.map((r) => ({ id: r.id })), rowCount: hit.length };
    }
    const r = rows.get(params[1] as string)!;
    Object.assign(r, { approval_status: 'approved', approved_by: params[0], rejected_reason: null });
    return { rows: [], rowCount: 1 };
  }
  if (text.startsWith("UPDATE plantation_closing_records SET approval_status = 'rejected'")) {
    const r = rows.get(params[2] as string)!;
    Object.assign(r, { approval_status: 'rejected', rejected_reason: params[0], rejected_by: params[1] });
    return { rows: [], rowCount: 1 };
  }
  if (text.startsWith('DELETE FROM plantation_closing_records')) {
    rows.delete(params[0] as string);
    return { rows: [], rowCount: 1 };
  }
  if (text.startsWith('INSERT INTO plantation_opening_records')) {
    openingInserts++;
    return { rows: [{ id: `op-${openingInserts}`, crop_id: params[9] }], rowCount: 1 };
  }
  throw new Error(`Unexpected SQL in test: ${text.slice(0, 80)}`);
});

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/pw', plantationWorkbookRouter);
  app.use(errorHandler);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/pw`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  rows = new Map([[ROW, row()]]);
  openingInserts = 0;
  closingSheetEnsures = [];
  nextId = 1;
  query.mockClear();
  (logAuditEvent as jest.Mock).mockClear();
  (notifyUser as jest.Mock).mockClear();
  (dbPool.query as jest.Mock).mockImplementation(query);
  (dbPool.connect as jest.Mock).mockResolvedValue({ query, release: jest.fn() });
});

async function call(method: string, path: string, user: object, body?: unknown) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-test-user': JSON.stringify(user) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json()) as any;
  return { status: res.status, json };
}

const newRow = { closingSheetId: SHEET, remarks: 'new' };
const editBody = { remarks: 'changed' };

describe('saving closing rows', () => {
  it('the site OM writes live (approved) and nobody is notified', async () => {
    const res = await call('POST', '/closing', OM, newRow);
    expect(res.status).toBe(201);
    expect(res.json.data.approvalStatus).toBe('approved');
    expect(rows.get(res.json.data.id)).toMatchObject({ approval_status: 'approved', approved_by: OM.userId });
    expect(notifyUser).not.toHaveBeenCalled();
  });

  it.each([['worker', WORKER], ['agronomist', AGRONOMIST]])(
    'a %s saves a pending row and the site OM is notified',
    async (_label, user) => {
      const res = await call('POST', '/closing', user, newRow);
      expect(res.status).toBe(201);
      expect(res.json.data.approvalStatus).toBe('pending');
      expect(rows.get(res.json.data.id)).toMatchObject({
        approval_status: 'pending',
        submitted_by: user.userId,
        approved_by: null,
      });
      expect(notifyUser).toHaveBeenCalledTimes(1);
      expect(notifyUser).toHaveBeenCalledWith(OM.userId, expect.objectContaining({ entityType: 'plantation_closing' }));
    },
  );

  it('bulk import by a worker lands pending with one notification', async () => {
    const res = await call('POST', '/closing/bulk', WORKER, {
      siteId: SITE,
      cropId: CROP,
      records: [{ remarks: 'a' }, { remarks: 'b' }, { remarks: 'c' }],
    });
    expect(res.status).toBe(200);
    expect(res.json.data).toEqual({ count: 3, approvalStatus: 'pending' });
    const created = [...rows.values()].filter((r) => r.id !== ROW);
    expect(created).toHaveLength(3);
    expect(created.every((r) => r.approval_status === 'pending')).toBe(true);
    expect(notifyUser).toHaveBeenCalledTimes(1);
    expect((notifyUser as jest.Mock).mock.calls[0][1].message).toMatch(/^3 plantation closing rows/);
  });

  it('bulk import by the OM is live', async () => {
    const res = await call('POST', '/closing/bulk', OM, { closingSheetId: SHEET, records: [{ remarks: 'a' }] });
    expect(res.status).toBe(200);
    expect(res.json.data.approvalStatus).toBe('approved');
    expect(notifyUser).not.toHaveBeenCalled();
  });

  it('rejects a closing sheet from another organization', async () => {
    const res = await call('POST', '/closing', OM, { ...newRow, closingSheetId: FOREIGN_SHEET });
    expect(res.status).toBe(404);
    const bulk = await call('POST', '/closing/bulk', OM, { closingSheetId: FOREIGN_SHEET, records: [{}] });
    expect(bulk.status).toBe(404);
    expect(rows.size).toBe(1);
  });

  it.each([['ceo', CEO], ['farm manager', FARM_MANAGER], ['other-site OM', OTHER_SITE_OM]])(
    'the %s cannot write closing rows',
    async (_label, user) => {
      expect((await call('POST', '/closing', user, newRow)).status).toBe(403);
      expect((await call('POST', '/closing/bulk', user, { closingSheetId: SHEET, records: [{}] })).status).toBe(403);
      expect((await call('PUT', `/closing/${ROW}`, user, editBody)).status).toBe(403);
      expect((await call('DELETE', `/closing/${ROW}`, user)).status).toBe(403);
      expect(rows.size).toBe(1);
      expect(rows.get(ROW)!.remarks).toBe('original');
    },
  );
});

describe('editing and deleting', () => {
  it('a worker cannot edit or delete an approved row', async () => {
    rows.set(ROW, row({ submitted_by: WORKER.userId }));
    expect((await call('PUT', `/closing/${ROW}`, WORKER, editBody)).status).toBe(403);
    expect((await call('DELETE', `/closing/${ROW}`, WORKER)).status).toBe(403);
    expect(rows.get(ROW)!.remarks).toBe('original');
  });

  it.each(['pending', 'rejected'] as const)('a worker editing a %s row re-submits it as pending', async (status) => {
    rows.set(ROW, row({
      approval_status: status,
      submitted_by: WORKER.userId,
      approved_by: null,
      rejected_reason: status === 'rejected' ? 'wrong area' : null,
    }));
    const res = await call('PUT', `/closing/${ROW}`, WORKER, editBody);
    expect(res.status).toBe(200);
    expect(res.json.data.approvalStatus).toBe('pending');
    expect(rows.get(ROW)).toMatchObject({ remarks: 'changed', approval_status: 'pending', rejected_reason: null });
    expect(notifyUser).toHaveBeenCalledTimes(1);
  });

  it('a worker deletes only their own unapproved rows', async () => {
    rows.set(ROW, row({ approval_status: 'pending', submitted_by: WORKER.userId, approved_by: null }));
    expect((await call('DELETE', `/closing/${ROW}`, WORKER2)).status).toBe(403);
    expect(rows.has(ROW)).toBe(true);
    expect((await call('DELETE', `/closing/${ROW}`, WORKER)).status).toBe(200);
    expect(rows.has(ROW)).toBe(false);
  });

  it('the OM edits an approved row live and may delete any row', async () => {
    const edit = await call('PUT', `/closing/${ROW}`, OM, editBody);
    expect(edit.status).toBe(200);
    expect(rows.get(ROW)).toMatchObject({ remarks: 'changed', approval_status: 'approved' });
    rows.get(ROW)!.submitted_by = WORKER.userId;
    expect((await call('DELETE', `/closing/${ROW}`, OM)).status).toBe(200);
    expect(rows.has(ROW)).toBe(false);
  });

  it('returns 404 for an unknown row', async () => {
    expect((await call('PUT', '/closing/77777777-7777-4777-8777-777777777777', OM, editBody)).status).toBe(404);
  });
});

describe('approving and rejecting', () => {
  beforeEach(() => {
    rows.set(ROW, row({ approval_status: 'pending', submitted_by: WORKER.userId, approved_by: null }));
  });

  it('the site OM approves one row and it is audited', async () => {
    const res = await call('POST', `/closing/${ROW}/approve`, OM);
    expect(res.status).toBe(200);
    expect(rows.get(ROW)).toMatchObject({ approval_status: 'approved', approved_by: OM.userId });
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: 'APPROVE',
      entity: 'plantation_closing',
      entityId: ROW,
      metadata: expect.objectContaining({ type: 'plantation_closing_approved' }),
    }));
    expect((await call('POST', `/closing/${ROW}/approve`, OM)).status).toBe(409);
  });

  it('approve-all approves only the pending rows of the sheet', async () => {
    rows.set('r2', row({ id: 'r2', approval_status: 'pending', submitted_by: AGRONOMIST.userId, approved_by: null }));
    rows.set('r3', row({ id: 'r3', approval_status: 'rejected', submitted_by: WORKER.userId, approved_by: null }));
    const res = await call('POST', '/closing/approve-all', OM, { closingSheetId: SHEET });
    expect(res.status).toBe(200);
    expect(res.json.data.approved).toBe(2);
    expect(rows.get(ROW)!.approval_status).toBe('approved');
    expect(rows.get('r2')!.approval_status).toBe('approved');
    expect(rows.get('r3')!.approval_status).toBe('rejected');
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ type: 'plantation_closing_approved_all', count: 2 }),
    }));
  });

  it('approve-all needs a closingSheetId', async () => {
    expect((await call('POST', '/closing/approve-all', OM, {})).status).toBe(400);
  });

  it('reject needs a reason', async () => {
    for (const body of [{}, { reason: '' }, { reason: '   ' }]) {
      expect((await call('POST', `/closing/${ROW}/reject`, OM, body)).status).toBe(400);
    }
    expect(rows.get(ROW)!.approval_status).toBe('pending');
  });

  it('reject stores the reason, audits it and notifies the submitter', async () => {
    const res = await call('POST', `/closing/${ROW}/reject`, OM, { reason: '  Wrong area  ' });
    expect(res.status).toBe(200);
    expect(rows.get(ROW)).toMatchObject({ approval_status: 'rejected', rejected_reason: 'Wrong area' });
    expect(notifyUser).toHaveBeenCalledWith(WORKER.userId, expect.objectContaining({
      message: expect.stringContaining('Wrong area'),
    }));
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ type: 'plantation_closing_rejected', reason: 'Wrong area' }),
    }));

    // The submitter corrects it: pending again.
    const fix = await call('PUT', `/closing/${ROW}`, WORKER, editBody);
    expect(fix.status).toBe(200);
    expect(rows.get(ROW)).toMatchObject({ approval_status: 'pending', rejected_reason: null });
  });

  it.each([
    ['other-site OM', OTHER_SITE_OM],
    ['farm manager', FARM_MANAGER],
    ['ceo', CEO],
    ['worker', WORKER],
    ['agronomist', AGRONOMIST],
  ])('the %s cannot approve or reject', async (_label, user) => {
    expect((await call('POST', `/closing/${ROW}/approve`, user)).status).toBe(403);
    expect((await call('POST', '/closing/approve-all', user, { closingSheetId: SHEET })).status).toBe(403);
    expect((await call('POST', `/closing/${ROW}/reject`, user, { reason: 'no' })).status).toBe(403);
    expect(rows.get(ROW)!.approval_status).toBe('pending');
    expect(logAuditEvent).not.toHaveBeenCalled();
  });
});

describe('opening rows are unaffected', () => {
  it('a worker saving an opening row still creates the closing sheet', async () => {
    const res = await call('POST', '/opening', WORKER, { siteId: SITE, cropId: CROP, remarks: 'x' });
    expect(res.status).toBe(201);
    expect(openingInserts).toBe(1);
    expect(closingSheetEnsures).toEqual([['org-1', SITE, CROP]]);
  });

  it('opening bulk by an agronomist ensures closing sheets', async () => {
    const res = await call('POST', '/opening/bulk', AGRONOMIST, {
      siteId: SITE,
      records: [{ cropId: CROP }, { cropId: CROP }],
    });
    expect(res.status).toBe(200);
    expect(openingInserts).toBe(2);
    expect(closingSheetEnsures).toHaveLength(1);
  });
});
