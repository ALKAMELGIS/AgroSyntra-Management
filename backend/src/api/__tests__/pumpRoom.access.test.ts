/**
 * Pump room write access: only the data-entry worker, on a site they are
 * assigned to, may write. Every other role on the router is view-only, and the
 * deleted-sheet recovery is for the worker, agronomist and operation manager (not the
 * CEO or farm manager). Driven through the real router and
 * error handler on an ephemeral port with a fake database answering by SQL shape.
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
jest.mock('../v1/health.routes', () => ({ incrementErrorCount: jest.fn() }));
jest.mock('../../utils/sentry', () => ({ captureException: jest.fn() }));
jest.mock('../../utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { dbPool } from '../../db/client';
import { pumpRoomRouter } from '../v1/pumpRoom.routes';
import { errorHandler } from '../middleware/errorHandler';

const SITE = '11111111-1111-4111-8111-111111111111';
const OTHER_SITE = '33333333-3333-4333-8333-333333333333';
const ROW = '22222222-2222-4222-8222-222222222222';
const OTHER_ROW = '44444444-4444-4444-8444-444444444444';
const MISSING_ROW = '55555555-5555-4555-8555-555555555555';

const WORKER = { userId: 'w-1', role: 'worker', email: 'w@example.com' };
const UNASSIGNED_WORKER = { userId: 'w-2', role: 'worker', email: 'w2@example.com' };
const NON_WORKERS = [
  { userId: 'ag-1', role: 'agronomist', email: 'ag@example.com' },
  { userId: 'om-1', role: 'operation_manager', email: 'om@example.com' },
  { userId: 'ceo-1', role: 'ceo', email: 'ceo@example.com' },
  { userId: 'fm-1', role: 'farm_manager', email: 'fm@example.com' },
];
const RESTORERS = [WORKER, ...NON_WORKERS.filter((u) => ['agronomist', 'operation_manager'].includes(u.role))];
const NON_RESTORERS = NON_WORKERS.filter((u) => ['ceo', 'farm_manager'].includes(u.role));

// Everyone is assigned to SITE except the unassigned worker; nobody to OTHER_SITE.
const assignments = new Set([WORKER, ...NON_WORKERS].map((u) => `${u.userId}:${SITE}`));
const rowSites: Record<string, string> = { [ROW]: SITE, [OTHER_ROW]: OTHER_SITE };

const dbRow = (id: string) => ({
  id,
  site_id: rowSites[id] ?? SITE,
  record_date: '2026-09-01',
  meter_id: 'M1',
  usage_area: 'A',
  pumps: [{ reading: 1, usage: null }],
  reading_1: 1,
  usage_1: null,
  reading_2: null,
  usage_2: null,
});

const query = jest.fn(async (sql: string, params: unknown[] = []) => {
  const text = sql.replace(/\s+/g, ' ').trim();
  if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(text)) return { rows: [], rowCount: 0 };

  if (text.startsWith('SELECT 1 FROM user_site_assignments')) {
    const hit = assignments.has(`${params[0]}:${params[1]}`);
    return { rows: hit ? [{ '?column?': 1 }] : [], rowCount: hit ? 1 : 0 };
  }
  if (/^SELECT site_id FROM pump_room_\w+ WHERE id = \$1$/.test(text)) {
    const site = rowSites[params[0] as string];
    return site ? { rows: [{ site_id: site }], rowCount: 1 } : { rows: [], rowCount: 0 };
  }
  if (/^SELECT \* FROM pump_room_\w+ WHERE deleted_at IS NULL/.test(text)) {
    return { rows: [dbRow(ROW)], rowCount: 1 };
  }
  if (/^SELECT \* FROM pump_room_\w+ WHERE id = \$1$/.test(text)) {
    return { rows: [dbRow(params[0] as string)], rowCount: 1 };
  }
  if (/^INSERT INTO pump_room_(electricity|water|fogger) /.test(text)) {
    return { rows: [dbRow(ROW)], rowCount: 1 };
  }
  if (/^UPDATE pump_room_(electricity|water|fogger) SET .* WHERE id = /.test(text)) {
    return { rows: [dbRow(ROW)], rowCount: 1 };
  }
  if (/^DELETE FROM pump_room_(electricity|water|fogger) WHERE id = \$1$/.test(text)) {
    return { rows: [], rowCount: 1 };
  }
  if (text.startsWith('INSERT INTO pump_room_deleted_sheets')) {
    return { rows: [{ id: 'del-1' }], rowCount: 1 };
  }
  if (/^UPDATE pump_room_\w+ SET deleted_at = NOW\(\)/.test(text)) {
    return { rows: [{ id: ROW }], rowCount: 1 };
  }
  if (text.startsWith('UPDATE pump_room_deleted_sheets SET record_count')) return { rows: [], rowCount: 1 };
  if (text.startsWith('SELECT * FROM site_pump_room_config')) return { rows: [], rowCount: 0 };
  if (text.startsWith('INSERT INTO site_pump_room_config')) {
    return {
      rows: [{ site_id: params[0], water_pump_count: params[1], electricity_pump_count: params[2], fogger_pump_count: params[3] }],
      rowCount: 1,
    };
  }
  if (text.startsWith('SELECT d.*, s.name AS site_name')) return { rows: [], rowCount: 0 };
  if (text.startsWith('SELECT * FROM pump_room_deleted_sheets')) {
    return { rows: [{ id: params[0], record_type: 'water' }], rowCount: 1 };
  }
  if (/^UPDATE pump_room_\w+ SET deleted_at = NULL/.test(text)) return { rows: [], rowCount: 1 };
  if (text.startsWith('UPDATE pump_room_deleted_sheets SET restored_at')) return { rows: [], rowCount: 1 };
  throw new Error(`Unexpected SQL in test: ${text.slice(0, 80)}`);
});

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/pr', pumpRoomRouter);
  app.use(errorHandler);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/pr`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  query.mockClear();
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

const writesMade = () =>
  query.mock.calls.filter(([sql]) => /^\s*(UPDATE|INSERT|DELETE)/.test(sql as string));

type Req = { name: string; method: string; path: string; body?: unknown; ok: number };

function writeRequests(kind: string, site = SITE, row = ROW): Req[] {
  return [
    { name: 'create', method: 'POST', path: `/${kind}`, body: { siteId: site, recordDate: '2026-09-02', pumps: [] }, ok: 201 },
    { name: 'update', method: 'PUT', path: `/${kind}/${row}`, body: { pumpIndex: 0, reading: 5 }, ok: 200 },
    { name: 'delete row', method: 'DELETE', path: `/${kind}/${row}`, ok: 200 },
    { name: 'bulk import', method: 'POST', path: `/${kind}/bulk`, body: { siteId: site, records: [{ recordDate: '2026-09-03' }] }, ok: 200 },
    { name: 'delete month sheet', method: 'DELETE', path: `/${kind}/sheet?month=2026-09&site_id=${site}`, ok: 200 },
  ];
}

const configWrite = (site = SITE): Req => ({
  name: 'add pump (config)',
  method: 'PUT',
  path: '/config',
  body: { siteId: site, waterPumpCount: 3 },
  ok: 200,
});

const KINDS = ['electricity', 'water', 'fogger'];

describe('the data-entry worker can write', () => {
  for (const kind of KINDS) {
    for (const r of writeRequests(kind)) {
      it(`${kind}: ${r.name}`, async () => {
        const res = await call(r.method, r.path, WORKER, r.body);
        expect(res.status).toBe(r.ok);
        expect(writesMade().length).toBeGreaterThan(0);
      });
    }
  }

  it('config: add pump', async () => {
    const r = configWrite();
    const res = await call(r.method, r.path, WORKER, r.body);
    expect(res.status).toBe(200);
    expect(res.json.data.waterPumpCount).toBe(3);
  });

  it('returns 404 when updating or deleting a row that does not exist', async () => {
    const put = await call('PUT', `/water/${MISSING_ROW}`, WORKER, { reading1: 1 });
    expect(put.status).toBe(404);
    const del = await call('DELETE', `/water/${MISSING_ROW}`, WORKER);
    expect(del.status).toBe(404);
    expect(writesMade()).toHaveLength(0);
  });
});

describe('other roles are view-only', () => {
  for (const user of NON_WORKERS) {
    it(`${user.role} gets 403 on every write and nothing is written`, async () => {
      const all = [...KINDS.flatMap((k) => writeRequests(k)), configWrite()];
      for (const r of all) {
        const res = await call(r.method, r.path, user, r.body);
        expect({ req: `${r.method} ${r.path}`, status: res.status }).toEqual({
          req: `${r.method} ${r.path}`,
          status: 403,
        });
      }
      expect(writesMade()).toHaveLength(0);
    });
  }
});

describe('reads stay open', () => {
  for (const user of [WORKER, ...NON_WORKERS]) {
    it(`${user.role} can read records and config`, async () => {
      for (const kind of KINDS) {
        const res = await call('GET', `/${kind}?site_id=${SITE}&month=2026-09`, user);
        expect(res.status).toBe(200);
        expect(res.json.data).toHaveLength(1);
      }
      const cfg = await call('GET', `/config?site_id=${SITE}`, user);
      expect(cfg.status).toBe(200);
    });
  }
});

describe('site access', () => {
  it('a worker not assigned to the site gets 403 on every write', async () => {
    const all = [...KINDS.flatMap((k) => writeRequests(k)), configWrite()];
    for (const r of all) {
      const res = await call(r.method, r.path, UNASSIGNED_WORKER, r.body);
      expect({ req: `${r.method} ${r.path}`, status: res.status }).toEqual({
        req: `${r.method} ${r.path}`,
        status: 403,
      });
    }
    expect(writesMade()).toHaveLength(0);
  });

  it('an assigned worker cannot write to another site or its rows', async () => {
    const all = [...KINDS.flatMap((k) => writeRequests(k, OTHER_SITE, OTHER_ROW)), configWrite(OTHER_SITE)];
    for (const r of all) {
      const res = await call(r.method, r.path, WORKER, r.body);
      expect({ req: `${r.method} ${r.path}`, status: res.status }).toEqual({
        req: `${r.method} ${r.path}`,
        status: 403,
      });
    }
    expect(writesMade()).toHaveLength(0);
  });
});

describe('deleted-sheet recovery: worker, agronomist and operation manager', () => {
  it('rejects the CEO and the farm manager', async () => {
    for (const user of NON_RESTORERS) {
      const list = await call('GET', '/deleted-sheets', user);
      expect(list.status).toBe(403);
      const restore = await call('POST', '/deleted-sheets/del-1/restore', user);
      expect(restore.status).toBe(403);
    }
    expect(writesMade()).toHaveLength(0);
  });

  it('allows the worker, agronomist and operation manager to list and restore', async () => {
    for (const user of RESTORERS) {
      const list = await call('GET', '/deleted-sheets', user);
      expect(list.status).toBe(200);
      const restore = await call('POST', '/deleted-sheets/del-1/restore', user);
      expect(restore.status).toBe(200);
    }
  });
});
