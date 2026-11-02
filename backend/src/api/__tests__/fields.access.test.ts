/**
 * Field, valve and field-type write access:
 * - the operation manager and data entry worker add / edit / rename / delete fields,
 *   including valve counts and valves; the farm manager (no data entry) and the CEO watch
 * - nobody changes crop or variety through the generic field edit (Crop Rotation only)
 * - fields and farm areas outside the caller's sites/organization are 404
 * - field types need a login; writes are OM / worker only
 * Driven through the real routers and error handler on an ephemeral port.
 */
jest.mock('../../db/client', () => ({
  dbPool: { query: jest.fn(), connect: jest.fn() },
}));
jest.mock('../middleware/auth', () => ({
  auth: (req: any, res: any, next: any) => {
    const raw = req.headers['x-test-user'];
    if (!raw) {
      res.status(401).json({ success: false, error: { message: 'Authorization header missing or invalid' } });
      return;
    }
    req.user = JSON.parse(String(raw));
    next();
  },
  authorize: (...roles: string[]) => (req: any, res: any, next: any) => {
    if (roles.includes(req.user?.role)) return next();
    res.status(403).json({ success: false, error: { message: 'Forbidden' } });
  },
}));
jest.mock('../middleware/tenant', () => ({
  requireOrgId: (req: any) => req.user.organizationId,
}));
jest.mock('../../services/seasons.service', () => ({
  assertFieldDateNotClosed: jest.fn(async () => undefined),
}));
jest.mock('../../services/field.service', () => ({
  FieldService: jest.fn().mockImplementation(() => mockFieldService),
}));
jest.mock('../../services/valve.service', () => ({
  ValveService: jest.fn().mockImplementation(() => mockValveService),
}));
jest.mock('../../services/field-type.service', () => ({
  FieldTypeService: jest.fn().mockImplementation(() => mockFieldTypeService),
}));
jest.mock('../../repositories/assignment.repository', () => ({
  AssignmentRepository: jest.fn().mockImplementation(() => ({
    canUserAccessField: jest.fn(async (_u: string, _r: string, fieldId: string, orgId: string) =>
      orgId === 'org-1' && mockAccessibleFields.has(fieldId)),
    canUserAccessFarmArea: jest.fn(async (_u: string, _r: string, farmAreaId: string, orgId: string) =>
      orgId === 'org-1' && mockAccessibleFarmAreas.has(farmAreaId)),
    getUserAccessibleFieldIds: jest.fn(async () => []),
  })),
}));
jest.mock('../../services/auditLog.service', () => ({
  logAuditEvent: jest.fn(async () => undefined),
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

const FIELD = '11111111-1111-4111-8111-111111111111';
const HIDDEN_FIELD = '22222222-2222-4222-8222-222222222222';
const FARM_AREA = '33333333-3333-4333-8333-333333333333';
const HIDDEN_FARM_AREA = '44444444-4444-4444-8444-444444444444';
const CROP = '55555555-5555-4555-8555-555555555555';
const OTHER_CROP = '66666666-6666-4666-8666-666666666666';
const VARIETY = '77777777-7777-4777-8777-777777777777';
const FIELD_TYPE = '88888888-8888-4888-8888-888888888888';

const mockAccessibleFields = new Set([FIELD]);
const mockAccessibleFarmAreas = new Set([FARM_AREA]);

const mockFieldService = {
  getById: jest.fn(async (id: string) => ({ id, name: 'NH-01', currentCropId: CROP, varietyId: null, valveCount: 4 })),
  create: jest.fn(async (body: any) => ({ id: 'new-field', ...body })),
  update: jest.fn(async (id: string, body: any) => ({ id, ...body })),
  remove: jest.fn(async () => undefined),
  changeCrop: jest.fn(),
  addHistory: jest.fn(),
  getCropHistory: jest.fn(async () => []),
};
const mockValveService = {
  replaceForField: jest.fn(async () => undefined),
  listByField: jest.fn(async () => [{ number: 1 }]),
};
const mockFieldTypeService = {
  list: jest.fn(async () => ({ items: [{ id: FIELD_TYPE, name: 'NetHouse' }], meta: {} })),
  getById: jest.fn(async (id: string) => ({ id, name: 'NetHouse' })),
  create: jest.fn(async (body: any) => ({ id: FIELD_TYPE, ...body })),
  update: jest.fn(async (id: string, body: any) => ({ id, ...body })),
  remove: jest.fn(async () => undefined),
};

const user = (role: string) => ({ userId: `${role}-1`, role, email: `${role}@x.com`, organizationId: 'org-1' });
const FIELD_EDITORS = ['operation_manager', 'worker'].map(user);
const CEO = user('ceo');
const FM = user('farm_manager');

let server: Server;
let base: string;

beforeAll(async () => {
  const { fieldsRouter } = await import('../v1/fields.routes');
  const { fieldTypesRouter } = await import('../v1/field-types.routes');
  const { auth } = await import('../middleware/auth');
  const app = express();
  app.use(express.json());
  app.use('/fields', auth, fieldsRouter);
  app.use('/field-types', fieldTypesRouter);
  app.use(errorHandler);
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  [mockFieldService, mockValveService, mockFieldTypeService].forEach((svc) =>
    Object.values(svc).forEach((fn) => (fn as jest.Mock).mockClear()));
  (dbPool.query as jest.Mock).mockImplementation(async (sql: string) => {
    throw new Error(`Unexpected SQL in test: ${sql.slice(0, 80)}`);
  });
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

const roles = (list: Array<{ role: string }>) => list.map((u) => [u.role, u] as const);
const newField = { farmAreaId: FARM_AREA, fieldTypeId: FIELD_TYPE, name: 'NH-09' };

describe('fields: operation manager and worker manage fields', () => {
  it.each(roles(FIELD_EDITORS))('%s can add, rename and delete a field', async (_role, who) => {
    expect((await call('POST', '/fields', who, newField)).status).toBe(201);
    const put = await call('PUT', `/fields/${FIELD}`, who, { name: 'NH-01 East', area: 50 });
    expect(put.status).toBe(200);
    expect(mockFieldService.update).toHaveBeenCalledWith(FIELD, { name: 'NH-01 East', area: 50 });
    expect((await call('DELETE', `/fields/${FIELD}`, who)).status).toBe(200);
    expect(mockFieldService.remove).toHaveBeenCalledWith(FIELD);
  });

  it.each(roles(['farm_manager', 'ceo', 'agronomist', 'scouter'].map(user)))('%s gets 403 on every field write', async (_role, who) => {
    expect((await call('POST', '/fields', who, newField)).status).toBe(403);
    expect((await call('POST', '/fields', who, { ...newField, valveCount: 4 })).status).toBe(403);
    expect((await call('PUT', `/fields/${FIELD}`, who, { name: 'X' })).status).toBe(403);
    expect((await call('PUT', `/fields/${FIELD}`, who, { valveCount: 4 })).status).toBe(403);
    expect((await call('DELETE', `/fields/${FIELD}`, who)).status).toBe(403);
    expect(mockFieldService.create).not.toHaveBeenCalled();
    expect(mockFieldService.update).not.toHaveBeenCalled();
    expect(mockFieldService.remove).not.toHaveBeenCalled();
  });

  it.each(roles([CEO, FM]))('%s can still read a field', async (_role, who) => {
    expect((await call('GET', `/fields/${FIELD}`, who)).status).toBe(200);
  });
});

describe('fields: site and organization scoping', () => {
  it.each(roles(FIELD_EDITORS))('%s gets 404 for a field outside their sites', async (_role, who) => {
    expect((await call('PUT', `/fields/${HIDDEN_FIELD}`, who, { name: 'X' })).status).toBe(404);
    expect((await call('DELETE', `/fields/${HIDDEN_FIELD}`, who)).status).toBe(404);
    expect(mockFieldService.update).not.toHaveBeenCalled();
    expect(mockFieldService.remove).not.toHaveBeenCalled();
  });

  it.each(roles(FIELD_EDITORS))('%s gets 404 adding to a farm area outside their sites', async (_role, who) => {
    expect((await call('POST', '/fields', who, { ...newField, farmAreaId: HIDDEN_FARM_AREA })).status).toBe(404);
    expect(mockFieldService.create).not.toHaveBeenCalled();
  });

  it('refuses moving a field into a farm area outside the caller sites', async () => {
    const res = await call('PUT', `/fields/${FIELD}`, user('worker'), { farmAreaId: HIDDEN_FARM_AREA });
    expect(res.status).toBe(404);
    expect(mockFieldService.update).not.toHaveBeenCalled();
  });

  it('returns 404 for a user of another organization', async () => {
    const outsider = { ...user('operation_manager'), organizationId: 'org-2' };
    expect((await call('PUT', `/fields/${FIELD}`, outsider, { name: 'X' })).status).toBe(404);
    expect((await call('POST', '/fields', outsider, newField)).status).toBe(404);
  });
});

describe('fields: crop and variety only change through Crop Rotation', () => {
  it.each(roles(FIELD_EDITORS))('%s cannot change crop or variety on the generic edit', async (_role, who) => {
    const crop = await call('PUT', `/fields/${FIELD}`, who, { currentCropId: OTHER_CROP });
    expect(crop.status).toBe(403);
    expect(crop.json.error.message).toMatch(/Crop Rotation/);
    const variety = await call('PUT', `/fields/${FIELD}`, who, { varietyId: VARIETY });
    expect(variety.status).toBe(403);
    expect(mockFieldService.update).not.toHaveBeenCalled();
  });

  it('allows resending the unchanged crop and variety', async () => {
    const res = await call('PUT', `/fields/${FIELD}`, user('worker'), { name: 'NH-02', currentCropId: CROP, varietyId: null });
    expect(res.status).toBe(200);
  });
});

describe('fields: valve count is operation manager / worker only', () => {
  it.each(roles(FIELD_EDITORS))('%s can set any valve count', async (_role, who) => {
    expect((await call('PUT', `/fields/${FIELD}`, who, { valveCount: 6 })).status).toBe(200);
    expect((await call('POST', '/fields', who, { ...newField, valveCount: 9 })).status).toBe(201);
  });
});

describe('field valves: operation manager and worker change, CEO and farm manager watch', () => {
  const body = { valves: [{ number: 1, name: 'V1' }] };

  it.each(roles(FIELD_EDITORS))('%s can replace valves', async (_role, who) => {
    expect((await call('PUT', `/fields/${FIELD}/valves`, who, body)).status).toBe(200);
    expect(mockValveService.replaceForField).toHaveBeenCalledWith(FIELD, body.valves);
  });

  it.each(roles([CEO, FM]))('%s gets 403 replacing valves but can read them', async (_role, who) => {
    expect((await call('PUT', `/fields/${FIELD}/valves`, who, body)).status).toBe(403);
    expect(mockValveService.replaceForField).not.toHaveBeenCalled();
    expect((await call('GET', `/fields/${FIELD}/valves`, who)).status).toBe(200);
  });

  it('returns 404 for a field outside the caller sites', async () => {
    expect((await call('PUT', `/fields/${HIDDEN_FIELD}/valves`, user('worker'), body)).status).toBe(404);
    expect(mockValveService.replaceForField).not.toHaveBeenCalled();
  });
});

describe('field types: login required, writes for OM / worker', () => {
  const ft = { name: 'Greenhouse', defaultValveCount: 2 };

  it('refuses anonymous reads and writes with 401', async () => {
    expect((await call('GET', '/field-types', null)).status).toBe(401);
    expect((await call('POST', '/field-types', null, ft)).status).toBe(401);
    expect((await call('PUT', `/field-types/${FIELD_TYPE}`, null, ft)).status).toBe(401);
    expect((await call('DELETE', `/field-types/${FIELD_TYPE}`, null)).status).toBe(401);
    expect(mockFieldTypeService.create).not.toHaveBeenCalled();
    expect(mockFieldTypeService.update).not.toHaveBeenCalled();
    expect(mockFieldTypeService.remove).not.toHaveBeenCalled();
  });

  it.each(roles(FIELD_EDITORS))('%s can add, edit and delete field types', async (_role, who) => {
    expect((await call('POST', '/field-types', who, ft)).status).toBe(201);
    expect((await call('PUT', `/field-types/${FIELD_TYPE}`, who, { name: 'NetHouse 2' })).status).toBe(200);
    expect((await call('DELETE', `/field-types/${FIELD_TYPE}`, who)).status).toBe(200);
  });

  it.each(roles([FM, CEO, user('agronomist')]))('%s gets 403 writing field types', async (_role, who) => {
    expect((await call('POST', '/field-types', who, ft)).status).toBe(403);
    expect((await call('PUT', `/field-types/${FIELD_TYPE}`, who, { name: 'X' })).status).toBe(403);
    expect((await call('DELETE', `/field-types/${FIELD_TYPE}`, who)).status).toBe(403);
    expect(mockFieldTypeService.create).not.toHaveBeenCalled();
  });

  it.each(roles([FM, CEO, user('agronomist'), user('scouter')]))('%s can read field types', async (_role, who) => {
    expect((await call('GET', '/field-types', who)).status).toBe(200);
    expect((await call('GET', `/field-types/${FIELD_TYPE}`, who)).status).toBe(200);
  });
});
