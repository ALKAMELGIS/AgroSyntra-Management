/**
 * PHI audit log access: anyone signed in may read the log, but only the auditor may
 * confirm or dismiss a PHI conflict. CEO and farm manager are read-only. Only the
 * auditor gets a badge count. Driven through the real router, the real auth /
 * authorize / tenant middleware (signed JWTs) and the error handler on an
 * ephemeral port; the PHI service's database calls are mocked.
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
jest.mock('../../services/phiAuditLog.service', () => {
  const actual = jest.requireActual('../../services/phiAuditLog.service');
  return {
    badgeCountForRole: actual.badgeCountForRole,
    getPhiConflicts: jest.fn(async () => []),
    getPhiConflictCounts: jest.fn(async () => ({ unreviewedCount: 4, confirmedCount: 2 })),
    acknowledgeConflict: jest.fn(async () => undefined),
  };
});

process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-at-least-32-chars';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-key-for-testing-at-least-32-chars';

import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { config } from '../../config';
import { phiAuditLogRouter } from '../v1/phiAuditLog.routes';
import { errorHandler } from '../middleware/errorHandler';
import { acknowledgeConflict } from '../../services/phiAuditLog.service';

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const HARVEST = '11111111-1111-4111-8111-111111111111';
const APPLICATION = '22222222-2222-4222-8222-222222222222';
const CONFLICT_ID = `${HARVEST}:${APPLICATION}`;

const tokenFor = (role: string) =>
  jwt.sign(
    { userId: `${role}-1`, email: `${role}@example.com`, role, organizationId: ORG },
    config.auth.jwtSecret,
    { algorithm: 'HS256', expiresIn: '5m' },
  );

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/phi', phiAuditLogRouter);
  app.use(errorHandler);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/phi`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  (acknowledgeConflict as jest.Mock).mockClear();
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

const NOT_REVIEWERS = [
  'ceo',
  'farm_manager',
  'operation_manager',
  'pest_agronomist',
  'agronomist',
  'worker',
  'scouter',
];

describe('acknowledge / justify a PHI conflict', () => {
  for (const status of ['acknowledged', 'justified']) {
    it(`auditor can mark a conflict ${status}`, async () => {
      const res = await call('PUT', `/${CONFLICT_ID}/acknowledge`, tokenFor('auditor'), { status, notes: 'x' });
      expect(res.status).toBe(200);
      expect(acknowledgeConflict).toHaveBeenCalledWith(HARVEST, APPLICATION, 'auditor-1', 'auditor', status, 'x');
    });
  }

  for (const role of NOT_REVIEWERS) {
    it(`${role} is 403 and nothing is written`, async () => {
      const res = await call('PUT', `/${CONFLICT_ID}/acknowledge`, tokenFor(role), { status: 'acknowledged' });
      expect(res.status).toBe(403);
      expect(acknowledgeConflict).not.toHaveBeenCalled();
    });
  }

  it('no login is 401', async () => {
    const res = await call('PUT', `/${CONFLICT_ID}/acknowledge`, null, { status: 'acknowledged' });
    expect(res.status).toBe(401);
    expect(acknowledgeConflict).not.toHaveBeenCalled();
  });
});

describe('reading stays open to everyone signed in', () => {
  for (const role of ['auditor', 'ceo', 'farm_manager']) {
    it(`${role} can read the log`, async () => {
      const res = await call('GET', '/', tokenFor(role));
      expect(res.status).toBe(200);
    });
  }
});

describe('badge count', () => {
  it('auditor gets the unreviewed count', async () => {
    const res = await call('GET', '/unreviewed-count', tokenFor('auditor'));
    expect(res.status).toBe(200);
    expect(res.json.data.badgeCount).toBe(4);
  });

  for (const role of NOT_REVIEWERS) {
    it(`${role} gets no badge`, async () => {
      const res = await call('GET', '/unreviewed-count', tokenFor(role));
      expect(res.status).toBe(200);
      expect(res.json.data.badgeCount).toBe(0);
    });
  }
});
