/**
 * Pest catalog and product catalog: only workers, the pest agronomist and the
 * IPM admin edit; everyone else watches (403). Shared (foundation) pest catalog
 * rows are copied or hidden per organization instead of changed for everyone,
 * other organizations' rows are not found, and MSDS files stay with the auditor.
 *
 * Driven through the real scouting and IPM routers and error handler on an
 * ephemeral port. The database is a small in-memory fake answering by SQL shape.
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
  requireOrgId: (req: any) => req.user?.organizationId || 'org-1',
}));
jest.mock('../../utils/tenantValidation', () => {
  const { AppError } = jest.requireActual('../../utils/errors');
  const owner: Record<string, string> = {
    'f0000000-0000-4000-8000-00000000000a': 'org-1',
    'f0000000-0000-4000-8000-00000000000b': 'org-2',
    '50000000-0000-4000-8000-00000000000a': 'org-1',
    '50000000-0000-4000-8000-00000000000b': 'org-2',
  };
  return {
    assertFieldInOrganization: jest.fn(async (id: string, orgId: string) => {
      if (owner[id] !== orgId) throw new AppError('Field not found in organization', 'FORBIDDEN', 403);
    }),
    assertSiteInOrganization: jest.fn(async (id: string, orgId: string) => {
      if (owner[id] !== orgId) throw new AppError('Site not found in organization', 'FORBIDDEN', 403);
    }),
  };
});
jest.mock('../../repositories/assignment.repository', () => ({
  AssignmentRepository: jest.fn().mockImplementation(() => ({
    canUserAccessField: jest.fn(async () => true),
  })),
}));
jest.mock('../../services/scouting.service', () => ({
  ...jest.requireActual('../../services/scouting.service'),
  upsertFieldSamplingUnits: jest.fn(async (fieldId: string, samplingUnits: number) => ({ fieldId, samplingUnits })),
}));
jest.mock('../../services/ipm.service', () => ({
  ...jest.requireActual('../../services/ipm.service'),
  createPesticideProduct: jest.fn(async (data: any) => ({ id: 'new-product', ...data })),
  updatePesticideProductForOrg: jest.fn(async (id: string) => ({ id })),
  deletePesticideProductForOrg: jest.fn(async () => undefined),
  addPesticideFromFoundation: jest.fn(async (_org: string, id: string) => ({ id: 'copy', source_product_id: id })),
  createBioProduct: jest.fn(async (data: any) => ({ id: 'new-bio', ...data })),
  updateBioProduct: jest.fn(async (id: string) => ({ id })),
  upsertSiteProductCropPhi: jest.fn(async () => ({ id: 'phi' })),
  bulkCopySiteProductCropPhi: jest.fn(async () => 1),
}));
jest.mock('../../services/pppMsds.service', () => ({
  listPppMsds: jest.fn(async () => []),
  deleteOrgPdf: jest.fn(async () => ({ deleted: true })),
  confirmImport: jest.fn(async () => ({ saved: 0 })),
  importZip: jest.fn(),
  addProductPdf: jest.fn(),
  streamOrgPdf: jest.fn(),
}));
jest.mock('../../websocket', () => ({ emitDataChange: jest.fn(), emitAlert: jest.fn() }));
jest.mock('../../services/webhook.service', () => ({ deliverWebhooks: jest.fn() }));
jest.mock('../../services/scoutingSummary.service', () => ({}));
jest.mock('../v1/workOrder.routes', () => ({ workOrderRouter: jest.requireActual('express').Router() }));
jest.mock('../../services/seasons.service', () => ({
  countPendingSeasonReopenRequests: jest.fn(async () => 0),
  assertFieldDateWritable: jest.fn(async () => undefined),
}));
jest.mock('../../services/inventory.service', () => ({ deductByName: jest.fn() }));
jest.mock('../../services/phiAuditLog.service', () => ({ checkAndNotifyFieldHarvestConflicts: jest.fn() }));
jest.mock('../../services/push-notification.service', () => ({ pushNotificationService: { sendToUser: jest.fn() } }));
jest.mock('../../services/manpower.service', () => ({}));
jest.mock('../../services/bioRecord.service', () => ({}));
jest.mock('../../services/auditLog.service', () => ({ logAuditEvent: jest.fn(async () => undefined) }));
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
import * as ipmService from '../../services/ipm.service';
import * as scoutingService from '../../services/scouting.service';
import * as pppMsdsService from '../../services/pppMsds.service';
import { ipmRouter } from '../v1/ipm.routes';
import { scoutingRouter } from '../v1/scouting.routes';
import { errorHandler } from '../middleware/errorHandler';
import { canEditIpmCatalog } from '../../utils/ipmAccess';

const FIELD_A = 'f0000000-0000-4000-8000-00000000000a';
const SITE_A = '50000000-0000-4000-8000-00000000000a';
const SITE_B = '50000000-0000-4000-8000-00000000000b'; // org-2
const GLOBAL_PEST = 'a0000000-0000-4000-8000-000000000001'; // shared foundation row
const ORG_PEST = 'a0000000-0000-4000-8000-000000000002'; // org-1
const OTHER_PEST = 'a0000000-0000-4000-8000-000000000003'; // org-2
const PRODUCT = 'b0000000-0000-4000-8000-000000000001';
const PHI_A = 'c0000000-0000-4000-8000-00000000000a';
const PHI_B = 'c0000000-0000-4000-8000-00000000000b'; // site in org-2
const MSDS = 'd0000000-0000-4000-8000-000000000001';

const u = (role: string, extra: object = {}) => ({
  userId: `${role}-1`, role, email: `${role}@example.com`, organizationId: 'org-1', ...extra,
});
const WORKER = u('worker');
const PEST_AGRONOMIST = u('pest_agronomist');
const IPM_ADMIN = u('ceo', { userId: 'admin-1', email: 'abdullah@elite.com' });
const EDITORS = [WORKER, PEST_AGRONOMIST, IPM_ADMIN];
const WATCHERS = ['agronomist', 'ceo', 'farm_manager', 'operation_manager', 'scouter', 'operator', 'auditor']
  .map((role) => u(role));

type PestRow = {
  id: string; name: string; category: string; organization_id: string | null;
  is_active: boolean; source_pest_id: string | null; description: string | null; created_by?: string | null;
};
type State = {
  pests: PestRow[];
  hidden: Array<{ organization_id: string; item_id: string }>;
  cropPhi: Array<{ id: string; site_id: string }>;
  sites: Record<string, string>;
};

let state: State;
let seq = 0;
const calls: string[] = [];

const pest = (id: string, name: string, org: string | null): PestRow => ({
  id, name, category: 'pest', organization_id: org, is_active: true, source_pest_id: null, description: 'seed',
});

function resetState() {
  seq = 100;
  state = {
    pests: [
      pest(GLOBAL_PEST, 'Whitefly', null),
      pest(ORG_PEST, 'Local Thrips', 'org-1'),
      pest(OTHER_PEST, 'Their Mite', 'org-2'),
    ],
    hidden: [],
    cropPhi: [{ id: PHI_A, site_id: SITE_A }, { id: PHI_B, site_id: SITE_B }],
    sites: { [SITE_A]: 'org-1', [SITE_B]: 'org-2' },
  };
}

const ok = (rows: any[] = [], rowCount = rows.length) => ({ rows, rowCount });

function visiblePests(org: string, { hideOverridden }: { hideOverridden: boolean }) {
  return state.pests.filter((p) => {
    if (p.organization_id === org) return true;
    if (p.organization_id !== null) return false;
    if (state.hidden.some((h) => h.organization_id === org && h.item_id === p.id)) return false;
    if (hideOverridden && state.pests.some((o) => o.organization_id === org && o.source_pest_id === p.id)) {
      return false;
    }
    return true;
  });
}

async function fakeQuery(sql: string, params: any[] = []): Promise<any> {
  const text = sql.replace(/\s+/g, ' ').trim();
  calls.push(text);
  if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(text)) return ok();

  // ── pest catalog
  if (text === 'SELECT * FROM pest_disease_catalog WHERE id = $1') {
    return ok(state.pests.filter((p) => p.id === params[0]).map((p) => ({ ...p })));
  }
  if (text.startsWith('SELECT id FROM pest_disease_catalog WHERE organization_id = $1 AND source_pest_id = $2')) {
    return ok(state.pests.filter((p) => p.organization_id === params[0] && p.source_pest_id === params[1]));
  }
  if (text.startsWith('INSERT INTO pest_disease_catalog') && text.includes('source_pest_id')) {
    const src = state.pests.find((p) => p.id === params[2] && p.organization_id === null);
    if (!src) return ok();
    const row = {
      ...src, id: `a0000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`,
      organization_id: params[0], created_by: params[1], source_pest_id: src.id,
    };
    state.pests.push(row);
    return ok([{ id: row.id }]);
  }
  if (text.startsWith('INSERT INTO pest_disease_catalog')) {
    const row: PestRow = {
      id: `a0000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`,
      name: params[0], category: params[1], description: params[2], organization_id: params[6],
      is_active: true, source_pest_id: null, created_by: params[5],
    };
    state.pests.push(row);
    return ok([row]);
  }
  if (text.startsWith('UPDATE pest_disease_catalog SET')) {
    const where = text.slice(text.indexOf(' WHERE '));
    const id = params[Number(/id = \$(\d+)/.exec(where)![1]) - 1];
    const orgMatch = /organization_id = \$(\d+)/.exec(where);
    const org = orgMatch ? params[Number(orgMatch[1]) - 1] : undefined;
    const row = state.pests.find((p) => p.id === id && (org === undefined || p.organization_id === org));
    if (!row) return ok();
    const setPart = text.slice(text.indexOf(' SET ') + 5, text.indexOf(' WHERE '));
    for (const m of setPart.matchAll(/(\w+) = \$(\d+)/g)) (row as any)[m[1]] = params[Number(m[2]) - 1];
    if (setPart.includes('is_active = false')) row.is_active = false;
    return ok([{ ...row }]);
  }
  if (text.startsWith('INSERT INTO org_catalog_hidden')) {
    state.hidden.push({ organization_id: params[0], item_id: params[1] });
    return ok();
  }
  if (text.startsWith('SELECT m.member_id, g.id')) return ok();
  if (text.startsWith('INSERT INTO pest_catalog_group_members')) return ok();
  if (text.startsWith('DELETE FROM pest_catalog_group_members')) return ok();
  if (text.startsWith('SELECT pdc.* FROM pest_disease_catalog pdc WHERE ( pdc.organization_id = $1')) {
    const activeOnly = text.includes('AND pdc.is_active = true');
    return ok(visiblePests(params[0], { hideOverridden: true }).filter((p) => !activeOnly || p.is_active));
  }
  if (text.startsWith('SELECT pdc.* FROM pest_disease_catalog pdc WHERE pdc.is_active = true')) {
    return ok(visiblePests(params[0], { hideOverridden: false }).filter((p) => p.is_active));
  }

  // ── site product lists and crop PHI
  if (text.startsWith('INSERT INTO site_pesticide_products')) return ok([{ id: 'spp' }]);
  if (text.startsWith('UPDATE site_pesticide_products')) return ok([{ id: 'spp' }]);
  if (text.startsWith('DELETE FROM site_pesticide_products')) return ok();
  if (text.startsWith('DELETE FROM site_product_crop_phi spc USING sites s')) {
    const before = state.cropPhi.length;
    state.cropPhi = state.cropPhi.filter((r) => !(r.id === params[0] && state.sites[r.site_id] === params[1]));
    return ok([], before - state.cropPhi.length);
  }

  throw new Error(`Unexpected SQL in test: ${text}`);
}

const mockedQuery = dbPool.query as unknown as jest.Mock;
const mockedConnect = dbPool.connect as unknown as jest.Mock;

let server: Server;
let base: string;

beforeAll(async () => {
  delete process.env.IPM_ADMIN_EMAILS;
  const app = express();
  app.use(express.json());
  app.use('/scouting', scoutingRouter);
  app.use('/ipm', ipmRouter);
  app.use(errorHandler);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  resetState();
  calls.length = 0;
  jest.clearAllMocks();
  mockedQuery.mockImplementation(fakeQuery);
  mockedConnect.mockImplementation(async () => ({ query: fakeQuery, release: jest.fn() }));
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

const writeSql = () => calls.filter((sql) => /^(UPDATE|INSERT|DELETE)/.test(sql));

type Route = { name: string; method: string; path: string; body?: unknown; service?: () => jest.Mock };
const ROUTES: Route[] = [
  { name: 'sampling units', method: 'PUT', path: `/scouting/sampling-units/${FIELD_A}`, body: { samplingUnits: 5 },
    service: () => scoutingService.upsertFieldSamplingUnits as unknown as jest.Mock },
  { name: 'pest create', method: 'POST', path: '/scouting/pest-catalog', body: { name: 'Brand New Weevil', category: 'pest' } },
  { name: 'pest edit', method: 'PUT', path: `/scouting/pest-catalog/${ORG_PEST}`, body: { description: 'changed' } },
  { name: 'pest active toggle', method: 'PUT', path: `/scouting/pest-catalog/${ORG_PEST}`, body: { isActive: false } },
  { name: 'pest delete', method: 'DELETE', path: `/scouting/pest-catalog/${ORG_PEST}` },
  { name: 'product create', method: 'POST', path: '/ipm/pesticide-products', body: { name: 'Spray X' },
    service: () => ipmService.createPesticideProduct as unknown as jest.Mock },
  { name: 'product edit', method: 'PUT', path: `/ipm/pesticide-products/${PRODUCT}`, body: { name: 'Spray Y' },
    service: () => ipmService.updatePesticideProductForOrg as unknown as jest.Mock },
  { name: 'product delete', method: 'DELETE', path: `/ipm/pesticide-products/${PRODUCT}`,
    service: () => ipmService.deletePesticideProductForOrg as unknown as jest.Mock },
  { name: 'add from foundation', method: 'POST', path: `/ipm/pesticide-products/active/from-foundation/${PRODUCT}`,
    service: () => ipmService.addPesticideFromFoundation as unknown as jest.Mock },
  { name: 'bio product create', method: 'POST', path: '/ipm/bio-products', body: { name: 'Bug B' },
    service: () => ipmService.createBioProduct as unknown as jest.Mock },
  { name: 'bio product edit', method: 'PUT', path: `/ipm/bio-products/${PRODUCT}`, body: { name: 'Bug C' },
    service: () => ipmService.updateBioProduct as unknown as jest.Mock },
  { name: 'site assign', method: 'POST', path: `/ipm/pesticide-products/site/${SITE_A}/assign`, body: { productIds: [PRODUCT] } },
  { name: 'site price', method: 'PUT', path: `/ipm/pesticide-products/site/${SITE_A}/${PRODUCT}`, body: { unitPrice: 3 } },
  { name: 'site remove', method: 'DELETE', path: `/ipm/pesticide-products/site/${SITE_A}/${PRODUCT}` },
  { name: 'crop PHI upsert', method: 'POST', path: `/ipm/site/${SITE_A}/crop-phi`,
    body: { productId: PRODUCT, cropName: 'Tomato', phiDays: 3 },
    service: () => ipmService.upsertSiteProductCropPhi as unknown as jest.Mock },
  { name: 'crop PHI bulk copy', method: 'POST', path: `/ipm/site/${SITE_A}/crop-phi/bulk-copy`,
    body: { entries: [{ productId: PRODUCT, cropName: 'Tomato', phiDays: 3 }] },
    service: () => ipmService.bulkCopySiteProductCropPhi as unknown as jest.Mock },
  { name: 'crop PHI delete', method: 'DELETE', path: `/ipm/crop-phi/${PHI_A}` },
];

describe('canEditIpmCatalog', () => {
  it('allows workers, the pest agronomist and the IPM admin only', () => {
    for (const user of EDITORS) expect(canEditIpmCatalog(user as any)).toBe(true);
    for (const user of WATCHERS) expect(canEditIpmCatalog(user as any)).toBe(false);
    expect(canEditIpmCatalog(null)).toBe(false);
  });
});

describe.each(ROUTES)('$name ($method $path)', (route) => {
  it.each(EDITORS.map((user) => [user.email, user]))('%s may write', async (_label, user) => {
    const res = await call(route.method, route.path, user, route.body);
    expect(res.status).toBeLessThan(300);
    expect(res.json.success).toBe(true);
    if (route.service) expect(route.service()).toHaveBeenCalled();
  });

  it.each(WATCHERS.map((user) => [user.role, user]))('%s gets 403 and nothing changes', async (_label, user) => {
    const res = await call(route.method, route.path, user, route.body);
    expect(res.status).toBe(403);
    expect(writeSql()).toEqual([]);
    if (route.service) expect(route.service()).not.toHaveBeenCalled();
  });
});

describe('pest catalog is scoped to the organization', () => {
  it("editing another organization's row is not found and leaves it alone", async () => {
    const res = await call('PUT', `/scouting/pest-catalog/${OTHER_PEST}`, PEST_AGRONOMIST, { name: 'Hijacked' });
    expect(res.status).toBe(404);
    expect(state.pests.find((p) => p.id === OTHER_PEST)!.name).toBe('Their Mite');
    expect(writeSql()).toEqual([]);
  });

  it("deleting another organization's row is not found and leaves it active", async () => {
    const res = await call('DELETE', `/scouting/pest-catalog/${OTHER_PEST}`, WORKER);
    expect(res.status).toBe(404);
    expect(state.pests.find((p) => p.id === OTHER_PEST)!.is_active).toBe(true);
    expect(writeSql()).toEqual([]);
  });

  it('editing a shared row makes an organization copy and leaves the shared row unchanged', async () => {
    const res = await call('PUT', `/scouting/pest-catalog/${GLOBAL_PEST}`, PEST_AGRONOMIST, { description: 'ours' });
    expect(res.status).toBe(200);
    const shared = state.pests.find((p) => p.id === GLOBAL_PEST)!;
    expect(shared.description).toBe('seed');
    expect(shared.organization_id).toBeNull();
    const copy = state.pests.find((p) => p.source_pest_id === GLOBAL_PEST)!;
    expect(copy).toMatchObject({ organization_id: 'org-1', name: 'Whitefly', description: 'ours' });
    expect(res.json.data.id).toBe(copy.id);

    // A second edit changes the same copy rather than making another.
    const again = await call('PUT', `/scouting/pest-catalog/${GLOBAL_PEST}`, WORKER, { description: 'ours v2' });
    expect(again.status).toBe(200);
    expect(state.pests.filter((p) => p.source_pest_id === GLOBAL_PEST)).toHaveLength(1);
    expect(copy.description).toBe('ours v2');
    expect(shared.description).toBe('seed');
  });

  it('switching a shared row off only affects this organization', async () => {
    const res = await call('PUT', `/scouting/pest-catalog/${GLOBAL_PEST}`, WORKER, { isActive: false });
    expect(res.status).toBe(200);
    expect(state.pests.find((p) => p.id === GLOBAL_PEST)!.is_active).toBe(true);
    expect(state.pests.find((p) => p.source_pest_id === GLOBAL_PEST)).toMatchObject({
      organization_id: 'org-1', is_active: false,
    });
  });

  it('deleting a shared row hides it for this organization only', async () => {
    const res = await call('DELETE', `/scouting/pest-catalog/${GLOBAL_PEST}`, IPM_ADMIN);
    expect(res.status).toBe(200);
    const shared = state.pests.find((p) => p.id === GLOBAL_PEST)!;
    expect(shared.is_active).toBe(true);
    expect(state.hidden).toEqual([{ organization_id: 'org-1', item_id: GLOBAL_PEST }]);
    expect(visiblePests('org-2', { hideOverridden: true }).map((p) => p.id)).toContain(GLOBAL_PEST);
  });

  it("the organization's own row is updated in place", async () => {
    const res = await call('PUT', `/scouting/pest-catalog/${ORG_PEST}`, WORKER, { name: 'Local Thrips 2' });
    expect(res.status).toBe(200);
    expect(res.json.data.id).toBe(ORG_PEST);
    expect(state.pests.find((p) => p.id === ORG_PEST)!.name).toBe('Local Thrips 2');
  });
});

describe('crop-specific PHI delete is scoped to the organization', () => {
  it("another organization's row is not found and stays", async () => {
    const res = await call('DELETE', `/ipm/crop-phi/${PHI_B}`, PEST_AGRONOMIST);
    expect(res.status).toBe(404);
    expect(state.cropPhi.map((r) => r.id)).toContain(PHI_B);
  });

  it("this organization's row is deleted", async () => {
    const res = await call('DELETE', `/ipm/crop-phi/${PHI_A}`, WORKER);
    expect(res.status).toBe(200);
    expect(state.cropPhi.map((r) => r.id)).toEqual([PHI_B]);
  });
});

describe('MSDS files stay with the auditor', () => {
  const AUDITOR = u('auditor');

  it.each([['auditor', AUDITOR], ['IPM admin', IPM_ADMIN]])('%s may delete an MSDS file', async (_l, user) => {
    const res = await call('DELETE', `/ipm/product-catalog/gap-pdfs/${MSDS}`, user);
    expect(res.status).toBe(200);
    expect(pppMsdsService.deleteOrgPdf).toHaveBeenCalled();
  });

  it.each([WORKER, PEST_AGRONOMIST, u('ceo'), u('farm_manager')].map((user) => [user.role, user]))(
    '%s may not delete an MSDS file',
    async (_l, user) => {
      const res = await call('DELETE', `/ipm/product-catalog/gap-pdfs/${MSDS}`, user);
      expect(res.status).toBe(403);
      expect(pppMsdsService.deleteOrgPdf).not.toHaveBeenCalled();
    },
  );

  it('everyone may still list MSDS files', async () => {
    const res = await call('GET', '/ipm/product-catalog/gap-pdfs', u('agronomist'));
    expect(res.status).toBe(200);
  });
});
