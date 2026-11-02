/**
 * Crop History tabs write access: on planting & transplant, nursery sowing,
 * germination, open field planting and breeders only workers and agronomists
 * write; every other role that can read the router just watches. The crop list
 * needs a login, and only operation managers, workers and agronomists change it.
 * Driven through the real routers, the real role checks and the real error
 * handler on an ephemeral port, with a small fake database answering by SQL shape.
 */
jest.mock('../../db/client', () => ({
  dbPool: { query: jest.fn(), connect: jest.fn() },
}));
jest.mock('../middleware/auth', () => {
  const actual = jest.requireActual('../middleware/auth');
  const { AppError } = jest.requireActual('../../utils/errors');
  return {
    ...actual,
    // Stand-in for JWT verification: the test user rides in a header.
    auth: (req: any, _res: any, next: any) => {
      const raw = req.headers['x-test-user'];
      if (!raw) return next(new AppError('Authorization header missing or invalid', 'UNAUTHORIZED', 401));
      req.user = JSON.parse(String(raw));
      next();
    },
  };
});
jest.mock('../middleware/tenant', () => ({
  requireOrgId: (req: any) => req.user.organizationId,
}));
jest.mock('../../utils/openFieldSowing', () => ({
  coerceOpenFieldPlantingDates: jest.fn(async (data: any) => data),
}));
jest.mock('../../utils/cropHistoryForPlanting', () => ({
  ...jest.requireActual('../../utils/cropHistoryForPlanting'),
  createCropHistoryForPlanting: jest.fn(async () => null),
}));
jest.mock('../../utils/fieldCropSync', () => ({
  autoClosePrevious: jest.fn(async () => undefined),
  syncFieldCrop: jest.fn(async () => undefined),
  closeCropHistoryForUproot: jest.fn(async () => undefined),
}));
jest.mock('../../services/seasons.service', () => ({
  preparePlantingInsert: jest.fn(async () => ({ seasonId: null, cycleNumber: 1 })),
}));
jest.mock('../../services/plantingImportCycles.service', () => ({
  importPlantingCycles: jest.fn(async () => ({ created: 1 })),
}));
jest.mock('../../services/plantingUproot.service', () => ({
  uprootSchema: jest.requireActual('../../services/plantingUproot.service').uprootSchema,
  uprootPlanting: jest.fn(async () => ({ uprooted: 1 })),
  listActiveOccupancy: jest.fn(async () => []),
}));
jest.mock('../../services/crop.service', () => ({
  CropService: jest.fn().mockImplementation(() => ({
    list: jest.fn(async () => ({ items: [], meta: {} })),
    getById: jest.fn(async (id: string) => ({ id })),
    create: jest.fn(async (body: any) => ({ id: 'crop-new', ...body })),
    update: jest.fn(async (id: string, body: any) => ({ id, ...body })),
    remove: jest.fn(async () => undefined),
    listVarieties: jest.fn(async () => []),
    createVariety: jest.fn(async (_c: string, name: string) => ({ id: 'var-new', name })),
    updateVariety: jest.fn(async (id: string, body: any) => ({ id, ...body })),
    removeVariety: jest.fn(async () => undefined),
  })),
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
import { errorHandler } from '../middleware/errorHandler';
import { plantingRecordRouter } from '../v1/plantingRecord.routes';
import { nurserySowingRecordRouter } from '../v1/nurserySowingRecord.routes';
import { germinationRecordRouter } from '../v1/germinationRecord.routes';
import { openFieldPlantingRouter } from '../v1/openFieldPlanting.routes';
import { breedersRouter } from '../v1/breeders.routes';
import { cropsRouter } from '../v1/crops.routes';

const ORG = '0a000000-0000-4000-8000-000000000001';
const OTHER_ORG = '0a000000-0000-4000-8000-000000000002';
const SITE = '11111111-1111-4111-8111-111111111111';
const OTHER_SITE = '22222222-2222-4222-8222-222222222222';
const FIELD = '33333333-3333-4333-8333-333333333333';
const OTHER_FIELD = '44444444-4444-4444-8444-444444444444';
const ROW = '55555555-5555-4555-8555-555555555555';
const FOREIGN_ROW = '66666666-6666-4666-8666-666666666666';
const VARIETY_A = '77777777-7777-4777-8777-777777777777';
const VARIETY_B = '88888888-8888-4888-8888-888888888888';
const CROP = '99999999-9999-4999-8999-999999999999';

const user = (role: string, organizationId = ORG) => ({ userId: `${role}-1`, role, email: `${role}@x.com`, organizationId });
const WRITERS = ['worker', 'agronomist'].map((r) => user(r));
const WATCHERS = ['ceo', 'farm_manager', 'operation_manager', 'pest_agronomist', 'scouter'].map((r) => user(r));

const siteOrg = new Map([[SITE, ORG], [OTHER_SITE, OTHER_ORG]]);
const fieldOrg = new Map([[FIELD, ORG], [OTHER_FIELD, OTHER_ORG]]);
const rowOrg = new Map([[ROW, ORG], [FOREIGN_ROW, OTHER_ORG]]);

const generic = { rows: [{ id: ROW, next: 0, organization_id: ORG, site_id: SITE }], rowCount: 1 };

const query = jest.fn(async (sql: string, params: any[] = []) => {
  const text = sql.replace(/\s+/g, ' ').trim();
  if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(text)) return { rows: [], rowCount: 0 };
  if (text.startsWith('SELECT id FROM sites WHERE id = $1 AND organization_id = $2')) {
    const hit = siteOrg.get(params[0]) === params[1];
    return { rows: hit ? [{ id: params[0] }] : [], rowCount: hit ? 1 : 0 };
  }
  if (text.startsWith('SELECT pr.field_id, pr.seeding_date FROM planting_records pr')) {
    const hit = rowOrg.get(params[0]) === params[1];
    return { rows: hit ? [{ field_id: null, seeding_date: '2026-03-01' }] : [], rowCount: hit ? 1 : 0 };
  }
  if (/^DELETE FROM (planting_records pr|open_field_planting ofp) WHERE/.test(text)) {
    const hit = rowOrg.get(params[0]) === params[1];
    return { rows: [], rowCount: hit ? 1 : 0 };
  }
  if (text.startsWith('UPDATE open_field_planting ofp SET')) {
    const hit = rowOrg.get(params[params.length - 2]) === params[params.length - 1];
    return hit ? { rows: [{ id: params[params.length - 2] }], rowCount: 1 } : { rows: [], rowCount: 0 };
  }
  if (text.startsWith('UPDATE fields SET is_nursery')) {
    const hit = fieldOrg.get(params[1]) === params[2];
    return { rows: [], rowCount: hit ? 1 : 0 };
  }
  return generic;
});

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/planting-records', plantingRecordRouter);
  app.use('/nursery-sowing-records', nurserySowingRecordRouter);
  app.use('/germination', germinationRecordRouter);
  app.use('/open-field-planting', openFieldPlantingRouter);
  app.use('/breeders', breedersRouter);
  app.use('/crops', cropsRouter);
  app.use(errorHandler);
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  query.mockClear();
  (dbPool.query as jest.Mock).mockImplementation(query);
  (dbPool.connect as jest.Mock).mockResolvedValue({ query, release: jest.fn() });
});

