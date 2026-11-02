/**
 * Zone (country) and site access.
 *
 * - The CEO assigns farm managers to zones (GET/POST/DELETE
 *   /assignments/users/:id/zones). Nobody else may, and both the user and the
 *   zone must be in the CEO's organization.
 * - A farm manager reaches every site inside their zones plus sites assigned to
 *   them directly.
 * - Zones & Sites writes: CEO everything in the org; farm manager renames their
 *   own zones and creates / renames / deletes sites in them; nobody else writes.
 *
 * Driven through the real routers, repositories and error handler on an
 * ephemeral port with a fake database that answers by SQL shape from a small
 * in-memory world.
 */
jest.mock('../../db/client', () => ({
  dbPool: { query: jest.fn(), connect: jest.fn() },
}));
jest.mock('../middleware/auth', () => {
  const { AppError } = jest.requireActual('../../utils/errors');
  const authorize = (...roles: string[]) => (req: any, _res: any, next: any) => {
    if (!req.user) return next(new AppError('Authentication required', 'UNAUTHORIZED', 401));
    if (!roles.includes(req.user.role)) return next(new AppError('Access denied', 'FORBIDDEN', 403));
    return next();
  };
  return {
    auth: (req: any, _res: any, next: any) => {
      const raw = req.headers['x-test-user'];
      if (raw) req.user = JSON.parse(String(raw));
      next();
    },
    authorize,
    requireCeo: authorize('ceo'),
    requireManager: authorize('ceo', 'farm_manager'),
  };
});
jest.mock('../middleware/tenant', () => ({
  requireOrgId: (req: any) => req.user?.organizationId ?? 'org-1',
}));
jest.mock('../../services/auditLog.service', () => ({ logAuditEvent: jest.fn(async () => undefined) }));
jest.mock('../v1/health.routes', () => ({ incrementErrorCount: jest.fn() }));
jest.mock('../../utils/sentry', () => ({ captureException: jest.fn() }));
jest.mock('../../utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { dbPool } from '../../db/client';
import { countriesRouter } from '../v1/countries.routes';
import { sitesRouter } from '../v1/sites.routes';
import { assignmentsRouter } from '../v1/assignments.routes';
import { errorHandler } from '../middleware/errorHandler';
import { auth } from '../middleware/auth';
import { logAuditEvent } from '../../services/auditLog.service';

// ---- In-memory world ------------------------------------------------------

const Z_FM = 'a1111111-1111-4111-8111-111111111111'; // assigned to FM
const Z_OTHER = 'a2222222-2222-4222-8222-222222222222'; // not assigned to FM
const Z_EMPTY = 'a3333333-3333-4333-8333-333333333333'; // assigned to FM, no sites
const Z_X = 'a4444444-4444-4444-8444-444444444444'; // another organization

const S_FM = 'b1111111-1111-4111-8111-111111111111'; // in Z_FM
const S_OTHER = 'b2222222-2222-4222-8222-222222222222'; // in Z_OTHER
const S_DIRECT = 'b3333333-3333-4333-8333-333333333333'; // in Z_OTHER, assigned to FM directly
const S_X = 'b4444444-4444-4444-8444-444444444444'; // in Z_X (org-2)

const U = {
  ceo: 'c0000000-0000-4000-8000-000000000001',
  fm: 'c0000000-0000-4000-8000-000000000002',
  fmNone: 'c0000000-0000-4000-8000-000000000003',
  om: 'c0000000-0000-4000-8000-000000000004',
  worker: 'c0000000-0000-4000-8000-000000000005',
  ceo2: 'c0000000-0000-4000-8000-000000000006',
  fm2: 'c0000000-0000-4000-8000-000000000007',
};

const CEO = { userId: U.ceo, role: 'ceo', email: 'ceo@x', organizationId: 'org-1' };
const FM = { userId: U.fm, role: 'farm_manager', email: 'fm@x', organizationId: 'org-1' };
const FM_NONE = { userId: U.fmNone, role: 'farm_manager', email: 'fm0@x', organizationId: 'org-1' };
const OM = { userId: U.om, role: 'operation_manager', email: 'om@x', organizationId: 'org-1' };
const WORKER = { userId: U.worker, role: 'worker', email: 'w@x', organizationId: 'org-1' };
const CEO2 = { userId: U.ceo2, role: 'ceo', email: 'ceo2@x', organizationId: 'org-2' };

type Zone = { id: string; name: string; code: string; organization_id: string; deleted_at: string | null };
type Site = { id: string; name: string; country_id: string; organization_id: string; deleted_at: string | null };
type UserRow = { id: string; email: string; name: string; role: string; organization_id: string };

let zones: Record<string, Zone>;
let sites: Record<string, Site>;
let users: Record<string, UserRow>;
let zoneAssign: Set<string>;
let siteAssign: Set<string>;
let writes: string[];

function resetWorld() {
  zones = {
    [Z_FM]: { id: Z_FM, name: 'North', code: 'NO', organization_id: 'org-1', deleted_at: null },
    [Z_OTHER]: { id: Z_OTHER, name: 'South', code: 'SO', organization_id: 'org-1', deleted_at: null },
    [Z_EMPTY]: { id: Z_EMPTY, name: 'East', code: 'EA', organization_id: 'org-1', deleted_at: null },
    [Z_X]: { id: Z_X, name: 'Foreign', code: 'FX', organization_id: 'org-2', deleted_at: null },
  };
  sites = {
    [S_FM]: { id: S_FM, name: 'Site N', country_id: Z_FM, organization_id: 'org-1', deleted_at: null },
    [S_OTHER]: { id: S_OTHER, name: 'Site S', country_id: Z_OTHER, organization_id: 'org-1', deleted_at: null },
    [S_DIRECT]: { id: S_DIRECT, name: 'Site D', country_id: Z_OTHER, organization_id: 'org-1', deleted_at: null },
    [S_X]: { id: S_X, name: 'Site X', country_id: Z_X, organization_id: 'org-2', deleted_at: null },
  };
  const user = (id: string, role: string, org: string): UserRow => ({
    id, email: `${id}@x`, name: id, role, organization_id: org,
  });
  users = {
    [U.ceo]: user(U.ceo, 'ceo', 'org-1'),
    [U.fm]: user(U.fm, 'farm_manager', 'org-1'),
    [U.fmNone]: user(U.fmNone, 'farm_manager', 'org-1'),
    [U.om]: user(U.om, 'operation_manager', 'org-1'),
    [U.worker]: user(U.worker, 'worker', 'org-1'),
    [U.ceo2]: user(U.ceo2, 'ceo', 'org-2'),
    [U.fm2]: user(U.fm2, 'farm_manager', 'org-2'),
  };
  zoneAssign = new Set([`${U.fm}:${Z_FM}`, `${U.fm}:${Z_EMPTY}`]);
  siteAssign = new Set([`${U.fm}:${S_DIRECT}`, `${U.om}:${S_OTHER}`, `${U.worker}:${S_FM}`]);
  writes = [];
}

const liveSite = (id: string) => (sites[id] && !sites[id].deleted_at ? sites[id] : null);
const liveZone = (id: string) => (zones[id] && !zones[id].deleted_at ? zones[id] : null);

function fmCanReach(userId: string, siteId: string): boolean {
  const s = sites[siteId];
  if (!s) return false;
  if (siteAssign.has(`${userId}:${siteId}`)) return true;
  const z = liveZone(s.country_id);
  return Boolean(z && z.organization_id === s.organization_id && zoneAssign.has(`${userId}:${z.id}`));
}

const ok = (rows: any[]) => ({ rows, rowCount: rows.length });
const siteOut = (s: Site) => ({ ...s, location: null, total_area: null });

function paramIndex(text: string, re: RegExp): number | null {
  const m = text.match(re);
  return m ? Number(m[1]) - 1 : null;
}

const query = jest.fn(async (sql: string, params: any[] = []) => {
  const t = sql.replace(/\s+/g, ' ').trim();

  // ---- AssignmentRepository: site access
  if (t.startsWith('SELECT s.id FROM sites s WHERE s.organization_id = $2')) {
    const [userId, org] = params;
    return ok(Object.values(sites)
      .filter((s) => !s.deleted_at && s.organization_id === org && fmCanReach(userId, s.id))
      .map((s) => ({ id: s.id })));
  }
  if (t.startsWith('SELECT id FROM sites WHERE organization_id = $1')) {
    return ok(Object.values(sites).filter((s) => !s.deleted_at && s.organization_id === params[0]).map((s) => ({ id: s.id })));
  }
  if (t.startsWith('SELECT usa.site_id FROM user_site_assignments usa JOIN sites')) {
    const [userId, org] = params;
    return ok(Object.values(sites)
      .filter((s) => !s.deleted_at && s.organization_id === org && siteAssign.has(`${userId}:${s.id}`))
      .map((s) => ({ site_id: s.id })));
  }
  if (t.startsWith('SELECT 1 FROM sites s WHERE s.id = $2')) {
    const [userId, siteId, org] = params;
    const s = liveSite(siteId);
    return ok(s && s.organization_id === org && fmCanReach(userId, siteId) ? [{ x: 1 }] : []);
  }
  if (t.startsWith('SELECT 1 FROM sites WHERE id = $1 AND organization_id = $2')) {
    const s = liveSite(params[0]);
    return ok(s && s.organization_id === params[1] ? [{ x: 1 }] : []);
  }
  if (t.startsWith('SELECT 1 FROM user_site_assignments usa JOIN sites s')) {
    const [userId, siteId, org] = params;
    const s = sites[siteId];
    return ok(s && s.organization_id === org && siteAssign.has(`${userId}:${siteId}`) ? [{ x: 1 }] : []);
  }
  // farm areas / fields (my-access): none in this world
  if (/^SELECT (DISTINCT )?(fa|f)\.id/.test(t)) return ok([]);

  // ---- AssignmentRepository: zones
  if (t.startsWith('SELECT uza.country_id FROM user_zone_assignments uza')) {
    const [userId, org] = params;
    return ok(Object.values(zones)
      .filter((z) => !z.deleted_at && z.organization_id === org && zoneAssign.has(`${userId}:${z.id}`))
      .map((z) => ({ country_id: z.id })));
  }
  if (t.startsWith('SELECT 1 FROM user_zone_assignments uza')) {
    const [userId, zoneId, org] = params;
    const z = liveZone(zoneId);
    return ok(z && z.organization_id === org && zoneAssign.has(`${userId}:${zoneId}`) ? [{ x: 1 }] : []);
  }
  if (t.startsWith('SELECT uza.*, c.name AS country_name')) {
    const [userId, org] = params;
    return ok(Object.values(zones)
      .filter((z) => !z.deleted_at && z.organization_id === org && zoneAssign.has(`${userId}:${z.id}`))
      .map((z) => ({ id: `za-${z.id}`, user_id: userId, country_id: z.id, country_name: z.name, country_code: z.code })));
  }
  if (t.startsWith('INSERT INTO user_zone_assignments')) {
    const [userId, zoneId, by] = params;
    writes.push('INSERT user_zone_assignments');
    const key = `${userId}:${zoneId}`;
    if (zoneAssign.has(key)) return ok([]);
    zoneAssign.add(key);
    return ok([{ id: 'za-new', user_id: userId, country_id: zoneId, assigned_by: by }]);
  }
  if (t.startsWith('DELETE FROM user_zone_assignments')) {
    writes.push('DELETE user_zone_assignments');
    const existed = zoneAssign.delete(`${params[0]}:${params[1]}`);
    return { rows: [], rowCount: existed ? 1 : 0 };
  }
  if (t.startsWith('SELECT id FROM countries WHERE organization_id = $1')) {
    return ok(Object.values(zones).filter((z) => !z.deleted_at && z.organization_id === params[0]).map((z) => ({ id: z.id })));
  }
  if (t.startsWith('SELECT DISTINCT country_id FROM sites WHERE id = ANY')) {
    const ids: string[] = params[0];
    return ok(Array.from(new Set(ids.map((id) => liveSite(id)?.country_id).filter(Boolean))).map((c) => ({ country_id: c })));
  }

  // ---- Country / site scope lookups
  if (t.startsWith('SELECT organization_id FROM countries WHERE id = $1')) {
    const z = liveZone(params[0]);
    return ok(z ? [{ organization_id: z.organization_id }] : []);
  }
  if (t.startsWith('SELECT country_id, organization_id FROM sites WHERE id = $1')) {
    const s = liveSite(params[0]);
    return ok(s ? [{ country_id: s.country_id, organization_id: s.organization_id }] : []);
  }

  // ---- CountryRepository
  if (t.startsWith('SELECT COUNT(*) FROM countries') || t.startsWith('SELECT * FROM countries WHERE deleted_at IS NULL')) {
    const org = params[0];
    const ids = params.find((p) => Array.isArray(p)) as string[] | undefined;
    const rows = Object.values(zones)
      .filter((z) => !z.deleted_at && z.organization_id === org && (!ids || ids.includes(z.id)))
      .sort((a, b) => a.name.localeCompare(b.name));
    return t.startsWith('SELECT COUNT') ? ok([{ count: String(rows.length) }]) : ok(rows);
  }
  if (t.startsWith('SELECT * FROM countries WHERE id = $1')) {
    const z = liveZone(params[0]);
    return ok(z ? [z] : []);
  }
  if (t.startsWith('INSERT INTO countries')) {
    writes.push('INSERT countries');
    return ok([{ id: 'new-zone', name: params[0], code: params[1], organization_id: params[2] }]);
  }
  if (t.startsWith('UPDATE countries SET deleted_at')) {
    writes.push('DELETE countries');
    const z = liveZone(params[0]);
    if (z) z.deleted_at = 'now';
    return { rows: [], rowCount: z ? 1 : 0 };
  }
  if (t.startsWith('UPDATE countries SET')) {
    writes.push('UPDATE countries');
    const id = params[params.length - 1];
    const z = liveZone(id);
    if (!z) return { rows: [], rowCount: 0 };
    const nameIdx = paramIndex(t, /name = \$(\d+)/);
    const codeIdx = paramIndex(t, /code = \$(\d+)/);
    if (nameIdx !== null) z.name = params[nameIdx];
    if (codeIdx !== null) z.code = params[codeIdx];
    return ok([z]);
  }

  // ---- SiteRepository
  if (t.startsWith('SELECT COUNT(*) FROM sites') || t.startsWith('SELECT * FROM sites WHERE deleted_at IS NULL')) {
    const orgIdx = paramIndex(t, /organization_id = \$(\d+)/);
    const countryIdx = paramIndex(t, /country_id = \$(\d+)/);
    const idsIdx = paramIndex(t, /id = ANY\(\$(\d+)/);
    const rows = Object.values(sites)
      .filter((s) => !s.deleted_at)
      .filter((s) => orgIdx === null || s.organization_id === params[orgIdx])
      .filter((s) => countryIdx === null || s.country_id === params[countryIdx])
      .filter((s) => idsIdx === null || (params[idsIdx] as string[]).includes(s.id))
      .sort((a, b) => a.name.localeCompare(b.name));
    return t.startsWith('SELECT COUNT') ? ok([{ count: String(rows.length) }]) : ok(rows.map(siteOut));
  }
  if (t.startsWith('SELECT * FROM sites WHERE id = $1')) {
    const s = liveSite(params[0]);
    return ok(s ? [siteOut(s)] : []);
  }
  if (t.startsWith('INSERT INTO sites')) {
    writes.push('INSERT sites');
    return ok([{ id: 'new-site', country_id: params[0], name: params[1], organization_id: params[4] }]);
  }
  if (t.startsWith('UPDATE sites SET deleted_at')) {
    writes.push('DELETE sites');
    const s = liveSite(params[0]);
    if (s) s.deleted_at = 'now';
    return { rows: [], rowCount: s ? 1 : 0 };
  }
  if (t.startsWith('UPDATE sites SET')) {
    writes.push('UPDATE sites');
    const id = params[params.length - 1];
    const s = liveSite(id);
    if (!s) return { rows: [], rowCount: 0 };
    const nameIdx = paramIndex(t, /name = \$(\d+)/);
    const countryIdx = paramIndex(t, /country_id = \$(\d+)/);
    if (nameIdx !== null) s.name = params[nameIdx];
    if (countryIdx !== null) s.country_id = params[countryIdx];
    return ok([siteOut(s)]);
  }

  // ---- UserRepository
  if (t.startsWith('SELECT * FROM users WHERE id = $1')) {
    const u = users[params[0]];
    return ok(u ? [{ ...u, is_active: true }] : []);
  }
  if (t.startsWith('SELECT organization_id FROM users WHERE id = $1')) {
    const u = users[params[0]];
    return ok(u ? [{ organization_id: u.organization_id }] : []);
  }

  throw new Error(`Unexpected SQL in test: ${t.slice(0, 100)}`);
});

// ---- Server -----------------------------------------------------------------

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/countries', auth, countriesRouter);
  app.use('/sites', auth, sitesRouter);
  app.use('/assignments', assignmentsRouter);
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
  resetWorld();
  query.mockClear();
  (logAuditEvent as jest.Mock).mockClear();
  (dbPool.query as jest.Mock).mockImplementation(query);
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

const ids = (res: { body: any }) => (res.body?.data ?? []).map((r: any) => r.id).sort();

// ---- Zone assignments -------------------------------------------------------

describe('zone assignments (CEO assigns farm managers to zones)', () => {
  it('CEO lists, adds and removes a zone for a farm manager, with audit entries', async () => {
    const list = await call(CEO, 'GET', `/assignments/users/${U.fm}/zones`);
    expect(list.status).toBe(200);
    expect(list.body.data.map((z: any) => z.countryId).sort()).toEqual([Z_FM, Z_EMPTY].sort());

    const add = await call(CEO, 'POST', `/assignments/users/${U.fm}/zones`, { countryId: Z_OTHER });
    expect(add.status).toBe(201);
    expect(zoneAssign.has(`${U.fm}:${Z_OTHER}`)).toBe(true);
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: 'CREATE', entity: 'assignment', changes: expect.objectContaining({ scope: 'zone', countryId: Z_OTHER }),
    }));

    const del = await call(CEO, 'DELETE', `/assignments/users/${U.fm}/zones/${Z_OTHER}`);
    expect(del.status).toBe(200);
    expect(zoneAssign.has(`${U.fm}:${Z_OTHER}`)).toBe(false);
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: 'DELETE', entity: 'assignment', changes: expect.objectContaining({ scope: 'zone', countryId: Z_OTHER }),
    }));
  });

  it('only farm managers can be assigned to zones', async () => {
    const res = await call(CEO, 'POST', `/assignments/users/${U.om}/zones`, { countryId: Z_FM });
    expect(res.status).toBe(400);
    expect(writes).toEqual([]);
  });

  describe.each([FM, OM, WORKER])('$role', (user) => {
    it.each([
      ['GET', `/assignments/users/${U.fm}/zones`, undefined],
      ['POST', `/assignments/users/${U.fm}/zones`, { countryId: Z_OTHER }],
      ['DELETE', `/assignments/users/${U.fm}/zones/${Z_FM}`, undefined],
    ])('%s %s → 403', async (method, path, body) => {
      const res = await call(user, method as string, path as string, body as object | undefined);
      expect(res.status).toBe(403);
      expect(writes).toEqual([]);
      expect(logAuditEvent).not.toHaveBeenCalled();
    });
  });

  it('a CEO cannot touch a user from another organization (404)', async () => {
    expect((await call(CEO2, 'GET', `/assignments/users/${U.fm}/zones`)).status).toBe(404);
    expect((await call(CEO2, 'POST', `/assignments/users/${U.fm}/zones`, { countryId: Z_X })).status).toBe(404);
    expect((await call(CEO2, 'DELETE', `/assignments/users/${U.fm}/zones/${Z_FM}`)).status).toBe(404);
    expect(writes).toEqual([]);
  });

  it('a CEO cannot assign a zone from another organization (404)', async () => {
    const res = await call(CEO, 'POST', `/assignments/users/${U.fm}/zones`, { countryId: Z_X });
    expect(res.status).toBe(404);
    expect(writes).toEqual([]);
    const del = await call(CEO, 'DELETE', `/assignments/users/${U.fm}/zones/${Z_X}`);
    expect(del.status).toBe(404);
  });
});

