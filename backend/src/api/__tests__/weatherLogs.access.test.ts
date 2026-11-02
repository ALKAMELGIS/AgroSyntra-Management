/**
 * Weather log access: every route needs a login, only the data-entry worker and
 * the operation manager may write, and everything is limited to the caller's
 * organization. Driven through the real router, the real auth / authorize /
 * tenant middleware (signed JWTs) and the error handler on an ephemeral port,
 * with a small in-memory database answering by SQL shape.
 */
import jwt from 'jsonwebtoken';

jest.mock('../../db/client', () => ({
  dbPool: { query: jest.fn(), connect: jest.fn() },
}));
jest.mock('../../cache/client', () => ({
  redisClient: { get: jest.fn(), setex: jest.fn() },
}));
jest.mock('../v1/health.routes', () => ({ incrementErrorCount: jest.fn() }));
jest.mock('../../utils/sentry', () => ({ captureException: jest.fn() }));
jest.mock('../../utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-at-least-32-chars';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-key-for-testing-at-least-32-chars';

import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { dbPool } from '../../db/client';
import { config } from '../../config';
import { weatherLogsRouter } from '../v1/weather-logs.routes';
import { errorHandler } from '../middleware/errorHandler';

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_ORG = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SITE = '11111111-1111-4111-8111-111111111111';
const OTHER_SITE = '33333333-3333-4333-8333-333333333333';
const FIELD = '66666666-6666-4666-8666-666666666666';
const OTHER_FIELD = '77777777-7777-4777-8777-777777777777';
const LOG = '22222222-2222-4222-8222-222222222222';
const OTHER_LOG = '44444444-4444-4444-8444-444444444444';

const siteOrg: Record<string, string> = { [SITE]: ORG, [OTHER_SITE]: OTHER_ORG };
const fieldOrg: Record<string, string> = { [FIELD]: ORG, [OTHER_FIELD]: OTHER_ORG };
let logs: Array<{ id: string; site_id: string }> = [];

const dbRow = (log: { id: string; site_id: string }) => ({
  ...log,
  date: '2026-09-01',
  max_temp: 40,
  min_temp: 28,
});

// Honour the organization filter the repository must add, rather than trusting it.
const IN_ORG = /site_id IN \(SELECT id FROM sites WHERE organization_id = \$(\d+)\)/;
function scoped(text: string, params: unknown[]) {
  const m = IN_ORG.exec(text);
  if (!m) throw new Error(`weather_logs query without organization filter: ${text.slice(0, 100)}`);
  const org = params[Number(m[1]) - 1];
  return logs.filter((l) => siteOrg[l.site_id] === org);
}

const query = jest.fn(async (sql: string, params: unknown[] = []) => {
  const text = sql.replace(/\s+/g, ' ').trim();
  if (text.startsWith('SELECT id FROM sites WHERE id = $1 AND organization_id = $2')) {
    const hit = siteOrg[params[0] as string] === params[1];
    return { rows: hit ? [{ id: params[0] }] : [], rowCount: hit ? 1 : 0 };
  }
  if (text.startsWith('SELECT id FROM fields WHERE id = $1 AND organization_id = $2')) {
    const hit = fieldOrg[params[0] as string] === params[1];
    return { rows: hit ? [{ id: params[0] }] : [], rowCount: hit ? 1 : 0 };
  }
  if (text.startsWith('SELECT COUNT(*) FROM weather_logs')) {
    return { rows: [{ count: String(scoped(text, params).length) }], rowCount: 1 };
  }
  if (text.startsWith('SELECT * FROM weather_logs WHERE id = $1')) {
    const rows = scoped(text, params).filter((l) => l.id === params[0]).map(dbRow);
    return { rows, rowCount: rows.length };
  }
  if (text.startsWith('SELECT * FROM weather_logs')) {
    const rows = scoped(text, params).map(dbRow);
    return { rows, rowCount: rows.length };
  }
  if (text.startsWith('INSERT INTO weather_logs')) {
    const row = { id: '99999999-9999-4999-8999-999999999999', site_id: params[2] as string };
    return { rows: [dbRow(row)], rowCount: 1 };
  }
  if (text.startsWith('UPDATE weather_logs')) {
    const id = /WHERE id = \$(\d+)/.exec(text)![1];
    const rows = scoped(text, params).filter((l) => l.id === params[Number(id) - 1]).map(dbRow);
    return { rows, rowCount: rows.length };
  }
  if (text.startsWith('DELETE FROM weather_logs')) {
    const n = scoped(text, params).filter((l) => l.id === params[0]).length;
    return { rows: [], rowCount: n };
  }
  throw new Error(`Unexpected SQL in test: ${text.slice(0, 100)}`);
});

const tokenFor = (role: string, organizationId = ORG) =>
  jwt.sign(
    { userId: `${role}-1`, email: `${role}@example.com`, role, organizationId },
    config.auth.jwtSecret,
    { algorithm: 'HS256', expiresIn: '5m' }
  );

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/wl', weatherLogsRouter);
  app.use(errorHandler);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/wl`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  logs = [
    { id: LOG, site_id: SITE },
    { id: OTHER_LOG, site_id: OTHER_SITE },
  ];
  query.mockClear();
  (dbPool.query as jest.Mock).mockImplementation(query);
});

async function call(method: string, path: string, token: string | null, body?: unknown) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json()) as any;
  return { status: res.status, json };
}

const writesMade = () =>
  query.mock.calls.filter(([sql]) => /^\s*(UPDATE|INSERT|DELETE)/.test(sql as string));

const createBody = (siteId = SITE, extra: object = {}) => ({
  date: '2026-09-02',
  siteId,
  maxTemp: 41,
  minTemp: 29,
  ...extra,
});

const WRITERS = ['worker', 'operation_manager'];
const WATCHERS = ['agronomist', 'ceo', 'farm_manager'];

describe('no login', () => {
  const requests: Array<[string, string, unknown?]> = [
    ['GET', '/'],
    ['GET', `/${LOG}`],
    ['POST', '/', createBody()],
    ['PUT', `/${LOG}`, { maxTemp: 42 }],
    ['DELETE', `/${LOG}`],
  ];
  for (const [method, path, body] of requests) {
    it(`${method} ${path} is 401`, async () => {
      const res = await call(method, path, null, body);
      expect(res.status).toBe(401);
      expect(query).not.toHaveBeenCalled();
    });
  }

  it('a bad token is 401', async () => {
    const res = await call('GET', '/', 'not-a-jwt');
    expect(res.status).toBe(401);
  });
});

describe('writers can add, change and delete', () => {
  for (const role of WRITERS) {
    it(`${role}: POST`, async () => {
      const res = await call('POST', '/', tokenFor(role), createBody(SITE, { fieldId: FIELD }));
      expect(res.status).toBe(201);
      expect(writesMade()).toHaveLength(1);
    });
    it(`${role}: PUT`, async () => {
      const res = await call('PUT', `/${LOG}`, tokenFor(role), { maxTemp: 42 });
      expect(res.status).toBe(200);
      expect(writesMade()).toHaveLength(1);
    });
    it(`${role}: DELETE`, async () => {
      const res = await call('DELETE', `/${LOG}`, tokenFor(role));
      expect(res.status).toBe(200);
      expect(res.json.data).toEqual({ deleted: true });
    });
  }
});

describe('everyone else can only watch', () => {
  for (const role of WATCHERS) {
    it(`${role}: can read`, async () => {
      const list = await call('GET', '/', tokenFor(role));
      expect(list.status).toBe(200);
      const one = await call('GET', `/${LOG}`, tokenFor(role));
      expect(one.status).toBe(200);
    });
    for (const [method, path, body] of [
      ['POST', '/', createBody()],
      ['PUT', `/${LOG}`, { maxTemp: 42 }],
      ['DELETE', `/${LOG}`, undefined],
    ] as Array<[string, string, unknown]>) {
      it(`${role}: ${method} is 403`, async () => {
        const res = await call(method, path, tokenFor(role), body);
        expect(res.status).toBe(403);
        expect(writesMade()).toHaveLength(0);
      });
    }
  }
});

describe('organization scoping', () => {
  it('the list only returns logs for sites in the caller organization', async () => {
    const res = await call('GET', '/', tokenFor('agronomist'));
    expect(res.status).toBe(200);
    expect(res.json.data.map((l: any) => l.id)).toEqual([LOG]);
    expect(res.json.meta.total).toBe(1);
  });

  it('asking for another organization\'s site returns nothing of theirs', async () => {
    const res = await call('GET', `/?site_id=${OTHER_SITE}`, tokenFor('worker'));
    expect(res.status).toBe(200);
    expect(res.json.data.every((l: any) => l.siteId !== OTHER_SITE)).toBe(true);
  });

  it('reading another organization\'s log by id is 404', async () => {
    const res = await call('GET', `/${OTHER_LOG}`, tokenFor('worker'));
    expect(res.status).toBe(404);
  });

  it('POST to another organization\'s site is refused', async () => {
    const res = await call('POST', '/', tokenFor('worker'), createBody(OTHER_SITE));
    expect(res.status).toBe(403);
    expect(writesMade()).toHaveLength(0);
  });

  it('POST with another organization\'s field is refused', async () => {
    const res = await call('POST', '/', tokenFor('worker'), createBody(SITE, { fieldId: OTHER_FIELD }));
    expect(res.status).toBe(403);
    expect(writesMade()).toHaveLength(0);
  });

  it('PUT of another organization\'s log is 404', async () => {
    const res = await call('PUT', `/${OTHER_LOG}`, tokenFor('operation_manager'), { maxTemp: 42 });
    expect(res.status).toBe(404);
    expect(writesMade()).toHaveLength(0);
  });

  it('PUT moving a log onto another organization\'s field is refused', async () => {
    const res = await call('PUT', `/${LOG}`, tokenFor('worker'), { fieldId: OTHER_FIELD });
    expect(res.status).toBe(403);
    expect(writesMade()).toHaveLength(0);
  });

  it('DELETE of another organization\'s log is 404 and leaves it alone', async () => {
    const res = await call('DELETE', `/${OTHER_LOG}`, tokenFor('worker'));
    expect(res.status).toBe(404);
    const del = query.mock.calls.find(([sql]) => /^\s*DELETE/.test(sql as string));
    expect(del?.[0]).toMatch(IN_ORG);
    expect(del?.[1]).toEqual([OTHER_LOG, ORG]);
  });

  it('a writer from the other organization sees and edits only their own', async () => {
    const list = await call('GET', '/', tokenFor('worker', OTHER_ORG));
    expect(list.json.data.map((l: any) => l.id)).toEqual([OTHER_LOG]);
    const put = await call('PUT', `/${LOG}`, tokenFor('worker', OTHER_ORG), { maxTemp: 42 });
    expect(put.status).toBe(404);
  });
});