async function call(method: string, path: string, who: object | null, body?: unknown) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (who) headers['x-test-user'] = JSON.stringify(who);
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as any };
}

const writes = () => query.mock.calls.filter(([sql]) => /^\s*(UPDATE|INSERT|DELETE)/.test(sql));

type Write = [method: string, path: string, body?: unknown];

const planting = { seedingDate: '2026-03-01' };
const uproot = { fieldId: FIELD, segments: 'ALL', uprootDate: '2026-06-01' };

const PLANTING_WRITES: Write[] = [
  ['POST', '/planting-records', planting],
  ['PUT', `/planting-records/${ROW}`, { segment: '1' }],
  ['POST', '/planting-records/bulk', { entries: [planting] }],
  ['POST', '/planting-records/import-cycles', { fieldId: FIELD, entries: [planting] }],
  ['POST', `/planting-records/sync-fields?site_id=${SITE}`],
  ['POST', '/planting-records/uproot', uproot],
  ['POST', '/planting-records/reassign-variety', { siteId: SITE, oldVarietyId: VARIETY_A, newVarietyId: VARIETY_B }],
  ['DELETE', `/planting-records/${ROW}`],
  ['PATCH', `/planting-records/nursery/${FIELD}`, { isNursery: true }],
];

const sowing = { siteId: SITE, seedingDate: '2026-02-01' };
const SOWING_WRITES: Write[] = [
  ['POST', '/nursery-sowing-records', sowing],
  ['PUT', `/nursery-sowing-records/${ROW}`, { seedBatch: 'B-1' }],
  ['POST', '/nursery-sowing-records/bulk', { entries: [sowing] }],
  ['DELETE', `/nursery-sowing-records/${ROW}`],
];

