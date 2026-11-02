/**
 * Field Staff management access: only pest agronomist, crop agronomist,
 * operation manager and data-entry worker may use the router, and each only
 * for the sites they are assigned to (list, eligible workers, link, create,
 * PIN reset). CEO, farm manager and field staff themselves get 403. Driven
 * through the real router, service and error handler on an ephemeral port with
 * a fake database answering by SQL shape.
 */
jest.mock('../../db/client', () => ({
  dbPool: { query: jest.fn(), connect: jest.fn() },
}));
jest.mock('bcryptjs', () => ({
  __esModule: true,
  default: { hash: jest.fn(async () => 'hashed'), compare: jest.fn(async () => true) },
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
import { fieldStaffRouter } from '../v1/fieldStaff.routes';
import { errorHandler } from '../middleware/errorHandler';

const SITE = '11111111-1111-4111-8111-111111111111';
const OTHER_SITE = '33333333-3333-4333-8333-333333333333';

const WORKER_HERE = '22222222-2222-4222-8222-222222222222';
const WORKER_THERE = '44444444-4444-4444-8444-444444444444';
const WORKER_NO_SITE = '66666666-6666-4666-8666-666666666666';
const STAFF_HERE = '55555555-5555-4555-8555-555555555555';
const STAFF_THERE = '77777777-7777-4777-8777-777777777777';
const STAFF_NO_WORKER_HERE = '88888888-8888-4888-8888-888888888888';
const MISSING = '99999999-9999-4999-8999-999999999999';

const MANAGERS = [
  { userId: 'pa-1', role: 'pest_agronomist', email: 'pa@example.com' },
  { userId: 'ag-1', role: 'agronomist', email: 'ag@example.com' },
  { userId: 'om-1', role: 'operation_manager', email: 'om@example.com' },
  { userId: 'w-1', role: 'worker', email: 'w@example.com' },
];
const DENIED = [
  { userId: 'ceo-1', role: 'ceo', email: 'ceo@example.com' },
  { userId: 'fm-1', role: 'farm_manager', email: 'fm@example.com' },
  { userId: 'sc-1', role: 'scouter', email: 'sc@example.com' },
  { userId: 'op-1', role: 'operator', email: 'op@example.com' },
];
const UNASSIGNED_OM = { userId: 'om-2', role: 'operation_manager', email: 'om2@example.com' };

// Every manager and every denied role is assigned to SITE; nobody to OTHER_SITE.
const assignments: Record<string, string[]> = Object.fromEntries(
  [...MANAGERS, ...DENIED].map((u) => [u.userId, [SITE]]),
);
assignments[UNASSIGNED_OM.userId] = [];

const workers: Record<string, { site_id: string | null; name: string }> = {
  [WORKER_HERE]: { site_id: SITE, name: 'Here Worker' },
  [WORKER_THERE]: { site_id: OTHER_SITE, name: 'There Worker' },
  [WORKER_NO_SITE]: { site_id: null, name: 'Floating Worker' },
};

// Field-staff accounts: worker site (null = no worker row), plus own site assignments.
const staff: Record<string, { site_id: string | null; assigned: string[] }> = {
  [STAFF_HERE]: { site_id: SITE, assigned: [SITE] },
  [STAFF_THERE]: { site_id: OTHER_SITE, assigned: [OTHER_SITE] },
  [STAFF_NO_WORKER_HERE]: { site_id: null, assigned: [SITE] },
};

const staffRow = (id: string) => ({ id, name: id, role: 'scouter', site_id: staff[id].site_id });
const workerRow = (id: string) => ({ id, name: workers[id].name, site_id: workers[id].site_id });

const query = jest.fn(async (sql: string, params: unknown[] = []) => {
  const text = sql.replace(/\s+/g, ' ').trim();
  if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(text)) return { rows: [], rowCount: 0 };

  // AssignmentRepository.getUserAccessibleSiteIds
  if (text.startsWith('SELECT usa.site_id FROM user_site_assignments usa JOIN sites')) {
    const rows = (assignments[params[0] as string] ?? []).map((site_id) => ({ site_id }));
    return { rows, rowCount: rows.length };
  }
  // AssignmentRepository.canUserAccessSite
  if (text.startsWith('SELECT 1 FROM user_site_assignments')) {
    const hit = (assignments[params[0] as string] ?? []).includes(params[1] as string);
    return { rows: hit ? [{ '?column?': 1 }] : [], rowCount: hit ? 1 : 0 };
  }
  // listFieldStaff
  if (text.startsWith('SELECT u.id, u.name, u.email, u.role')) {
    const filter = params[1] as string[] | undefined;
    const rows = Object.keys(staff)
      .filter((id) => staff[id].site_id)
      .map(staffRow)
      .filter((r) => !filter || filter.includes(r.site_id as string));
    return { rows, rowCount: rows.length };
  }
  // listEligibleWorkers
  if (text.startsWith('SELECT w.id, w.employee_id, w.name, w.category, w.is_team_leader, w.site_id, s.name')) {
    const filter = params[1];
    const rows = Object.keys(workers)
      .map(workerRow)
      .filter((r) => {
        if (filter === undefined) return true;
        if (Array.isArray(filter)) return filter.includes(r.site_id as string);
        return r.site_id === filter;
      });
    return { rows, rowCount: rows.length };
  }
  // linkWorkerAsFieldStaff: load worker
  if (text.startsWith('SELECT w.id, w.employee_id, w.name, w.category, w.is_team_leader, w.site_id, w.user_id')) {
    const w = workers[params[0] as string];
    if (!w) return { rows: [], rowCount: 0 };
    return {
      rows: [{
        id: params[0], employee_id: 'E1', name: w.name, category: 'Labour', is_team_leader: false,
        site_id: w.site_id, user_id: null, organization_id: 'org-1',
      }],
      rowCount: 1,
    };
  }
  // getFieldStaffSiteIds
  if (text.startsWith('SELECT u.id, w.site_id AS worker_site_id')) {
    const s = staff[params[0] as string];
    if (!s) return { rows: [], rowCount: 0 };
    return { rows: [{ id: params[0], worker_site_id: s.site_id, assigned_site_ids: s.assigned }], rowCount: 1 };
  }
  if (text.startsWith('SELECT id FROM sites WHERE id = $1')) {
    return { rows: [{ id: params[0] }], rowCount: 1 };
  }
  if (text.startsWith('SELECT id FROM users WHERE LOWER(email)')) return { rows: [], rowCount: 0 };
  if (text.startsWith('SELECT id FROM workers WHERE employee_id')) return { rows: [], rowCount: 0 };
  if (text.startsWith('INSERT INTO users')) {
    return { rows: [{ id: 'new-user', name: params[2], role: params[3] }], rowCount: 1 };
  }
  if (text.startsWith('INSERT INTO workers')) {
    return { rows: [{ id: 'new-worker', site_id: params[4] }], rowCount: 1 };
  }
  if (text.startsWith('UPDATE workers SET user_id')) {
    return { rows: [{ id: params[4], site_id: params[3] }], rowCount: 1 };
  }
  if (text.startsWith('INSERT INTO user_site_assignments')) return { rows: [], rowCount: 1 };
  if (text.startsWith('UPDATE users SET pin_hash')) return { rows: [], rowCount: 1 };
  if (text.startsWith('UPDATE workers SET pin_hash')) return { rows: [], rowCount: 1 };
  throw new Error(`Unexpected SQL in test: ${text.slice(0, 90)}`);
});

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/fs', fieldStaffRouter);
  app.use(errorHandler);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/fs`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  query.mockClear();
  (dbPool.query as jest.Mock).mockImplementation(query);
  (dbPool.connect as jest.Mock).mockResolvedValue({ query, release: jest.fn() });
});

async function call(user: object, method: string, path: string, body?: object) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-test-user': JSON.stringify(user) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
}

const wrote = (prefix: string) =>
  query.mock.calls.some(([sql]) => String(sql).replace(/\s+/g, ' ').trim().startsWith(prefix));

const createBody = (siteId: string) => ({
  name: 'New Scout', employeeId: 'E900', pin: '1234', role: 'scouter', siteId,
});

describe('field staff: allowed roles on their own site', () => {
  describe.each(MANAGERS)('$role', (user) => {
    it('lists only field staff on their sites', async () => {
      const res = await call(user, 'GET', '/');
      expect(res.status).toBe(200);
      expect(res.body.data.map((r: any) => r.id)).toEqual([STAFF_HERE]);
    });

    it('lists only eligible workers on their sites', async () => {
      const res = await call(user, 'GET', '/eligible-workers');
      expect(res.status).toBe(200);
      expect(res.body.data.map((r: any) => r.id)).toEqual([WORKER_HERE]);
    });

    it('can filter eligible workers by their own site', async () => {
      const res = await call(user, 'GET', `/eligible-workers?site_id=${SITE}`);
      expect(res.status).toBe(200);
      expect(res.body.data.map((r: any) => r.id)).toEqual([WORKER_HERE]);
    });

    it('can link a worker on their site', async () => {
      const res = await call(user, 'POST', '/link', { workerId: WORKER_HERE, role: 'operator', pin: '1234' });
      expect(res.status).toBe(201);
      expect(wrote('INSERT INTO users')).toBe(true);
    });

    it('can create field staff on their site', async () => {
      const res = await call(user, 'POST', '/', createBody(SITE));
      expect(res.status).toBe(201);
      expect(wrote('INSERT INTO workers')).toBe(true);
    });

    it('can reset the PIN of staff on their site', async () => {
      const res = await call(user, 'PUT', `/${STAFF_HERE}/pin`, { pin: '5678' });
      expect(res.status).toBe(200);
      expect(wrote('UPDATE users SET pin_hash')).toBe(true);
    });
  });
});

describe('field staff: other sites are denied', () => {
  const om = MANAGERS[2];

  it('rejects an eligible-workers filter for another site', async () => {
    const res = await call(om, 'GET', `/eligible-workers?site_id=${OTHER_SITE}`);
    expect(res.status).toBe(403);
  });

  it('rejects linking a worker to another site', async () => {
    const res = await call(om, 'POST', '/link', {
      workerId: WORKER_HERE, role: 'scouter', pin: '1234', siteId: OTHER_SITE,
    });
    expect(res.status).toBe(403);
    expect(wrote('INSERT INTO users')).toBe(false);
  });

  it("rejects linking another site's worker (even onto your own site)", async () => {
    const res = await call(om, 'POST', '/link', {
      workerId: WORKER_THERE, role: 'scouter', pin: '1234', siteId: SITE,
    });
    expect(res.status).toBe(403);
    expect(wrote('INSERT INTO users')).toBe(false);
  });

  it("rejects linking another site's worker when no site is given", async () => {
    const res = await call(om, 'POST', '/link', { workerId: WORKER_THERE, role: 'scouter', pin: '1234' });
    expect(res.status).toBe(403);
    expect(wrote('INSERT INTO users')).toBe(false);
  });

  it('allows linking a worker with no site onto your own site', async () => {
    const res = await call(om, 'POST', '/link', {
      workerId: WORKER_NO_SITE, role: 'scouter', pin: '1234', siteId: SITE,
    });
    expect(res.status).toBe(201);
  });

  it('rejects creating field staff on another site', async () => {
    const res = await call(om, 'POST', '/', createBody(OTHER_SITE));
    expect(res.status).toBe(403);
    expect(wrote('INSERT INTO users')).toBe(false);
  });

  it("rejects resetting the PIN of another site's staff", async () => {
    const res = await call(om, 'PUT', `/${STAFF_THERE}/pin`, { pin: '5678' });
    expect(res.status).toBe(403);
    expect(wrote('UPDATE users SET pin_hash')).toBe(false);
  });

  it('allows resetting the PIN of staff with no worker row but assigned to your site', async () => {
    const res = await call(om, 'PUT', `/${STAFF_NO_WORKER_HERE}/pin`, { pin: '5678' });
    expect(res.status).toBe(200);
  });

  it('returns 404 for an unknown staff id on PIN reset', async () => {
    const res = await call(om, 'PUT', `/${MISSING}/pin`, { pin: '5678' });
    expect(res.status).toBe(404);
    expect(wrote('UPDATE users SET pin_hash')).toBe(false);
  });

  it('a manager with no site assignments sees nothing and cannot act', async () => {
    const list = await call(UNASSIGNED_OM, 'GET', '/');
    expect(list.status).toBe(200);
    expect(list.body.data).toEqual([]);
    const eligible = await call(UNASSIGNED_OM, 'GET', '/eligible-workers');
    expect(eligible.body.data).toEqual([]);
    expect((await call(UNASSIGNED_OM, 'POST', '/', createBody(SITE))).status).toBe(403);
    expect((await call(UNASSIGNED_OM, 'PUT', `/${STAFF_HERE}/pin`, { pin: '5678' })).status).toBe(403);
    expect((await call(UNASSIGNED_OM, 'POST', '/link', {
      workerId: WORKER_HERE, role: 'scouter', pin: '1234',
    })).status).toBe(403);
  });
});

describe('field staff: other roles are forbidden', () => {
  describe.each(DENIED)('$role', (user) => {
    it.each([
      ['GET', '/', undefined],
      ['GET', '/eligible-workers', undefined],
      ['POST', '/link', { workerId: WORKER_HERE, role: 'scouter', pin: '1234' }],
      ['POST', '/', createBody(SITE)],
      ['PUT', `/${STAFF_HERE}/pin`, { pin: '5678' }],
    ])('%s %s → 403', async (method, path, body) => {
      const res = await call(user, method as string, path as string, body as object | undefined);
      expect(res.status).toBe(403);
      expect(query).not.toHaveBeenCalled();
    });
  });
});