// ---- Access lists -------------------------------------------------------------

describe('what each role can see', () => {
  it('CEO sees every zone and site in the org', async () => {
    expect(ids(await call(CEO, 'GET', '/countries'))).toEqual([Z_FM, Z_OTHER, Z_EMPTY].sort());
    expect(ids(await call(CEO, 'GET', '/sites'))).toEqual([S_FM, S_OTHER, S_DIRECT].sort());
  });

  it('farm manager sees their zones (including an empty one), sites in them, and direct sites with their zone', async () => {
    expect(ids(await call(FM, 'GET', '/countries'))).toEqual([Z_FM, Z_EMPTY, Z_OTHER].sort());
    expect(ids(await call(FM, 'GET', '/sites'))).toEqual([S_FM, S_DIRECT].sort());
    // Not S_OTHER: it is in a zone that is not theirs and not assigned directly.
    expect((await call(FM, 'GET', `/sites/${S_OTHER}`)).status).toBe(404);
    expect((await call(FM, 'GET', `/sites/${S_FM}`)).status).toBe(200);
    expect(ids(await call(FM, 'GET', `/countries/${Z_OTHER}/sites`))).toEqual([S_DIRECT]);
  });

  it('a farm manager with no assignments sees nothing', async () => {
    expect(ids(await call(FM_NONE, 'GET', '/countries'))).toEqual([]);
    expect(ids(await call(FM_NONE, 'GET', '/sites'))).toEqual([]);
  });

  it('operation manager sees only assigned sites and their zones', async () => {
    expect(ids(await call(OM, 'GET', '/countries'))).toEqual([Z_OTHER]);
    expect(ids(await call(OM, 'GET', '/sites'))).toEqual([S_OTHER]);
  });

  it('my-access reports zone-based sites and the zones a farm manager may manage', async () => {
    const res = await call(FM, 'GET', '/assignments/my-access');
    expect(res.status).toBe(200);
    expect(res.body.data.siteIds.sort()).toEqual([S_FM, S_DIRECT].sort());
    expect(res.body.data.managedZoneIds.sort()).toEqual([Z_FM, Z_EMPTY].sort());
    expect(res.body.data.isFullAccess).toBe(false);
    const om = await call(OM, 'GET', '/assignments/my-access');
    expect(om.body.data.managedZoneIds).toEqual([]);
  });

  it('a zone in another organization is not found, even for a CEO', async () => {
    expect((await call(CEO, 'GET', `/countries/${Z_X}`)).status).toBe(404);
  });
});