const GERMINATION_WRITES: Write[] = [
  ['POST', '/germination/sections', { name: 'Table 1', siteId: SITE }],
  ['PUT', `/germination/sections/${ROW}`, { name: 'Table 2' }],
  ['DELETE', `/germination/sections/${ROW}`],
  ['POST', '/germination/records', { sectionId: ROW, varietyName: 'Duckvine' }],
  ['PUT', `/germination/records/${ROW}`, { varietyName: 'Duckvine F1' }],
  ['DELETE', `/germination/records/${ROW}`],
  ['POST', '/germination/bulk', { siteId: SITE, sections: [{ name: 'T', records: [{ varietyName: 'V' }] }] }],
];

const OPEN_FIELD_WRITES: Write[] = [
  ['POST', '/open-field-planting', planting],
  ['PUT', `/open-field-planting/${ROW}`, { segment: '1' }],
  ['POST', '/open-field-planting/bulk', { entries: [planting] }],
  ['POST', '/open-field-planting/import-cycles', { fieldId: FIELD, entries: [planting] }],
  ['POST', `/open-field-planting/sync-fields?site_id=${SITE}`],
  ['POST', '/open-field-planting/uproot', uproot],
  ['DELETE', `/open-field-planting/${ROW}`],
];

const BREEDER_WRITES: Write[] = [
  ['POST', '/breeders', { name: 'Enza Zaden' }],
];

const ALL_WRITES: Array<[string, Write[]]> = [
  ['planting records', PLANTING_WRITES],
  ['nursery sowing', SOWING_WRITES],
  ['germination', GERMINATION_WRITES],
  ['open field planting', OPEN_FIELD_WRITES],
  ['breeders', BREEDER_WRITES],
];

describe.each(ALL_WRITES)('%s: workers and agronomists write', (_name, list) => {
  it.each(WRITERS.map((u) => [u.role, u]))('%s succeeds on every write', async (_role, who) => {
    for (const [method, path, body] of list) {
      const res = await call(method, path, who, body);
      expect([method, path, res.status]).toEqual([method, path, expect.any(Number)]);
      expect([method, path, res.status >= 200 && res.status < 300]).toEqual([method, path, true]);
    }
  });
});

describe.each(ALL_WRITES)('%s: everyone else watches', (_name, list) => {
  it.each(WATCHERS.map((u) => [u.role, u]))('%s gets 403 on every write and nothing is written', async (_role, who) => {
    for (const [method, path, body] of list) {
      const res = await call(method, path, who, body);
      expect([method, path, res.status]).toEqual([method, path, 403]);
    }
    expect(writes()).toHaveLength(0);
  });
});

describe('reads stay open to current readers', () => {
  it('worker can now read germination tables', async () => {
    expect((await call('GET', `/germination/sections?site_id=${SITE}`, user('worker'))).status).toBe(200);
    expect((await call('GET', `/germination/records?section_id=${ROW}`, user('worker'))).status).toBe(200);
  });

  it.each(['ceo', 'farm_manager', 'operation_manager', 'agronomist'])('%s can read germination', async (role) => {
    expect((await call('GET', `/germination/sections?site_id=${SITE}`, user(role))).status).toBe(200);
  });

  it.each(['ceo', 'farm_manager', 'operation_manager', 'pest_agronomist', 'scouter', 'operator'])(
    '%s can still read planting and nursery sowing records',
    async (role) => {
      expect((await call('GET', `/planting-records?site_id=${SITE}`, user(role))).status).toBe(200);
      expect((await call('GET', `/nursery-sowing-records?site_id=${SITE}`, user(role))).status).toBe(200);
    },
  );

  it('operator still cannot write planting records', async () => {
    expect((await call('POST', '/planting-records', user('operator'), planting)).status).toBe(403);
  });

  it.each(['ceo', 'farm_manager', 'operation_manager'])('%s can read open field planting and breeders', async (role) => {
    expect((await call('GET', `/open-field-planting?site_id=${SITE}`, user(role))).status).toBe(200);
    expect((await call('GET', '/breeders', user(role))).status).toBe(200);
  });
});

describe('open field uproot', () => {
  it('a worker may now uproot', async () => {
    const res = await call('POST', '/open-field-planting/uproot', user('worker'), uproot);
    expect(res.status).toBe(200);
    expect(res.json.data).toEqual({ uprooted: 1 });
  });
});

