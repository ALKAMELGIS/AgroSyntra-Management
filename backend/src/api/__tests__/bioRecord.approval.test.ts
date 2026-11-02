/**
 * Biological control: role matrix, pending/approved cells, approve/reject, import that
 * never wipes, and organization scoping — exercised through the real router and error
 * handler on an ephemeral port. The database is a small in-memory fake that answers by
 * SQL shape.
 */
jest.mock('../../db/client', () => ({
  dbPool: { query: jest.fn(), connect: jest.fn() },
}));
jest.mock('../middleware/auth', () => {
  const FIELD_STAFF = ['ceo', 'farm_manager', 'operation_manager', 'agronomist', 'pest_agronomist', 'scouter', 'worker'];
  const { AppError } = jest.requireActual('../../utils/errors');
  return {
    auth: (req: any, _res: any, next: any) => {
      const raw = req.headers['x-test-user'];
      if (raw) req.user = JSON.parse(String(raw));
      next();
    },
    // Same rule as the real middleware: GET for field staff + operator, writes field staff.
    authorizeFieldStaffRead: (req: any, _res: any, next: any) => {
      const allowed = req.method === 'GET' ? [...FIELD_STAFF, 'operator'] : FIELD_STAFF;
      if (!allowed.includes(req.user?.role)) return next(new AppError('Access denied', 'FORBIDDEN', 403));
      next();
    },
  };
});
jest.mock('../middleware/tenant', () => ({
  requireOrgId: (req: any) => req.user?.organizationId || 'org-1',
}));
jest.mock('../../utils/tenantValidation', () => {
  const { AppError } = jest.requireActual('../../utils/errors');
  return {
    assertFieldInOrganization: jest.fn(async (fieldId: string, orgId: string) => {
      if (fieldId === '99999999-9999-4999-8999-999999999999' || orgId !== 'org-1') {
        throw new AppError('Field not found in organization', 'FORBIDDEN', 403);
      }
    }),
    assertSiteInOrganization: jest.fn(async (siteId: string, orgId: string) => {
      if (siteId !== '55555555-5555-4555-8555-555555555555' || orgId !== 'org-1') {
        throw new AppError('Site not found in organization', 'FORBIDDEN', 403);
      }
    }),
  };
});
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
import { notifyUser, notifyUsersByRoles } from '../../services/userNotify.service';
import { bioRecordRouter } from '../v1/bioRecord.routes';
import { errorHandler } from '../middleware/errorHandler';

const SETUP_A = '11111111-1111-4111-8111-111111111111';
const SETUP_B = '22222222-2222-4222-8222-222222222222'; // other organization
const P1 = '33333333-3333-4333-8333-333333333331';
const P2 = '33333333-3333-4333-8333-333333333332';
const PB = '33333333-3333-4333-8333-333333333339'; // column of SETUP_B
const FIELD_A = '44444444-4444-4444-8444-444444444441';
const CROP = '44444444-4444-4444-8444-444444444442';
const SEASON = '44444444-4444-4444-8444-444444444443';
const FIELD_NEW = '44444444-4444-4444-8444-444444444444';
const SITE = '55555555-5555-4555-8555-555555555555';
const CAT_ORG = '66666666-6666-4666-8666-666666666661';
const CAT_GLOBAL = '66666666-6666-4666-8666-666666666662';
const CAT_OTHER_ORG = '66666666-6666-4666-8666-666666666663';

const u = (role: string, extra: object = {}) => ({
  userId: `${role}-1`, role, email: `${role}@example.com`, organizationId: 'org-1', ...extra,
});
const PEST_AGRONOMIST = u('pest_agronomist');
const IPM_ADMIN = u('ceo', { userId: 'admin-1', email: 'abdullah@elite.com' });
const SCOUTER = u('scouter');
const WORKER = u('worker');
const AGRONOMIST = u('agronomist');
const OPERATION_MANAGER = u('operation_manager');
const CEO = u('ceo');
const FARM_MANAGER = u('farm_manager');
const OPERATOR = u('operator');

