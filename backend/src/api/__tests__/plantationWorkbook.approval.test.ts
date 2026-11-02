/**
 * Plantation opening approval lock + undo, exercised through the real router and
 * error handler on an ephemeral port. The database is a small in-memory fake that
 * answers by SQL shape.
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
import { plantationWorkbookRouter } from '../v1/plantationWorkbook.routes';
import { errorHandler } from '../middleware/errorHandler';

const SITE = '11111111-1111-4111-8111-111111111111';
const ROW = '22222222-2222-4222-8222-222222222222';
const OM = { userId: 'om-1', role: 'operation_manager', email: 'om@example.com' };
const OTHER_SITE_OM = { userId: 'om-2', role: 'operation_manager', email: 'om2@example.com' };
const FARM_MANAGER = { userId: 'fm-1', role: 'farm_manager', email: 'fm@example.com' };

interface Row {
  id: string;
  site_id: string;
  remarks: string | null;
  farm_manager_approved: boolean;
  farm_manager_approved_at: string | null;
  farm_manager_approved_by: string | null;
  farm_manager_name: string | null;
  farm_manager_date: string | null;
}

let rows: Map<string, Row>;
const assignments = new Set([`${OM.userId}:${SITE}`, `${FARM_MANAGER.userId}:${SITE}`]);

function approvedRow(): Row {
  return {
    id: ROW,
    site_id: SITE,
    remarks: 'original',
    farm_manager_approved: true,
    farm_manager_approved_at: '2026-09-01T00:00:00Z',
    farm_manager_approved_by: OM.userId,
    farm_manager_name: 'Omar OM',
    farm_manager_date: '2026-09-01',
  };
}

const query = jest.fn(async (sql: string, params: unknown[] = []) => {
  const text = sql.replace(/\s+/g, ' ').trim();
  if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(text)) return { rows: [], rowCount: 0 };

  if (text.startsWith('SELECT id, site_id, farm_manager_approved FROM plantation_opening_records')) {
    const row = rows.get(params[0] as string);
    if (!row || (params[2] && row.site_id !== params[2])) return { rows: [], rowCount: 0 };
    return { rows: [{ ...row }], rowCount: 1 };
  }
  if (text.startsWith('SELECT 1 FROM user_site_assignments')) {
    const hit = assignments.has(`${params[0]}:${params[1]}`);
    return { rows: hit ? [{ '?column?': 1 }] : [], rowCount: hit ? 1 : 0 };
  }
  if (text.startsWith('SELECT name FROM users')) return { rows: [{ name: 'Omar OM' }], rowCount: 1 };
  if (text.startsWith('INSERT INTO plantation_closing_sheets')) return { rows: [], rowCount: 1 };

  if (text.startsWith('UPDATE plantation_opening_records SET farm_manager_approved = TRUE')) {
    const row = rows.get(params[2] as string)!;
    Object.assign(row, {
      farm_manager_approved: true,
      farm_manager_approved_by: params[0],
      farm_manager_name: params[1],
      farm_manager_date: '2026-09-28',
      farm_manager_approved_at: '2026-09-28T00:00:00Z',
    });
    return { rows: [], rowCount: 1 };
  }
  if (text.startsWith('UPDATE plantation_opening_records SET farm_manager_approved = FALSE')) {
    const row = rows.get(params[0] as string);
    if (!row?.farm_manager_approved) return { rows: [], rowCount: 0 };
    Object.assign(row, {
      farm_manager_approved: false,
      farm_manager_approved_at: null,
      farm_manager_approved_by: null,
      farm_manager_name: null,
      farm_manager_date: null,
    });
    return { rows: [{ id: row.id }], rowCount: 1 };
  }
  if (text.startsWith('UPDATE plantation_opening_records SET requested_date')) {
    const row = rows.get(params[19] as string);
    if (!row || row.farm_manager_approved) return { rows: [], rowCount: 0 };
    row.remarks = params[13] as string | null;
    return { rows: [], rowCount: 1 };
  }
  if (text.startsWith('DELETE FROM plantation_opening_records')) {
    const row = rows.get(params[0] as string);
    if (!row || row.farm_manager_approved) return { rows: [], rowCount: 0 };
    rows.delete(row.id);
    return { rows: [], rowCount: 1 };
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
  rows = new Map([[ROW, approvedRow()]]);
  query.mockClear();
  (logAuditEvent as jest.Mock).mockClear();
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

const editBody = { siteId: SITE, remarks: 'changed' };

describe('approved plantation opening rows are locked', () => {
  it('rejects an edit with 409 and writes nothing', async () => {
    const res = await call('PUT', `/opening/${ROW}`, FARM_MANAGER, editBody);
    expect(res.status).toBe(409);
    expect(res.json.error.message).toBe('This row is approved — undo the approval first');
    expect(rows.get(ROW)!.remarks).toBe('original');
    const writes = query.mock.calls.filter(([sql]) => /^\s*(UPDATE|INSERT|DELETE)/.test(sql));
    expect(writes).toHaveLength(0);
  });

  it('rejects an edit even from the approving Operation Manager', async () => {
    const res = await call('PUT', `/opening/${ROW}`, OM, editBody);
    expect(res.status).toBe(409);
  });

  it('rejects a delete with 409 and keeps the row', async () => {
    const res = await call('DELETE', `/opening/${ROW}`, FARM_MANAGER);
    expect(res.status).toBe(409);
    expect(rows.has(ROW)).toBe(true);
  });

  it('still allows editing and deleting unapproved rows', async () => {
    rows.get(ROW)!.farm_manager_approved = false;
    const edit = await call('PUT', `/opening/${ROW}`, FARM_MANAGER, editBody);
    expect(edit.status).toBe(200);
    expect(rows.get(ROW)!.remarks).toBe('changed');
    const del = await call('DELETE', `/opening/${ROW}`, FARM_MANAGER);
    expect(del.status).toBe(200);
    expect(rows.has(ROW)).toBe(false);
  });
});

describe('undoing an approval', () => {
  const revoke = `/opening/${ROW}/operation-manager-approval/revoke`;

  it('requires a non-empty reason', async () => {
    for (const body of [{}, { reason: '' }, { reason: '   ' }]) {
      const res = await call('PUT', revoke, OM, body);
      expect(res.status).toBe(400);
    }
    expect(rows.get(ROW)!.farm_manager_approved).toBe(true);
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it('requires an Operation Manager assigned to the site', async () => {
    const notOm = await call('PUT', revoke, FARM_MANAGER, { reason: 'wrong area' });
    expect(notOm.status).toBe(403);
    const otherSite = await call('PUT', revoke, OTHER_SITE_OM, { reason: 'wrong area' });
    expect(otherSite.status).toBe(403);
    expect(rows.get(ROW)!.farm_manager_approved).toBe(true);
  });

  it('returns 409 when the row is not approved', async () => {
    rows.get(ROW)!.farm_manager_approved = false;
    const res = await call('PUT', revoke, OM, { reason: 'oops' });
    expect(res.status).toBe(409);
  });

  it('clears the approval, audits the reason, and makes the row editable again', async () => {
    const res = await call('PUT', revoke, OM, { reason: '  Wrong surface area  ' });
    expect(res.status).toBe(200);

    const row = rows.get(ROW)!;
    expect(row).toMatchObject({
      farm_manager_approved: false,
      farm_manager_approved_at: null,
      farm_manager_approved_by: null,
      farm_manager_name: null,
      farm_manager_date: null,
    });
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: OM.userId,
        action: 'UPDATE',
        entity: 'plantation_opening',
        entityId: ROW,
        metadata: expect.objectContaining({
          type: 'plantation_opening_approval_revoked',
          reason: 'Wrong surface area',
        }),
      }),
    );

    const edit = await call('PUT', `/opening/${ROW}`, FARM_MANAGER, editBody);
    expect(edit.status).toBe(200);
    expect(rows.get(ROW)!.remarks).toBe('changed');
  });
});

describe('approving', () => {
  it('writes an audit entry when a site OM approves', async () => {
    rows.set(ROW, { ...approvedRow(), farm_manager_approved: false, farm_manager_name: null });
    const res = await call('PUT', `/opening/${ROW}/operation-manager-approval`, OM);
    expect(res.status).toBe(200);
    expect(res.json.data.farmManagerName).toBe('Omar OM');
    expect(rows.get(ROW)!.farm_manager_approved).toBe(true);
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: 'plantation_opening',
        metadata: expect.objectContaining({ type: 'plantation_opening_approved' }),
      }),
    );
  });
});