// ---- Zone writes ----------------------------------------------------------------

describe('zone writes', () => {
  it('CEO creates, renames and deletes zones', async () => {
    expect((await call(CEO, 'POST', '/countries', { name: 'West', code: 'WE' })).status).toBe(201);
    expect((await call(CEO, 'PUT', `/countries/${Z_OTHER}`, { name: 'South 2', code: 'S2' })).status).toBe(200);
    expect(zones[Z_OTHER].name).toBe('South 2');
    expect((await call(CEO, 'DELETE', `/countries/${Z_OTHER}`)).status).toBe(200);
    expect(zones[Z_OTHER].deleted_at).not.toBeNull();
  });

  it('farm manager renames their own zone', async () => {
    const res = await call(FM, 'PUT', `/countries/${Z_FM}`, { name: 'North Renamed' });
    expect(res.status).toBe(200);
    expect(zones[Z_FM].name).toBe('North Renamed');
  });

  it('farm manager cannot change the zone code', async () => {
    expect((await call(FM, 'PUT', `/countries/${Z_FM}`, { code: 'ZZ' })).status).toBe(403);
    expect(zones[Z_FM].code).toBe('NO');
  });

  it('farm manager cannot rename another zone (even one holding a direct site)', async () => {
    expect((await call(FM, 'PUT', `/countries/${Z_OTHER}`, { name: 'Hijack' })).status).toBe(403);
    expect(zones[Z_OTHER].name).toBe('South');
  });

  it('farm manager cannot create or delete zones', async () => {
    expect((await call(FM, 'POST', '/countries', { name: 'West', code: 'WE' })).status).toBe(403);
    expect((await call(FM, 'DELETE', `/countries/${Z_FM}`)).status).toBe(403);
    expect(writes).toEqual([]);
  });

  it.each([OM, WORKER])('$role cannot write zones', async (user) => {
    expect((await call(user, 'POST', '/countries', { name: 'West', code: 'WE' })).status).toBe(403);
    expect((await call(user, 'PUT', `/countries/${Z_FM}`, { name: 'x' })).status).toBe(403);
    expect((await call(user, 'DELETE', `/countries/${Z_FM}`)).status).toBe(403);
    expect(writes).toEqual([]);
  });

  it('a CEO cannot rename or delete a zone in another organization', async () => {
    expect((await call(CEO, 'PUT', `/countries/${Z_X}`, { name: 'x' })).status).toBe(404);
    expect((await call(CEO, 'DELETE', `/countries/${Z_X}`)).status).toBe(404);
    expect(writes).toEqual([]);
  });
});

