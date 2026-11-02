/**
 * Permission grants and assignment removal follow the user-management rank rules.
 *
 *  - Grants / revokes: CEO, farm manager and operation manager only, and only for another
 *    user in their own organization whose role ranks strictly below theirs. A revoke loads
 *    the permission, then its user, then checks org + rank.
 *  - Removing someone from a site / farm area / field: the caller must have access to it
 *    (CEO always does) AND be able to assign the target user's role.
 *
 * Driven through the real routers, real auth / authorize / tenant middleware (signed JWTs)
 * and the error handler on an ephemeral port.
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
jest.mock('../../services/permission.service', () => ({
  listUserPermissions: jest.fn(async () => []),
  grantPermission: jest.fn(async () => ({ id: 'granted' })),
  revokePermission: jest.fn(async () => undefined),
  AVAILABLE_MODULES: ['recipes'],
}));
jest.mock('../../services/auditLog.service');
jest.mock('../../repositories/assignment.repository');
jest.mock('../../repositories/user.repository');

process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-at-least-32-chars';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-key-for-testing-at-least-32-chars';

import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { dbPool } from '../../db/client';
import { config } from '../../config';
import { errorHandler } from '../middleware/errorHandler';
import { permissionsRouter } from '../v1/permissions.routes';
import { assignmentsRouter } from '../v1/assignments.routes';
import { grantPermission, revokePermission } from '../../services/permission.service';
import { AssignmentRepository } from '../../repositories/assignment.repository';
import { UserRepository } from '../../repositories/user.repository';
import { outranksForManagement } from '../../models/user.model';

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_ORG = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

type U = { id: string; role: string; organization_id: string };
const U = (n: number, role: string, org = ORG): U => ({ id: uid(n), role, organization_id: org });
const CEO = U(1, 'ceo');
const CEO2 = U(2, 'ceo');
const FM = U(3, 'farm_manager');
const FM2 = U(4, 'farm_manager');
const OM = U(5, 'operation_manager');
const OM2 = U(6, 'operation_manager');
const AG = U(7, 'agronomist');
const WK = U(8, 'worker');
const AU = U(9, 'auditor');
const PEST = U(10, 'pest_agronomist');
const SC = U(11, 'scouter');
const WK_OTHER_ORG = U(12, 'worker', OTHER_ORG);
const MISSING = uid(99);
const USERS = [CEO, CEO2, FM, FM2, OM, OM2, AG, WK, AU, PEST, SC, WK_OTHER_ORG];
const byId = (id: string) => USERS.find((u) => u.id === id);

// Permission rows by id -> owning user.
const PERMS: Record<string, string> = {
  [uid(201)]: WK.id,
  [uid(202)]: FM.id,
  [uid(203)]: OM.id,
  [uid(204)]: WK_OTHER_ORG.id,
  [uid(205)]: CEO.id,
};
const permOf = (user: U) => Object.keys(PERMS).find((p) => PERMS[p] === user.id)!;

const query = jest.fn(async (sql: string, params: unknown[] = []) => {
  const text = sql.replace(/\s+/g, ' ').trim();
  if (text.startsWith('SELECT id, role, organization_id FROM users WHERE id = $1')) {
    const u = byId(params[0] as string);
    return { rows: u ? [u] : [], rowCount: u ? 1 : 0 };
  }
  if (text.startsWith('SELECT up.id, up.user_id FROM user_permissions up WHERE up.id = $1')) {
    const owner = PERMS[params[0] as string];
    return owner ? { rows: [{ id: params[0], user_id: owner }], rowCount: 1 } : { rows: [], rowCount: 0 };
  }
  throw new Error(`Unexpected SQL in test: ${text.slice(0, 100)}`);
});

const tokenFor = (user: U) =>
  jwt.sign(
    { userId: user.id, email: `${user.role}@example.com`, role: user.role, organizationId: user.organization_id },
    config.auth.jwtSecret,
    { algorithm: 'HS256', expiresIn: '5m' },
  );

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/permissions', permissionsRouter);
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

const repo = AssignmentRepository.prototype as unknown as Record<string, jest.Mock>;
const userRepo = UserRepository.prototype as unknown as Record<string, jest.Mock>;
// Sites / areas / fields the caller "has access to": everything except NO_ACCESS.
const NO_ACCESS = uid(500);

beforeEach(() => {
  jest.clearAllMocks();
  (dbPool.query as jest.Mock).mockImplementation(query);
  for (const m of ['canUserAccessSite', 'canUserAccessFarmArea', 'canUserAccessField']) {
    repo[m].mockImplementation(async (_u: string, _r: string, scopeId: string) => scopeId !== NO_ACCESS);
  }
  userRepo.findById.mockImplementation(async (id: string) => {
    const u = byId(id);
    return u ? { id: u.id, role: u.role, email: `${u.role}@example.com` } : null;
  });
});

async function call(method: string, path: string, caller: U, body?: unknown) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenFor(caller)}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res.status;
}

const grant = (caller: U, target: string) =>
  call('POST', '/permissions', caller, { userId: target, module: 'recipes', permission: 'write' });

describe('outranksForManagement', () => {
  it('needs an assignable AND strictly lower role', () => {
    expect(outranksForManagement('ceo', 'farm_manager')).toBe(true);
    expect(outranksForManagement('ceo', 'ceo')).toBe(false);
    expect(outranksForManagement('farm_manager', 'operation_manager')).toBe(true);
    expect(outranksForManagement('farm_manager', 'farm_manager')).toBe(false);
    expect(outranksForManagement('operation_manager', 'agronomist')).toBe(true);
    expect(outranksForManagement('operation_manager', 'operation_manager')).toBe(false);
    expect(outranksForManagement('operation_manager', 'ceo')).toBe(false);
    expect(outranksForManagement('agronomist', 'worker')).toBe(false);
  });
});

describe('granting permissions', () => {
  it.each([
    ['ceo', CEO, [FM, OM, AG, WK, AU]],
    ['farm_manager', FM, [OM, AG, WK, AU, PEST]],
    ['operation_manager', OM, [AG, WK, AU, PEST, SC]],
  ])('%s may grant to lower-ranked users in the org', async (_label, caller, targets) => {
    for (const t of targets as U[]) {
      expect({ target: t.role, status: await grant(caller as U, t.id) }).toEqual({ target: t.role, status: 201 });
    }
  });

  it.each([
    ['ceo', CEO, [CEO2]],
    ['farm_manager', FM, [FM2, CEO]],
    ['operation_manager', OM, [OM2, FM, CEO]],
  ])('%s cannot grant to equal or higher rank', async (_label, caller, targets) => {
    for (const t of targets as U[]) {
      expect({ target: t.role, status: await grant(caller as U, t.id) }).toEqual({ target: t.role, status: 403 });
    }
    expect(grantPermission).not.toHaveBeenCalled();
  });

  it('nobody can grant to themselves', async () => {
    for (const caller of [CEO, FM, OM]) {
      expect(await grant(caller, caller.id)).toBe(403);
    }
    expect(grantPermission).not.toHaveBeenCalled();
  });

  it('users from another organization (or unknown users) are not found', async () => {
    expect(await grant(CEO, WK_OTHER_ORG.id)).toBe(404);
    expect(await grant(OM, MISSING)).toBe(404);
    expect(await call('GET', `/permissions/user/${WK_OTHER_ORG.id}`, CEO)).toBe(404);
    expect(grantPermission).not.toHaveBeenCalled();
  });

  it('other roles are refused outright', async () => {
    for (const caller of [AG, WK, AU, PEST, SC]) {
      expect(await grant(caller, WK.id)).toBe(403);
    }
    expect(grantPermission).not.toHaveBeenCalled();
  });
});

describe('revoking permissions', () => {
  it('loads the permission, then its user, and allows lower-ranked same-org users', async () => {
    expect(await call('DELETE', `/permissions/${permOf(WK)}`, OM)).toBe(200);
    expect(await call('DELETE', `/permissions/${permOf(OM)}`, FM)).toBe(200);
    expect(await call('DELETE', `/permissions/${permOf(FM)}`, CEO)).toBe(200);
    expect(revokePermission).toHaveBeenCalledTimes(3);
  });

  it('refuses equal / higher rank, self, other orgs and unknown permissions', async () => {
    expect(await call('DELETE', `/permissions/${permOf(FM)}`, OM)).toBe(403);
    expect(await call('DELETE', `/permissions/${permOf(CEO)}`, FM)).toBe(403);
    expect(await call('DELETE', `/permissions/${permOf(OM)}`, OM)).toBe(403);
    expect(await call('DELETE', `/permissions/${permOf(CEO)}`, CEO)).toBe(403);
    expect(await call('DELETE', `/permissions/${permOf(WK_OTHER_ORG)}`, CEO)).toBe(404);
    expect(await call('DELETE', `/permissions/${uid(299)}`, CEO)).toBe(404);
    expect(await call('DELETE', `/permissions/${permOf(WK)}`, AG)).toBe(403);
    expect(revokePermission).not.toHaveBeenCalled();
  });
});

describe('removing a user from a site / farm area / field', () => {
  const SCOPE = uid(400);
  const KINDS = [
    { path: 'sites', remove: 'removeUserFromSite' },
    { path: 'farm-areas', remove: 'removeUserFromFarmArea' },
    { path: 'fields', remove: 'removeUserFromField' },
  ];
  const unassign = (kind: string, caller: U, target: string, scope = SCOPE) =>
    call('DELETE', `/assignments/${kind}/${scope}/users/${target}`, caller);

  it.each(KINDS)('$path: allowed when the caller can assign the target role', async ({ path, remove }) => {
    expect(await unassign(path, OM, WK.id)).toBe(200);
    expect(await unassign(path, FM, OM.id)).toBe(200);
    expect(await unassign(path, PEST, SC.id)).toBe(200);
    // CEO always, even without an assignment to that site / area / field.
    expect(await unassign(path, CEO, FM.id, NO_ACCESS)).toBe(200);
    expect(repo[remove]).toHaveBeenCalledTimes(4);
  });

  it.each(KINDS)('$path: refused for roles the caller cannot assign', async ({ path, remove }) => {
    expect(await unassign(path, OM, FM.id)).toBe(403);
    expect(await unassign(path, OM, OM2.id)).toBe(403);
    expect(await unassign(path, FM, CEO.id)).toBe(403);
    expect(await unassign(path, PEST, WK.id)).toBe(403);
    expect(await unassign(path, WK, WK.id)).toBe(403);
    expect(await unassign(path, AG, WK.id)).toBe(403);
    expect(repo[remove]).not.toHaveBeenCalled();
  });

  it.each(KINDS)('$path: refused without access, 404 for unknown users', async ({ path, remove }) => {
    expect(await unassign(path, OM, WK.id, NO_ACCESS)).toBe(403);
    expect(await unassign(path, OM, MISSING)).toBe(404);
    expect(repo[remove]).not.toHaveBeenCalled();
  });
});