describe('rows in another organization are invisible', () => {
  const agronomist = user('agronomist');

  it('reassign-variety on a foreign site is 404 and touches nothing', async () => {
    const res = await call('POST', '/planting-records/reassign-variety', agronomist, {
      siteId: OTHER_SITE, oldVarietyId: VARIETY_A, newVarietyId: VARIETY_B,
    });
    expect(res.status).toBe(404);
    expect(writes()).toHaveLength(0);
  });

  it('DELETE of a foreign planting record is 404', async () => {
    expect((await call('DELETE', `/planting-records/${FOREIGN_ROW}`, agronomist)).status).toBe(404);
  });

  it('PUT of a foreign planting record is 404', async () => {
    expect((await call('PUT', `/planting-records/${FOREIGN_ROW}`, agronomist, { segment: '2' })).status).toBe(404);
    expect(writes()).toHaveLength(0);
  });

  it('sync-fields on a foreign site is 404', async () => {
    expect((await call('POST', `/planting-records/sync-fields?site_id=${OTHER_SITE}`, agronomist)).status).toBe(404);
    expect((await call('POST', `/open-field-planting/sync-fields?site_id=${OTHER_SITE}`, agronomist)).status).toBe(404);
    expect(writes()).toHaveLength(0);
  });

  it('nursery flag on a foreign field is 404', async () => {
    expect((await call('PATCH', `/planting-records/nursery/${OTHER_FIELD}`, agronomist, { isNursery: true })).status).toBe(404);
  });

  it('PUT and DELETE of a foreign open field record are 404', async () => {
    expect((await call('PUT', `/open-field-planting/${FOREIGN_ROW}`, agronomist, { segment: '2' })).status).toBe(404);
    expect((await call('DELETE', `/open-field-planting/${FOREIGN_ROW}`, agronomist)).status).toBe(404);
  });
});

describe('crop list', () => {
  const CROP_WRITES: Write[] = [
    ['POST', '/crops', { name: 'Cherry Tomato' }],
    ['PUT', `/crops/${CROP}`, { name: 'Cherry Tomatoes' }],
    ['DELETE', `/crops/${CROP}`],
    ['POST', `/crops/${CROP}/varieties`, { name: 'Duckvine F1' }],
    ['PUT', `/crops/${CROP}/varieties/${VARIETY_A}`, { name: 'Duckvine' }],
    ['DELETE', `/crops/${CROP}/varieties/${VARIETY_A}`],
  ];

  it('anonymous callers get 401 on reads and writes', async () => {
    expect((await call('GET', '/crops', null)).status).toBe(401);
    expect((await call('GET', `/crops/${CROP}/varieties`, null)).status).toBe(401);
    for (const [method, path, body] of CROP_WRITES) {
      expect([method, path, (await call(method, path, null, body)).status]).toEqual([method, path, 401]);
    }
  });

  const CROP_ADD_RENAME = CROP_WRITES.filter(([method]) => method !== 'DELETE');
  const CROP_DELETES = CROP_WRITES.filter(([method]) => method === 'DELETE');

  it('operation_manager can add, rename and delete crops and varieties', async () => {
    for (const [method, path, body] of CROP_WRITES) {
      const { status } = await call(method, path, user('operation_manager'), body);
      expect([method, path, status < 300]).toEqual([method, path, true]);
    }
  });

  it.each(['worker', 'agronomist'])('%s can add and rename but not delete crops and varieties', async (role) => {
    for (const [method, path, body] of CROP_ADD_RENAME) {
      const { status } = await call(method, path, user(role), body);
      expect([method, path, status < 300]).toEqual([method, path, true]);
    }
    for (const [method, path, body] of CROP_DELETES) {
      expect([method, path, (await call(method, path, user(role), body)).status]).toEqual([method, path, 403]);
    }
  });

  it.each(['ceo', 'farm_manager', 'pest_agronomist', 'scouter', 'operator'])('%s reads but gets 403 on writes', async (role) => {
    expect((await call('GET', '/crops', user(role))).status).toBe(200);
    expect((await call('GET', `/crops/${CROP}/varieties`, user(role))).status).toBe(200);
    for (const [method, path, body] of CROP_WRITES) {
      expect([method, path, (await call(method, path, user(role), body)).status]).toEqual([method, path, 403]);
    }
  });
});