// ---- Site writes ----------------------------------------------------------------

describe('site writes', () => {
  const newSite = (countryId: string) => ({ countryId, name: 'New', location: 'Here', totalArea: 3 });

  it('CEO creates, renames and deletes sites in any org zone', async () => {
    expect((await call(CEO, 'POST', '/sites', newSite(Z_OTHER))).status).toBe(201);
    expect((await call(CEO, 'PUT', `/sites/${S_OTHER}`, { name: 'Renamed' })).status).toBe(200);
    expect((await call(CEO, 'DELETE', `/sites/${S_OTHER}`)).status).toBe(200);
  });

  it('farm manager creates, renames and deletes sites in their zone', async () => {
    expect((await call(FM, 'POST', '/sites', newSite(Z_FM))).status).toBe(201);
    expect((await call(FM, 'POST', '/sites', newSite(Z_EMPTY))).status).toBe(201);
    expect((await call(FM, 'PUT', `/sites/${S_FM}`, { name: 'Renamed' })).status).toBe(200);
    expect(sites[S_FM].name).toBe('Renamed');
    expect((await call(FM, 'DELETE', `/sites/${S_FM}`)).status).toBe(200);
    expect(sites[S_FM].deleted_at).not.toBeNull();
  });

  it('farm manager cannot touch sites in another zone (even a directly assigned site)', async () => {
    expect((await call(FM, 'POST', '/sites', newSite(Z_OTHER))).status).toBe(403);
    expect((await call(FM, 'PUT', `/sites/${S_OTHER}`, { name: 'x' })).status).toBe(403);
    expect((await call(FM, 'PUT', `/sites/${S_DIRECT}`, { name: 'x' })).status).toBe(403);
    expect((await call(FM, 'DELETE', `/sites/${S_OTHER}`)).status).toBe(403);
    expect((await call(FM, 'DELETE', `/sites/${S_DIRECT}`)).status).toBe(403);
    expect(writes).toEqual([]);
  });

  it('farm manager cannot move their site into a zone that is not theirs', async () => {
    expect((await call(FM, 'PUT', `/sites/${S_FM}`, { countryId: Z_OTHER })).status).toBe(403);
    expect(sites[S_FM].country_id).toBe(Z_FM);
    expect((await call(FM, 'PUT', `/sites/${S_FM}`, { countryId: Z_EMPTY })).status).toBe(200);
  });

  it.each([OM, WORKER])('$role cannot write sites', async (user) => {
    expect((await call(user, 'POST', '/sites', newSite(Z_FM))).status).toBe(403);
    expect((await call(user, 'PUT', `/sites/${S_FM}`, { name: 'x' })).status).toBe(403);
    expect((await call(user, 'DELETE', `/sites/${S_FM}`)).status).toBe(403);
    expect(writes).toEqual([]);
  });

  it('a CEO cannot create, rename or delete sites in another organization', async () => {
    expect((await call(CEO, 'POST', '/sites', newSite(Z_X))).status).toBe(404);
    expect((await call(CEO, 'PUT', `/sites/${S_X}`, { name: 'x' })).status).toBe(404);
    expect((await call(CEO, 'PUT', `/sites/${S_OTHER}`, { countryId: Z_X })).status).toBe(404);
    expect((await call(CEO, 'DELETE', `/sites/${S_X}`)).status).toBe(404);
    expect(writes).toEqual([]);
  });
});
