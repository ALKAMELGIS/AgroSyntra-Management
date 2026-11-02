/**
 * Farm area write access: operation managers and data-entry workers create,
 * edit, assign crops to and delete farm areas on sites they can reach. The
 * farm manager and the CEO only watch; the agronomist stays read-only (403). A site
 * or farm area outside the caller's access answers 404, including moving a
 * farm area onto a site they cannot reach. Driven through the real router, the
 * real role checks and the real error handler on an ephemeral port, with the
 * service and the assignment checks faked.
 */
jest.mock('../middleware/auth', () => {
  const actual = jest.requireActual('../middleware/auth');
  const { AppError } = jest.requireActual('../../utils/errors');
  return {
    ...actual,
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
jest.mock('../v1/health.routes', () => ({ incrementErrorCount: jest.fn() }));
jest.mock('../../utils/sentry', () => ({ captureException: jest.fn() }));
jest.mock('../../utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const SITE = '11111111-1111-4111-8111-111111111111';
const OTHER_SITE = '33333333-3333-4333-8333-333333333333';
const AREA = '22222222-2222-4222-8222-222222222222';
const OTHER_AREA = '44444444-4444-4444-8444-444444444444';
const CROP = '55555555-5555-4555-8555-555555555555';
const ORG = 'org-1';

// Everyone reaches SITE / AREA in ORG; nobody reaches OTHER_SITE / OTHER_AREA.
const areaSite: Record<string, string> = { [AREA]: SITE, [OTHER_AREA]: OTHER_SITE };

const mockService = {
  list: jest.fn(async () => ({ items: [{ id: AREA }], meta: {} })),
  getById: jest.fn(async (id: string) => ({ id, siteId: areaSite[id] ?? SITE, name: 'A' })),
  create: jest.fn(async (body: any) => ({ id: 'new', ...body })),
  update: jest.fn(async (id: string, body: any) => ({ id, ...body })),
  setCrops: jest.fn(async () => undefined),
  remove: jest.fn(async () => undefined),
};
const mockAssignments = {
  canUserAccessSite: jest.fn(async (_u: string, _r: string, siteId: string, orgId: string) => orgId === ORG && siteId === SITE),
  canUserAccessFarmArea: jest.fn(async (_u: string, _r: string, id: string, orgId: string) => orgId === ORG && id === AREA),
  getUserAccessibleFarmAreaIds: jest.fn(async () => [AREA]),
  getUserAccessibleFieldIds: jest.fn(async () => []),
};
jest.mock('../../services/farm-area.service', () => ({
  FarmAreaService: jest.fn().mockImplementation(() => mockService),
}));
jest.mock('../../services/field.service', () => ({
  FieldService: jest.fn().mockImplementation(() => ({
    list: jest.fn(async () => ({ items: [], meta: {} })),
  })),
}));
jest.mock('../../repositories/assignment.repository', () => ({
  AssignmentRepository: jest.fn().mockImplementation(() => mockAssignments),
}));

import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { farmAreasRouter } from '../v1/farm-areas.routes';
import { auth } from '../middleware/auth';
import { errorHandler } from '../middleware/errorHandler';

const user = (role: string) => ({ userId: `${role}-1`, role, email: `${role}@example.com`, organizationId: ORG });
const EDITORS = ['operation_manager', 'worker'].map(user);
const WATCHERS = ['farm_manager', 'ceo', 'agronomist'].map(user);

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/fa', auth, farmAreasRouter);
  app.use(errorHandler);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/fa`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  jest.clearAllMocks();
});

async function call(method: string, path: string, who: object, body?: unknown) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-test-user': JSON.stringify(who) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as any };
}

const writesMade = () =>
  mockService.create.mock.calls.length +
  mockService.update.mock.calls.length +
  mockService.setCrops.mock.calls.length +
  mockService.remove.mock.calls.length;

type Req = { name: string; method: string; path: string; body?: unknown; ok: number };
const writes = (site = SITE, area = AREA): Req[] => [
  { name: 'create', method: 'POST', path: '/', body: { siteId: site, name: 'Block A', size: 2 }, ok: 201 },
  { name: 'edit', method: 'PUT', path: `/${area}`, body: { name: 'Block B' }, ok: 200 },
  { name: 'assign crops', method: 'PUT', path: `/${area}/crops`, body: { cropIds: [CROP] }, ok: 200 },
  { name: 'delete', method: 'DELETE', path: `/${area}`, ok: 200 },
];

describe('operation manager and worker manage farm areas', () => {
  for (const who of EDITORS) {
    for (const r of writes()) {
      it(`${who.role}: ${r.name}`, async () => {
        const res = await call(r.method, r.path, who, r.body);
        expect(res.status).toBe(r.ok);
        expect(writesMade()).toBe(1);
      });
    }

    it(`${who.role}: edit keeping the same site`, async () => {
      const res = await call('PUT', `/${AREA}`, who, { siteId: SITE, name: 'Same site' });
      expect(res.status).toBe(200);
      expect(mockService.update).toHaveBeenCalledWith(AREA, { siteId: SITE, name: 'Same site' });
    });
  }

  it('checks access in the caller organization', async () => {
    await call('POST', '/', EDITORS[0], { siteId: SITE, name: 'X' });
    expect(mockAssignments.canUserAccessSite).toHaveBeenCalledWith('operation_manager-1', 'operation_manager', SITE, ORG);
    await call('DELETE', `/${AREA}`, EDITORS[0]);
    expect(mockAssignments.canUserAccessFarmArea).toHaveBeenCalledWith('operation_manager-1', 'operation_manager', AREA, ORG);
  });
});

describe('farm manager, CEO and agronomist only watch', () => {
  for (const who of WATCHERS) {
    it(`${who.role} gets 403 on every write and nothing is written`, async () => {
      for (const r of writes()) {
        const res = await call(r.method, r.path, who, r.body);
        expect({ req: `${r.method} ${r.path}`, status: res.status }).toEqual({ req: `${r.method} ${r.path}`, status: 403 });
      }
      expect(writesMade()).toBe(0);
    });
  }
});

describe('site and farm area access', () => {
  for (const who of EDITORS) {
    it(`${who.role} gets 404 on an inaccessible site or farm area`, async () => {
      for (const r of writes(OTHER_SITE, OTHER_AREA)) {
        const res = await call(r.method, r.path, who, r.body);
        expect({ req: `${r.method} ${r.path}`, status: res.status }).toEqual({ req: `${r.method} ${r.path}`, status: 404 });
      }
      expect(writesMade()).toBe(0);
    });

    it(`${who.role} cannot move a farm area to an inaccessible site`, async () => {
      const res = await call('PUT', `/${AREA}`, who, { siteId: OTHER_SITE });
      expect(res.status).toBe(404);
      expect(writesMade()).toBe(0);
    });

    it(`${who.role} gets 404 in another organization`, async () => {
      const outsider = { ...who, organizationId: 'org-2' };
      for (const r of writes()) {
        const res = await call(r.method, r.path, outsider, r.body);
        expect(res.status).toBe(404);
      }
      expect(writesMade()).toBe(0);
    });
  }
});

describe('reads are unchanged', () => {
  for (const who of [...EDITORS, ...WATCHERS]) {
    it(`${who.role} can list and open an accessible farm area`, async () => {
      const list = await call('GET', '/', who);
      expect(list.status).toBe(200);
      expect(list.json.data).toHaveLength(1);
      const one = await call('GET', `/${AREA}`, who);
      expect(one.status).toBe(200);
      const hidden = await call('GET', `/${OTHER_AREA}`, who);
      expect(hidden.status).toBe(404);
    });
  }
});