interface Entry {
  id: string;
  field_setup_id: string;
  product_column_id: string;
  week_number: number;
  per_m2: number | null;
  units: number | null;
  pending_per_m2: number | null;
  pending_units: number | null;
  pending_clear: boolean;
  pending_by: string | null;
  pending_at: unknown;
  rejected_reason: string | null;
  rejected_by: string | null;
  rejected_at: unknown;
}

let setups: Map<string, any>;
let products: Map<string, any>;
let entries: Entry[];
let catalog: Map<string, any>;
let seq = 0;

function entry(partial: Partial<Entry>): Entry {
  return {
    id: `e-${++seq}`,
    field_setup_id: SETUP_A,
    product_column_id: P1,
    week_number: 1,
    per_m2: null,
    units: null,
    pending_per_m2: null,
    pending_units: null,
    pending_clear: false,
    pending_by: null,
    pending_at: null,
    rejected_reason: null,
    rejected_by: null,
    rejected_at: null,
    ...partial,
  };
}

function cell(setupId: string, productId: string, week: number) {
  return entries.find((e) => e.field_setup_id === setupId && e.product_column_id === productId && e.week_number === week);
}

const ok = (rows: any[] = []) => ({ rows, rowCount: rows.length });

const query = jest.fn(async (sql: string, params: any[] = []) => {
  const text = sql.replace(/\s+/g, ' ').trim();
  if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(text)) return ok();

  // ── setups
  if (text.startsWith('SELECT bs.*, f.name AS field_name, c.name AS crop_name')) {
    const s = setups.get(params[0]);
    if (!s || (params[1] && s.organization_id !== params[1])) return ok();
    return ok([{ ...s }]);
  }
  if (text.startsWith('SELECT bs.*, f.name AS field_name, fa.name AS farm_area_name')) {
    return ok([...setups.values()].filter((s) => s.organization_id === params[0]));
  }
  if (text.startsWith('SELECT id, week_count FROM bio_record_field_setup')) {
    const s = [...setups.values()].find((x) => x.field_id === params[0] && x.crop_id === params[1] && x.season_id === params[2]);
    return ok(s ? [{ id: s.id, week_count: s.week_count }] : []);
  }
  if (text.startsWith('INSERT INTO bio_record_field_setup')) {
    const id = `77777777-7777-4777-8777-${String(++seq).padStart(12, '0')}`;
    const row = { id, organization_id: params[0], field_id: params[1], crop_id: params[2], season_id: params[4], week_count: 36, field_name: 'New' };
    setups.set(id, row);
    return ok([row]);
  }
  if (text.startsWith('UPDATE bio_record_field_setup')) {
    const s = setups.get(params[0]);
    if (s && text.includes('SET week_count = $2')) s.week_count = params[1];
    return ok(s ? [s] : []);
  }
  if (text.startsWith('DELETE FROM bio_record_field_setup WHERE id = $1')) {
    setups.delete(params[0]);
    return ok();
  }
  if (text.startsWith('SELECT s.id, s.site_id')) {
    return ok([{ id: SEASON, site_id: SITE, start_date: '2026-01-05', start_year: 2026 }]);
  }

  // ── product columns
  if (text.startsWith('SELECT id FROM bio_record_field_products WHERE field_setup_id = $1 AND id = ANY')) {
    return ok((params[1] as string[]).filter((id) => products.get(id)?.field_setup_id === params[0]).map((id) => ({ id })));
  }
  if (text.startsWith('SELECT id, item_code, product_name, sort_order FROM bio_record_field_products')) {
    return ok([...products.values()].filter((p) => p.field_setup_id === params[0]));
  }
  if (text.startsWith('SELECT COUNT(*) FROM bio_record_field_products')) return ok([{ count: '1' }]);
  if (text.startsWith('SELECT COALESCE(MAX(sort_order)')) return ok([{ next_sort: 5 }]);
  if (text.startsWith('INSERT INTO bio_record_field_products')) {
    const id = `88888888-8888-4888-8888-${String(++seq).padStart(12, '0')}`;
    products.set(id, { id, field_setup_id: params[0], item_code: params[2], product_name: params[3], sort_order: 9 });
    return ok([{ id }]);
  }
  if (text.startsWith('DELETE FROM bio_record_field_products WHERE id = $1')) {
    products.delete(params[0]);
    return ok();
  }
  if (text.startsWith('DELETE FROM bio_record_field_products WHERE field_setup_id')) {
    for (const [id, p] of products) if (p.field_setup_id === params[0]) products.delete(id);
    return ok();
  }
  if (text.startsWith('SELECT fp.id, fp.field_setup_id')) {
    return ok([...products.values()].filter((p) => p.field_setup_id === params[0]));
  }

  // ── cells
  if (text.startsWith('SELECT id, product_column_id, week_number, per_m2') && text.includes('AND product_column_id = $2')) {
    const e = cell(params[0], params[1], params[2]);
    return ok(e ? [{ ...e }] : []);
  }
  if (text.startsWith('SELECT id, product_column_id, week_number, per_m2') && text.includes('pending_at IS NOT NULL')) {
    return ok(entries.filter((e) => e.field_setup_id === params[0] && e.pending_at != null).map((e) => ({ ...e })));
  }
  if (text.startsWith('INSERT INTO bio_record_entries')) {
    const [setupId, productId, week, perM2, units, pPer, pUnits, pClear, pBy, pAt, rReason, rBy, rAt] = params;
    entries.push(entry({
      field_setup_id: setupId, product_column_id: productId, week_number: week, per_m2: perM2, units,
      pending_per_m2: pPer, pending_units: pUnits, pending_clear: pClear, pending_by: pBy, pending_at: pAt,
      rejected_reason: rReason, rejected_by: rBy, rejected_at: rAt,
    }));
    return ok();
  }
  if (text.startsWith('UPDATE bio_record_entries')) {
    const e = entries.find((x) => x.id === params[0])!;
    const [, perM2, units, pPer, pUnits, pClear, pBy, pAt, rReason, rBy, rAt] = params;
    Object.assign(e, {
      per_m2: perM2, units, pending_per_m2: pPer, pending_units: pUnits, pending_clear: pClear,
      pending_by: pBy, pending_at: pAt, rejected_reason: rReason, rejected_by: rBy, rejected_at: rAt,
    });
    return ok();
  }
  if (text.startsWith('DELETE FROM bio_record_entries WHERE id = $1')) {
    entries = entries.filter((e) => e.id !== params[0]);
    return ok();
  }
  if (text.startsWith('DELETE FROM bio_record_entries WHERE field_setup_id')) {
    entries = entries.filter((e) => e.field_setup_id !== params[0]);
    return ok();
  }
  if (text.startsWith('SELECT e.*, pu.name AS pending_by_name')) {
    return ok(entries.filter((e) => e.field_setup_id === params[0]));
  }

  // ── catalog / uom
  if (text.startsWith('SELECT id, organization_id FROM bio_products_catalog WHERE id = $1')) {
    const c = catalog.get(params[0]);
    return ok(c ? [c] : []);
  }
  if (text.startsWith('SELECT id FROM bio_products_catalog WHERE id = ANY')) {
    return ok((params[0] as string[]).filter((id) => {
      const c = catalog.get(id);
      return c && (c.organization_id == null || c.organization_id === params[1]);
    }).map((id) => ({ id })));
  }
  if (text.startsWith('SELECT uom_id FROM bio_products_catalog')) {
    const c = catalog.get(params[0]);
    return ok(c && (c.organization_id == null || c.organization_id === params[1]) ? [{ uom_id: null }] : []);
  }
  if (text.startsWith('INSERT INTO bio_products_catalog')) return ok([{ id: CAT_ORG }]);
  if (text.startsWith('SELECT id FROM bio_products_catalog WHERE (organization_id IS NULL')) return ok();
  if (/^(UPDATE|DELETE FROM) bio_products_catalog/.test(text)) return ok([{ id: params[params.length - 1] }]);
  if (text.startsWith('SELECT id, name, organization_id FROM bio_uom')) return ok();
  if (text.startsWith('INSERT INTO bio_uom')) return ok([{ id: 'uom-1', name: params[1] }]);

  return ok();
});

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/bio', bioRecordRouter);
  app.use(errorHandler);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/bio`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => resetState());

function resetState() {
  seq = 0;
  setups = new Map([
    [SETUP_A, { id: SETUP_A, organization_id: 'org-1', field_id: FIELD_A, crop_id: CROP, season_id: SEASON, week_count: 36, field_name: 'NH 1' }],
    [SETUP_B, { id: SETUP_B, organization_id: 'org-2', field_id: FIELD_NEW, crop_id: CROP, season_id: SEASON, week_count: 36, field_name: 'Other' }],
  ]);
  products = new Map([
    [P1, { id: P1, field_setup_id: SETUP_A, item_code: 'AMB', product_name: 'Amblyseius', sort_order: 0 }],
    [P2, { id: P2, field_setup_id: SETUP_A, item_code: 'ENC', product_name: 'Encarsia', sort_order: 1 }],
    [PB, { id: PB, field_setup_id: SETUP_B, item_code: 'AMB', product_name: 'Amblyseius', sort_order: 0 }],
  ]);
  entries = [
    entry({ product_column_id: P1, week_number: 2, per_m2: 1, units: 10 }),
    entry({ product_column_id: P2, week_number: 3, pending_units: 7, pending_by: 'scouter-2', pending_at: '2026-09-01' }),
  ];
  catalog = new Map([
    [CAT_ORG, { id: CAT_ORG, organization_id: 'org-1' }],
    [CAT_GLOBAL, { id: CAT_GLOBAL, organization_id: null }],
    [CAT_OTHER_ORG, { id: CAT_OTHER_ORG, organization_id: 'org-2' }],
  ]);
  query.mockClear();
  (logAuditEvent as jest.Mock).mockClear();
  (notifyUser as jest.Mock).mockClear();
  (notifyUsersByRoles as jest.Mock).mockClear();
  (dbPool.query as jest.Mock).mockImplementation(query);
  (dbPool.connect as jest.Mock).mockResolvedValue({ query, release: jest.fn() });
}

async function call(method: string, path: string, user: object, body?: unknown) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-test-user': JSON.stringify(user) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json()) as any;
  return { status: res.status, json };
}

function writes() {
  return query.mock.calls
    .map(([sql]) => sql.replace(/\s+/g, ' ').trim())
    .filter((sql) => /^(UPDATE|INSERT|DELETE)/.test(sql));
}

// ─── Role matrix ────────────────────────────────────────────────

const MANAGERS = [PEST_AGRONOMIST, IPM_ADMIN];
const EVERYONE = [PEST_AGRONOMIST, IPM_ADMIN, SCOUTER, WORKER, AGRONOMIST, OPERATION_MANAGER, CEO, FARM_MANAGER, OPERATOR];

const WRITE_ROUTES: Array<{ name: string; method: string; path: string; body?: unknown; allowed: object[] }> = [
  { name: 'create UOM', method: 'POST', path: '/uom', body: { name: 'kg' }, allowed: MANAGERS },
  { name: 'catalog import', method: 'POST', path: '/catalog/import', body: { products: [] }, allowed: MANAGERS },
  { name: 'catalog add', method: 'POST', path: '/catalog/single', body: { itemCode: 'X', itemName: 'X' }, allowed: MANAGERS },
  { name: 'catalog edit', method: 'PUT', path: `/catalog/${CAT_ORG}`, body: { itemName: 'Y' }, allowed: MANAGERS },
  { name: 'catalog delete', method: 'DELETE', path: `/catalog/${CAT_ORG}`, allowed: MANAGERS },
  { name: 'catalog sync', method: 'POST', path: '/catalog/sync-from-fields', body: {}, allowed: MANAGERS },
  { name: 'site catalog assign', method: 'POST', path: `/catalog/site/${SITE}/assign`, body: { productIds: [CAT_ORG] }, allowed: MANAGERS },
  { name: 'site catalog price', method: 'PUT', path: `/catalog/site/${SITE}/${CAT_ORG}`, body: { pricePerPackage: 2 }, allowed: MANAGERS },
  { name: 'site catalog remove', method: 'DELETE', path: `/catalog/site/${SITE}/${CAT_ORG}`, allowed: MANAGERS },
  {
    name: 'setup / weeks / meta',
    method: 'POST',
    path: '/field-setup',
    body: { fieldId: FIELD_A, cropId: CROP, seasonId: SEASON, weekCount: 40 },
    allowed: MANAGERS,
  },
  { name: 'add product column', method: 'POST', path: `/field-setup/${SETUP_A}/products`, body: { productName: 'New' }, allowed: MANAGERS },
  { name: 'remove product column', method: 'DELETE', path: `/field-setup/${SETUP_A}/products/${P2}`, allowed: MANAGERS },
  { name: 'delete field table', method: 'DELETE', path: `/field-setup/${SETUP_A}`, allowed: MANAGERS },
  {
    name: 'save cells',
    method: 'PUT',
    path: '/entries/bulk',
    body: { fieldSetupId: SETUP_A, entries: [] },
    allowed: [...MANAGERS, SCOUTER],
  },
  { name: 'approve', method: 'POST', path: '/entries/approve', body: { fieldSetupId: SETUP_A }, allowed: MANAGERS },
  { name: 'reject', method: 'POST', path: '/entries/reject', body: { fieldSetupId: SETUP_A, reason: 'no' }, allowed: MANAGERS },
  { name: 'import', method: 'POST', path: '/import-excel', body: { seasonId: SEASON, sheets: [] }, allowed: [...MANAGERS, WORKER] },
];

describe('role matrix for every write route', () => {
  for (const route of WRITE_ROUTES) {
    it(`${route.name}: only ${route.allowed.map((a: any) => a.role === 'ceo' && a.email.startsWith('abdullah') ? 'ipm-admin' : a.role).join(', ')}`, async () => {
      for (const user of EVERYONE) {
        resetState();
        const res = await call(route.method, route.path, user, route.body);
        if (route.allowed.includes(user)) {
          expect({ user: (user as any).userId, status: res.status }).not.toEqual({ user: (user as any).userId, status: 403 });
          expect(res.status).toBeLessThan(300);
        } else {
          expect({ user: (user as any).userId, status: res.status }).toEqual({ user: (user as any).userId, status: 403 });
          expect(writes()).toHaveLength(0);
        }
      }
    });
  }

  it('keeps reads open to view-only roles', async () => {
    for (const user of [AGRONOMIST, OPERATOR, CEO, SCOUTER, WORKER]) {
      const res = await call('GET', `/field-setup/${SETUP_A}`, user);
      expect(res.status).toBe(200);
    }
  });
});

// ─── Cells ──────────────────────────────────────────────────────

describe('saving cells', () => {
  it('scouter writes only pending values and leaves the approved value counted', async () => {
    const res = await call('PUT', '/entries/bulk', SCOUTER, {
      fieldSetupId: SETUP_A,
      entries: [
        { productColumnId: P1, weekNumber: 2, perM2: 2, units: 20 },
        { productColumnId: P1, weekNumber: 4, perM2: null, units: 5 },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.json.data.pending).toBe(2);
    expect(cell(SETUP_A, P1, 2)).toMatchObject({ per_m2: 1, units: 10, pending_per_m2: 2, pending_units: 20, pending_by: SCOUTER.userId });
    expect(cell(SETUP_A, P1, 4)).toMatchObject({ per_m2: null, units: null, pending_units: 5 });
    for (const sql of writes()) {
      if (sql.startsWith('UPDATE bio_record_entries')) expect(sql).toContain('per_m2 = $2');
    }
    expect(notifyUsersByRoles).toHaveBeenCalledTimes(1);
    expect(notifyUsersByRoles).toHaveBeenCalledWith(['pest_agronomist'], expect.objectContaining({
      organizationId: 'org-1',
      message: expect.stringContaining('2 biological-control values waiting for approval'),
    }));
  });

  it('scouter clearing an approved cell asks for removal instead of deleting it', async () => {
    await call('PUT', '/entries/bulk', SCOUTER, {
      fieldSetupId: SETUP_A,
      entries: [{ productColumnId: P1, weekNumber: 2, perM2: null, units: null }],
    });
    expect(cell(SETUP_A, P1, 2)).toMatchObject({ per_m2: 1, units: 10, pending_clear: true });
  });

  it('manager save writes approved values and clears pending on that cell only', async () => {
    const res = await call('PUT', '/entries/bulk', PEST_AGRONOMIST, {
      fieldSetupId: SETUP_A,
      entries: [{ productColumnId: P2, weekNumber: 3, perM2: 1, units: 8 }],
    });
    expect(res.status).toBe(200);
    expect(cell(SETUP_A, P2, 3)).toMatchObject({ per_m2: 1, units: 8, pending_units: null, pending_at: null });
    expect(cell(SETUP_A, P1, 2)).toMatchObject({ per_m2: 1, units: 10 });
    expect(notifyUsersByRoles).not.toHaveBeenCalled();
  });

  it('manager clearing a cell removes the row', async () => {
    await call('PUT', '/entries/bulk', PEST_AGRONOMIST, {
      fieldSetupId: SETUP_A,
      entries: [{ productColumnId: P1, weekNumber: 2, perM2: null, units: 0 }],
    });
    expect(cell(SETUP_A, P1, 2)).toBeUndefined();
  });

  it('returns 404 for a field table of another organization and writes nothing', async () => {
    const res = await call('PUT', '/entries/bulk', PEST_AGRONOMIST, {
      fieldSetupId: SETUP_B,
      entries: [{ productColumnId: PB, weekNumber: 1, units: 3 }],
    });
    expect(res.status).toBe(404);
    expect(writes()).toHaveLength(0);
  });

  it('rejects a product column that belongs to another table', async () => {
    const res = await call('PUT', '/entries/bulk', PEST_AGRONOMIST, {
      fieldSetupId: SETUP_A,
      entries: [{ productColumnId: PB, weekNumber: 1, units: 3 }],
    });
    expect(res.status).toBe(400);
    expect(writes()).toHaveLength(0);
  });
});

// ─── Approve / reject ───────────────────────────────────────────

describe('approving and rejecting pending values', () => {
  beforeEach(() => {
    // P1 week 2: approved 1/10 with a pending 2/20; P1 week 5: pending clear of approved 3/30
    Object.assign(cell(SETUP_A, P1, 2)!, { pending_per_m2: 2, pending_units: 20, pending_by: 'scouter-1', pending_at: '2026-09-02' });
    entries.push(entry({ product_column_id: P1, week_number: 5, per_m2: 3, units: 30, pending_clear: true, pending_by: 'scouter-1', pending_at: '2026-09-02' }));
  });

  it('approve all: pending becomes approved and pending_clear removes the value', async () => {
    const res = await call('POST', '/entries/approve', PEST_AGRONOMIST, { fieldSetupId: SETUP_A });
    expect(res.status).toBe(200);
    expect(res.json.data.approved).toBe(3);
    expect(cell(SETUP_A, P1, 2)).toMatchObject({ per_m2: 2, units: 20, pending_at: null });
    expect(cell(SETUP_A, P2, 3)).toMatchObject({ per_m2: null, units: 7, pending_at: null });
    expect(cell(SETUP_A, P1, 5)).toBeUndefined();
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'APPROVE', entity: 'bio_record' }));
  });

  it('approve only the chosen cells', async () => {
    await call('POST', '/entries/approve', PEST_AGRONOMIST, {
      fieldSetupId: SETUP_A,
      cells: [{ productColumnId: P1, weekNumber: 2 }],
    });
    expect(cell(SETUP_A, P1, 2)).toMatchObject({ per_m2: 2, units: 20 });
    expect(cell(SETUP_A, P2, 3)).toMatchObject({ pending_units: 7 });
  });

  it('reject requires a reason', async () => {
    for (const body of [{ fieldSetupId: SETUP_A }, { fieldSetupId: SETUP_A, reason: '   ' }]) {
      const res = await call('POST', '/entries/reject', PEST_AGRONOMIST, body);
      expect(res.status).toBe(400);
    }
    expect(writes()).toHaveLength(0);
  });

  it('reject keeps the approved value, clears pending, records the reason and notifies each proposer', async () => {
    const res = await call('POST', '/entries/reject', PEST_AGRONOMIST, { fieldSetupId: SETUP_A, reason: 'Wrong week' });
    expect(res.status).toBe(200);
    expect(cell(SETUP_A, P1, 2)).toMatchObject({
      per_m2: 1, units: 10, pending_units: null, pending_at: null, rejected_reason: 'Wrong week', rejected_by: PEST_AGRONOMIST.userId,
    });
    expect(cell(SETUP_A, P1, 5)).toMatchObject({ per_m2: 3, units: 30, pending_clear: false });
    const notified = (notifyUser as jest.Mock).mock.calls.map(([id]) => id).sort();
    expect(notified).toEqual(['scouter-1', 'scouter-2']);
    expect((notifyUser as jest.Mock).mock.calls[0][1].message).toContain('Wrong week');
  });

  it('cannot review a table of another organization', async () => {
    const res = await call('POST', '/entries/approve', PEST_AGRONOMIST, { fieldSetupId: SETUP_B });
    expect(res.status).toBe(404);
  });
});

// ─── Import ─────────────────────────────────────────────────────

const importBody = {
  seasonId: SEASON,
  sheets: [{
    fieldId: FIELD_A,
    cropId: CROP,
    surfaceM2: null,
    weekCount: 52,
    products: [
      { itemCode: 'AMB', productName: 'Amblyseius' },
      { itemCode: 'NEW', productName: 'Brand new bug' },
    ],
    entries: [
      { weekNumber: 1, productIndex: 0, perM2: 4, units: 40 },
      { weekNumber: 2, productIndex: 1, perM2: null, units: 6 },
    ],
  }],
};

describe('Excel import never wipes', () => {
  it('worker import lands as pending, adds the missing column, deletes nothing', async () => {
    const before = entries.map((e) => ({ ...e }));
    const res = await call('POST', '/import-excel', WORKER, importBody);
    expect(res.status).toBe(200);
    expect(res.json.data.pending).toBe(2);
    expect(writes().filter((sql) => sql.startsWith('DELETE'))).toHaveLength(0);
    expect(writes().filter((sql) => sql.startsWith('INSERT INTO bio_products_catalog'))).toHaveLength(0);
    for (const old of before) {
      expect(entries.find((e) => e.id === old.id)).toEqual(old);
    }
    expect(cell(SETUP_A, P1, 1)).toMatchObject({ per_m2: null, units: null, pending_per_m2: 4, pending_units: 40, pending_by: WORKER.userId });
    const newCol = [...products.values()].find((p) => p.product_name === 'Brand new bug');
    expect(newCol?.field_setup_id).toBe(SETUP_A);
    expect(products.has(P1) && products.has(P2)).toBe(true);
    expect(notifyUsersByRoles).toHaveBeenCalledTimes(1);
  });

  it('manager import writes approved values and keeps other cells', async () => {
    const res = await call('POST', '/import-excel', PEST_AGRONOMIST, importBody);
    expect(res.status).toBe(200);
    expect(writes().filter((sql) => sql.startsWith('DELETE'))).toHaveLength(0);
    expect(cell(SETUP_A, P1, 1)).toMatchObject({ per_m2: 4, units: 40, pending_at: null });
    expect(cell(SETUP_A, P1, 2)).toMatchObject({ per_m2: 1, units: 10 });
    expect(cell(SETUP_A, P2, 3)).toMatchObject({ pending_units: 7, pending_by: 'scouter-2' });
    expect(notifyUsersByRoles).not.toHaveBeenCalled();
  });

  it('a blank half of an imported cell keeps the approved value', async () => {
    await call('POST', '/import-excel', PEST_AGRONOMIST, {
      ...importBody,
      sheets: [{ ...importBody.sheets[0], entries: [{ weekNumber: 2, productIndex: 0, perM2: 5, units: null }] }],
    });
    expect(cell(SETUP_A, P1, 2)).toMatchObject({ per_m2: 5, units: 10 });
  });

  it('refuses a field of another organization', async () => {
    const res = await call('POST', '/import-excel', PEST_AGRONOMIST, {
      ...importBody,
      sheets: [{ ...importBody.sheets[0], fieldId: '99999999-9999-4999-8999-999999999999' }],
    });
    expect(res.status).toBe(403);
    expect(writes()).toHaveLength(0);
  });
});

// ─── Organization scoping ───────────────────────────────────────

describe('organization scoping on :id routes', () => {
  it('hides and protects another organization\'s field table', async () => {
    expect((await call('GET', `/field-setup/${SETUP_B}`, PEST_AGRONOMIST)).status).toBe(404);
    expect((await call('DELETE', `/field-setup/${SETUP_B}`, PEST_AGRONOMIST)).status).toBe(404);
    expect((await call('POST', `/field-setup/${SETUP_B}/products`, PEST_AGRONOMIST, { productName: 'X' })).status).toBe(404);
    expect((await call('DELETE', `/field-setup/${SETUP_B}/products/${PB}`, PEST_AGRONOMIST)).status).toBe(404);
    expect(setups.has(SETUP_B)).toBe(true);
    expect(products.has(PB)).toBe(true);
  });

  it('manager delete removes the table, its columns and its cells', async () => {
    const res = await call('DELETE', `/field-setup/${SETUP_A}`, PEST_AGRONOMIST);
    expect(res.status).toBe(200);
    expect(setups.has(SETUP_A)).toBe(false);
    expect(entries.filter((e) => e.field_setup_id === SETUP_A)).toHaveLength(0);
    expect(setups.has(SETUP_B)).toBe(true);
  });

  it('catalog: other org is 404, shared rows only for the IPM admin', async () => {
    expect((await call('PUT', `/catalog/${CAT_OTHER_ORG}`, PEST_AGRONOMIST, { itemName: 'x' })).status).toBe(404);
    expect((await call('DELETE', `/catalog/${CAT_OTHER_ORG}`, PEST_AGRONOMIST)).status).toBe(404);
    expect((await call('PUT', `/catalog/${CAT_GLOBAL}`, PEST_AGRONOMIST, { itemName: 'x' })).status).toBe(403);
    expect((await call('DELETE', `/catalog/${CAT_GLOBAL}`, PEST_AGRONOMIST)).status).toBe(403);
    expect((await call('PUT', `/catalog/${CAT_GLOBAL}`, IPM_ADMIN, { itemName: 'x' })).status).toBe(200);
  });

  it('site catalog routes refuse a site outside the organization', async () => {
    const OTHER_SITE = '55555555-5555-4555-8555-555555555556';
    expect((await call('POST', `/catalog/site/${OTHER_SITE}/assign`, PEST_AGRONOMIST, { productIds: [] })).status).toBe(403);
    expect((await call('GET', `/catalog/site/${OTHER_SITE}`, PEST_AGRONOMIST)).status).toBe(403);
    expect((await call('POST', `/catalog/site/${SITE}/assign`, PEST_AGRONOMIST, { productIds: [CAT_OTHER_ORG] })).status).toBe(404);
  });
});

// ─── Approved-only readers ──────────────────────────────────────

describe('summary counts approved values only', () => {
  it('sums per_m2 / units and never pending columns', async () => {
    query.mockClear();
    await call('GET', `/summary/${CROP}?season_id=${SEASON}`, PEST_AGRONOMIST);
    const summarySql = query.mock.calls.map(([sql]) => sql).filter((sql) => sql.includes('SUM('));
    expect(summarySql).toHaveLength(2);
    for (const sql of summarySql) {
      expect(sql).not.toMatch(/pending_/);
      expect(sql).toMatch(/SUM\(e\.units/);
    }
  });
});
