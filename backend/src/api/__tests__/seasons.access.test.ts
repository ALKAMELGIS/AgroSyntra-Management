/**
 * Season access follows site access.
 *
 * - Farm manager: opens / closes / edits seasons, and asks for a reopen, only
 *   on sites inside their zones or assigned to them directly.
 * - Operation manager: the same, on sites assigned to them (unchanged).
 * - CEO: cannot manage seasons or ask for a reopen.
 * - Reading seasons needs access to the site.
 *
 * Driven through the real router and access checks on an ephemeral port with a
 * fake database answering by SQL shape. The heavy season writes themselves are
 * stubbed — this file is about who may call them.
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
  };
});
jest.mock('../middleware/tenant', () => ({
  requireOrgId: (req: any) => req.user?.organizationId ?? 'org-1',
}));
jest.mock('../../services/auditLog.service', () => ({ logAuditEvent: jest.fn(async () => undefined) }));
jest.mock('../../services/seasons.service', () => {
  const actual = jest.requireActual('../../services/seasons.service');
  return {
    ...actual,
    startOpenSeason: jest.fn(async (input: any) => ({ id: 'new-season', site_id: input.siteId, status: 'open' })),
    updateSeason: jest.fn(async (id: string) => ({ id, name: 'Season', end_date: null, planned_end_date: '2027-07-31' })),
    requestSeasonReopen: jest.fn(async (input: any) => ({
      id: 'req-1', season_id: input.seasonId, reason: input.reason, status: 'pending',
    })),
  };
});
jest.mock('../v1/health.routes', () => ({ incrementErrorCount: jest.fn() }));
jest.mock('../../utils/sentry', () => ({ captureException: jest.fn() }));
jest.mock('../../utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { dbPool } from '../../db/client';
import { seasonsRouter } from '../v1/seasons.routes';
import { errorHandler } from '../middleware/errorHandler';
import { requestSeasonReopen, startOpenSeason, updateSeason } from '../../services/seasons.service';

const Z_FM = 'a1111111-1111-4111-8111-111111111111';
const Z_OTHER = 'a2222222-2222-4222-8222-222222222222';
const Z_X = 'a4444444-4444-4444-8444-444444444444';

const S_FM = 'b1111111-1111-4111-8111-111111111111'; // in FM's zone
const S_OTHER = 'b2222222-2222-4222-8222-222222222222'; // other zone, OM assigned
const S_DIRECT = 'b3333333-3333-4333-8333-333333333333'; // other zone, assigned to FM directly
const S_X = 'b4444444-4444-4444-8444-444444444444'; // org-2

const SEASON = (site: string, n: number) => `d000000${n}-0000-4000-8000-${site.slice(-12)}`;
const SEA_FM = SEASON(S_FM, 1);
const SEA_OTHER = SEASON(S_OTHER, 2);
const SEA_DIRECT = SEASON(S_DIRECT, 3);
const SEA_X = SEASON(S_X, 4);

const CEO = { userId: 'c-ceo', role: 'ceo', email: 'ceo@x', organizationId: 'org-1' };
const FM = { userId: 'c-fm', role: 'farm_manager', email: 'fm@x', organizationId: 'org-1' };
const OM = { userId: 'c-om', role: 'operation_manager', email: 'om@x', organizationId: 'org-1' };
const WORKER = { userId: 'c-w', role: 'worker', email: 'w@x', organizationId: 'org-1' };

const zones: Record<string, { org: string }> = {
  [Z_FM]: { org: 'org-1' }, [Z_OTHER]: { org: 'org-1' }, [Z_X]: { org: 'org-2' },
};
const sites: Record<string, { zone: string; org: string }> = {
  [S_FM]: { zone: Z_FM, org: 'org-1' },
  [S_OTHER]: { zone: Z_OTHER, org: 'org-1' },
  [S_DIRECT]: { zone: Z_OTHER, org: 'org-1' },
  [S_X]: { zone: Z_X, org: 'org-2' },
};
const zoneAssign = new Set([`${FM.userId}:${Z_FM}`]);
const siteAssign = new Set([
  `${FM.userId}:${S_DIRECT}`, `${OM.userId}:${S_OTHER}`, `${WORKER.userId}:${S_FM}`,
]);
const seasons: Record<string, { site: string; org: string }> = {
  [SEA_FM]: { site: S_FM, org: 'org-1' },
  [SEA_OTHER]: { site: S_OTHER, org: 'org-1' },
  [SEA_DIRECT]: { site: S_DIRECT, org: 'org-1' },
  [SEA_X]: { site: S_X, org: 'org-2' },
};

function fmCanReach(userId: string, siteId: string): boolean {
  const s = sites[siteId];
  if (!s) return false;
  if (siteAssign.has(`${userId}:${siteId}`)) return true;
  return zoneAssign.has(`${userId}:${s.zone}`) && zones[s.zone].org === s.org;
}

const ok = (rows: any[]) => ({ rows, rowCount: rows.length });
const seasonRow = (id: string) => ({
  id, site_id: seasons[id].site, organization_id: seasons[id].org, name: 'Season',
  status: 'closed', start_date: '2025-09-01', planned_end_date: '2026-07-31', end_date: '2026-07-31',
  closed_by: 'someone',
});

const query = jest.fn(async (sql: string, params: any[] = []) => {
  const t = sql.replace(/\s+/g, ' ').trim();
  if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(t)) return ok([]);

  // assertCanManageSeasons — farm manager
  if (t.startsWith('SELECT ( EXISTS')) {
    const [siteId, org, userId] = params;
    const s = sites[siteId];
    if (!s || s.org !== org) return ok([]);
    return ok([{ can_manage: fmCanReach(userId, siteId) }]);
  }
  // assertCanManageSeasons — operation manager
  if (t.startsWith('SELECT 1 FROM user_site_assignments WHERE user_id = $1::uuid')) {
    return ok(siteAssign.has(`${params[0]}:${params[1]}`) ? [{ x: 1 }] : []);
  }
  // canUserAccessSite
  if (t.startsWith('SELECT 1 FROM sites s WHERE s.id = $2')) {
    const [userId, siteId, org] = params;
    return ok(sites[siteId]?.org === org && fmCanReach(userId, siteId) ? [{ x: 1 }] : []);
  }
  if (t.startsWith('SELECT 1 FROM sites WHERE id = $1 AND organization_id = $2')) {
    return ok(sites[params[0]]?.org === params[1] ? [{ x: 1 }] : []);
  }
  if (t.startsWith('SELECT 1 FROM user_site_assignments usa JOIN sites s')) {
    const [userId, siteId, org] = params;
    return ok(sites[siteId]?.org === org && siteAssign.has(`${userId}:${siteId}`) ? [{ x: 1 }] : []);
  }
  // seasons reads
  if (t.startsWith('SELECT * FROM seasons WHERE id = $1::uuid')) {
    return ok(seasons[params[0]] ? [seasonRow(params[0])] : []);
  }
  if (t.startsWith('SELECT * FROM seasons WHERE site_id = $1::uuid')) {
    return ok(Object.keys(seasons).filter((id) => seasons[id].site === params[0]).map(seasonRow));
  }
  throw new Error(`Unexpected SQL in test: ${t.slice(0, 100)}`);
});

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/seasons', seasonsRouter);
  app.use(errorHandler);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/seasons`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  query.mockClear();
  (startOpenSeason as jest.Mock).mockClear();
  (updateSeason as jest.Mock).mockClear();
  (requestSeasonReopen as jest.Mock).mockClear();
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

describe('farm manager manages seasons only on sites they can reach', () => {
  it.each([
    ['a site in their zone', S_FM],
    ['a site assigned directly', S_DIRECT],
  ])('starts a season on %s', async (_label, siteId) => {
    const res = await call(FM, 'POST', '/start', { siteId });
    expect(res.status).toBe(201);
    expect(startOpenSeason).toHaveBeenCalled();
  });

  it('403s on an org site outside their zones', async () => {
    const res = await call(FM, 'POST', '/start', { siteId: S_OTHER });
    expect(res.status).toBe(403);
    expect(startOpenSeason).not.toHaveBeenCalled();
  });

  it('404s on a site in another organization', async () => {
    expect((await call(FM, 'POST', '/start', { siteId: S_X })).status).toBe(404);
  });

  it('edits a season in their zone, not one outside', async () => {
    expect((await call(FM, 'PUT', `/${SEA_FM}`, { name: 'Renamed' })).status).toBe(200);
    expect((await call(FM, 'PUT', `/${SEA_OTHER}`, { name: 'Renamed' })).status).toBe(403);
    expect(updateSeason).toHaveBeenCalledTimes(1);
  });
});

describe('operation manager is unchanged: assigned sites only', () => {
  it('starts a season on an assigned site', async () => {
    expect((await call(OM, 'POST', '/start', { siteId: S_OTHER })).status).toBe(201);
  });

  it('403s on a site not assigned to them', async () => {
    expect((await call(OM, 'POST', '/start', { siteId: S_FM })).status).toBe(403);
    expect(startOpenSeason).not.toHaveBeenCalled();
  });
});

describe('reopen requests', () => {
  const body = { reason: 'Closed by mistake' };

  it('farm manager may ask on their own site', async () => {
    expect((await call(FM, 'POST', `/${SEA_FM}/reopen-request`, body)).status).toBe(201);
    expect((await call(FM, 'POST', `/${SEA_DIRECT}/reopen-request`, body)).status).toBe(201);
    expect(requestSeasonReopen).toHaveBeenCalledTimes(2);
  });

  it('farm manager cannot ask on another site', async () => {
    expect((await call(FM, 'POST', `/${SEA_OTHER}/reopen-request`, body)).status).toBe(403);
    expect(requestSeasonReopen).not.toHaveBeenCalled();
  });

  it('operation manager may ask on their site, not another', async () => {
    expect((await call(OM, 'POST', `/${SEA_OTHER}/reopen-request`, body)).status).toBe(201);
    expect((await call(OM, 'POST', `/${SEA_FM}/reopen-request`, body)).status).toBe(403);
    expect(requestSeasonReopen).toHaveBeenCalledTimes(1);
  });

  it.each([CEO, WORKER])('$role cannot ask for a reopen', async (user) => {
    expect((await call(user, 'POST', `/${SEA_FM}/reopen-request`, body)).status).toBe(403);
    expect(requestSeasonReopen).not.toHaveBeenCalled();
  });

  it('a season in another organization is not found', async () => {
    expect((await call(FM, 'POST', `/${SEA_X}/reopen-request`, body)).status).toBe(404);
    expect(requestSeasonReopen).not.toHaveBeenCalled();
  });
});

describe('reading seasons needs access to the site', () => {
  it('lists seasons of a reachable site', async () => {
    expect((await call(FM, 'GET', `/?site_id=${S_FM}`)).status).toBe(200);
    expect((await call(WORKER, 'GET', `/?site_id=${S_FM}`)).status).toBe(200);
    expect((await call(CEO, 'GET', `/?site_id=${S_OTHER}`)).status).toBe(200);
  });

  it('403s the list and the open season of an unreachable site', async () => {
    expect((await call(FM, 'GET', `/?site_id=${S_OTHER}`)).status).toBe(403);
    expect((await call(OM, 'GET', `/open?site_id=${S_FM}`)).status).toBe(403);
    expect((await call(WORKER, 'GET', `/open?site_id=${S_OTHER}`)).status).toBe(403);
    expect((await call(CEO, 'GET', `/?site_id=${S_X}`)).status).toBe(403);
  });

  it('404s a single season on an unreachable site or another organization', async () => {
    expect((await call(FM, 'GET', `/${SEA_FM}`)).status).toBe(200);
    expect((await call(FM, 'GET', `/${SEA_OTHER}`)).status).toBe(404);
    expect((await call(CEO, 'GET', `/${SEA_X}`)).status).toBe(404);
    expect((await call(CEO, 'GET', `/${SEA_OTHER}`)).status).toBe(200);
  });
});
