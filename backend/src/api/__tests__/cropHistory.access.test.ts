/**
 * Crop Rotation write access: only workers and agronomists record rotations,
 * managers watch, a closed season locks everyone, and rows outside the caller's
 * organization are invisible. Driven through the real routers and error handler
 * on an ephemeral port with a small in-memory fake database.
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
  authorize: (...roles: string[]) => (req: any, res: any, next: any) => {
    if (roles.includes(req.user?.role)) return next();
    res.status(403).json({ success: false, error: { message: 'Forbidden' } });
  },
}));
jest.mock('../middleware/tenant', () => ({
  requireOrgId: (req: any) => req.user.organizationId,
}));
jest.mock('../../utils/fieldCropSync', () => ({
  autoClosePrevious: jest.fn(async () => undefined),
  syncFieldCrop: jest.fn(async () => undefined),
  closeCropHistoryForUproot: jest.fn(async () => undefined),
}));
// The 2025 season is closed; anything dated before 2026 is locked.
// 2026 and 2027 are separate open seasons.
jest.mock('../../services/seasons.service', () => {
  const { AppError } = jest.requireActual('../../utils/errors');
  const assertOpen = (date: string) => {
    if (String(date).slice(0, 10) < '2026-01-01') {
      throw new AppError('2025 is closed.', 'SEASON_CLOSED', 403);
    }
  };
  return {
    ...jest.requireActual('../../services/seasons.service'),
    assertFieldDateNotClosed: jest.fn(async (_fieldId: string, date: string) => assertOpen(date)),
    seasonIdForWritableField: jest.fn(async (_fieldId: string, date: string) => {
      assertOpen(date);
      return String(date).slice(0, 10) >= '2027-01-01' ? 'season-2027' : 'season-2026';
    }),
  };
});
jest.mock('../../services/field.service', () => ({
  FieldService: jest.fn().mockImplementation(() => mockFieldService),
}));
jest.mock('../../repositories/assignment.repository', () => ({
  AssignmentRepository: jest.fn().mockImplementation(() => ({
    canUserAccessField: jest.fn(async (_u: string, _r: string, fieldId: string, orgId: string) =>
      mockFieldOrg.get(fieldId) === orgId),
    getUserAccessibleFieldIds: jest.fn(async () => []),
  })),
}));
jest.mock('../../services/valve.service', () => ({ ValveService: jest.fn() }));
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

const ORG = 'org-1';
const OTHER_ORG = 'org-2';
const FIELD = '11111111-1111-4111-8111-111111111111';
const OTHER_FIELD = '22222222-2222-4222-8222-222222222222';
const CROP = '33333333-3333-4333-8333-333333333333';
const OTHER_CROP = '44444444-4444-4444-8444-444444444444';
const ROW = '55555555-5555-4555-8555-555555555555';
const CLOSED_ROW = '66666666-6666-4666-8666-666666666666';
const FOREIGN_ROW = '77777777-7777-4777-8777-777777777777';

const user = (role: string, organizationId = ORG) => ({ userId: `${role}-1`, role, email: `${role}@x.com`, organizationId });
const EDITORS = ['worker', 'agronomist'].map((r) => user(r));
const WATCHERS = ['ceo', 'farm_manager', 'operation_manager'].map((r) => user(r));

const mockFieldOrg = new Map([[FIELD, ORG], [OTHER_FIELD, OTHER_ORG]]);

interface Row { id: string; field_id: string; crop_id: string; start_date: string; end_date: string | null; season_id: string | null }
let rows: Map<string, Row>;

const mockFieldService = {
  getById: jest.fn(async (id: string) => ({ id, name: 'NH-01', currentCropId: CROP, varietyId: undefined })),
  update: jest.fn(async (id: string, body: any) => ({ id, ...body })),
  changeCrop: jest.fn(async (id: string) => ({ id })),
  addHistory: jest.fn(async () => undefined),
  getCropHistory: jest.fn(async () => []),
};

const query = jest.fn(async (sql: string, params: any[] = []) => {
  const text = sql.replace(/\s+/g, ' ').trim();
  if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(text)) return { rows: [], rowCount: 0 };
  if (text.startsWith('SELECT id FROM fields WHERE id = ANY')) {
    const hits = (params[0] as string[]).filter((id) => mockFieldOrg.get(id) === params[1]);
    return { rows: hits.map((id) => ({ id })), rowCount: hits.length };
  }
  if (text.startsWith('SELECT ch.id, ch.field_id, to_char')) {
    const row = rows.get(params[0]);
    if (!row || mockFieldOrg.get(row.field_id) !== params[1]) return { rows: [], rowCount: 0 };
    return { rows: [{ id: row.id, field_id: row.field_id, start_date: row.start_date, season_id: row.season_id }], rowCount: 1 };
  }
  if (text.startsWith('INSERT INTO crop_history')) {
    const row = { id: `new-${rows.size}`, field_id: params[0], crop_id: params[1], start_date: params[3], end_date: params[4], season_id: params[5] ?? null };
    rows.set(row.id, row);
    return { rows: [row], rowCount: 1 };
  }
  if (text.startsWith('UPDATE crop_history SET')) {
    const row = rows.get(params[params.length - 1])!;
    const sets = text.slice('UPDATE crop_history SET '.length, text.indexOf(' WHERE')).split(', ');
    sets.forEach((set, i) => {
      const col = set.split(' = ')[0];
      if (col === 'crop_id' || col === 'start_date' || col === 'end_date' || col === 'season_id') (row as any)[col] = params[i];
    });
    return { rows: [{ ...row }], rowCount: 1 };
  }
  if (text.startsWith('DELETE FROM crop_history')) {
    const had = rows.delete(params[0]);
    return { rows: [], rowCount: had ? 1 : 0 };
  }
  throw new Error(`Unexpected SQL in test: ${text.slice(0, 80)}`);
});

let server: Server;
let base: string;

beforeAll(async () => {
  const { cropHistoryRouter } = await import('../v1/cropHistory.routes');
  const { fieldsRouter } = await import('../v1/fields.routes');
  const app = express();
  app.use(express.json());
  app.use('/crop-history', cropHistoryRouter);
  app.use('/fields', (req: any, _res, next) => {
    const raw = req.headers['x-test-user'];
    if (raw) req.user = JSON.parse(String(raw));
    next();
  }, fieldsRouter);
  app.use(errorHandler);
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  rows = new Map<string, Row>([
    [ROW, { id: ROW, field_id: FIELD, crop_id: CROP, start_date: '2026-03-01', end_date: null, season_id: 'season-2026' }],
    [CLOSED_ROW, { id: CLOSED_ROW, field_id: FIELD, crop_id: CROP, start_date: '2025-03-01', end_date: '2025-09-01', season_id: 'season-2025' }],
    [FOREIGN_ROW, { id: FOREIGN_ROW, field_id: OTHER_FIELD, crop_id: CROP, start_date: '2026-03-01', end_date: null, season_id: 'season-2026' }],
  ]);
  query.mockClear();
  Object.values(mockFieldService).forEach((fn) => fn.mockClear());
  (dbPool.query as jest.Mock).mockImplementation(query);
  (dbPool.connect as jest.Mock).mockResolvedValue({ query, release: jest.fn() });
});

async function call(method: string, path: string, who: object, body?: unknown) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-test-user': JSON.stringify(who) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as any };
}

const writes = () => query.mock.calls.filter(([sql]) => /^\s*(UPDATE|INSERT|DELETE)/.test(sql));
const newEntry = { fieldId: FIELD, cropId: CROP, startDate: '2026-04-01' };

describe('crop rotation writes: workers and agronomists', () => {
  it.each(EDITORS.map((u) => [u.role, u]))('%s can add, import, edit and delete', async (_role, who) => {
    expect((await call('POST', '/crop-history', who, newEntry)).status).toBe(201);
    const bulk = await call('POST', '/crop-history/bulk', who, { entries: [newEntry] });
    expect(bulk.status).toBe(200);
    expect(bulk.json.data.created).toBe(1);
    const put = await call('PUT', `/crop-history/${ROW}`, who, { cropId: OTHER_CROP });
    expect(put.status).toBe(200);
    expect(rows.get(ROW)!.crop_id).toBe(OTHER_CROP);
    expect((await call('DELETE', `/crop-history/${ROW}`, who)).status).toBe(200);
    expect(rows.has(ROW)).toBe(false);
  });
});

describe('crop rotation writes: managers watch only', () => {
  it.each(WATCHERS.map((u) => [u.role, u]))('%s gets 403 on every write', async (_role, who) => {
    expect((await call('POST', '/crop-history', who, newEntry)).status).toBe(403);
    expect((await call('POST', '/crop-history/bulk', who, { entries: [newEntry] })).status).toBe(403);
    expect((await call('PUT', `/crop-history/${ROW}`, who, { cropId: OTHER_CROP })).status).toBe(403);
    expect((await call('DELETE', `/crop-history/${ROW}`, who)).status).toBe(403);
    expect(writes()).toHaveLength(0);
    expect(rows.get(ROW)!.crop_id).toBe(CROP);
  });
});

describe('closed season locks rotation rows', () => {
  const worker = EDITORS[0];

  it('blocks editing a row dated in a closed season', async () => {
    const res = await call('PUT', `/crop-history/${CLOSED_ROW}`, worker, { cropId: OTHER_CROP });
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe('SEASON_CLOSED');
    expect(writes()).toHaveLength(0);
  });

  it('blocks deleting a row dated in a closed season', async () => {
    const res = await call('DELETE', `/crop-history/${CLOSED_ROW}`, worker);
    expect(res.status).toBe(403);
    expect(rows.has(CLOSED_ROW)).toBe(true);
  });

  it('blocks moving an open row back into a closed season', async () => {
    const res = await call('PUT', `/crop-history/${ROW}`, worker, { startDate: '2025-06-01' });
    expect(res.status).toBe(403);
    expect(rows.get(ROW)!.start_date).toBe('2026-03-01');
  });

  it('allows moving an open row within its own season, keeping the season', async () => {
    const res = await call('PUT', `/crop-history/${ROW}`, worker, { startDate: '2026-05-01' });
    expect(res.status).toBe(200);
    expect(rows.get(ROW)!.start_date).toBe('2026-05-01');
    expect(rows.get(ROW)!.season_id).toBe('season-2026');
    const [update] = writes();
    expect(update[0]).not.toContain('season_id');
  });
});

describe('each season keeps its own rotations', () => {
  const worker = EDITORS[0];

  it('refuses moving a row into another open season and changes nothing', async () => {
    const res = await call('PUT', `/crop-history/${ROW}`, worker, { startDate: '2027-02-01' });
    expect(res.status).toBe(400);
    expect(res.json.error.message).toMatch(/different season/);
    expect(rows.get(ROW)!.start_date).toBe('2026-03-01');
    expect(rows.get(ROW)!.season_id).toBe('season-2026');
    expect(writes()).toHaveLength(0);
  });

  it('still allows adding a new rotation in the other season', async () => {
    const res = await call('POST', '/crop-history', worker, { ...newEntry, startDate: '2027-02-01' });
    expect(res.status).toBe(201);
    expect(res.json.data.season_id).toBe('season-2027');
    expect(rows.get(ROW)!.season_id).toBe('season-2026');
  });
});

describe('crop rotation rows are scoped to the caller organization', () => {
  const worker = EDITORS[0];

  it('returns 404 for another organization\'s row on edit and delete', async () => {
    expect((await call('PUT', `/crop-history/${FOREIGN_ROW}`, worker, { cropId: OTHER_CROP })).status).toBe(404);
    expect((await call('DELETE', `/crop-history/${FOREIGN_ROW}`, worker)).status).toBe(404);
    expect(rows.has(FOREIGN_ROW)).toBe(true);
    expect(writes()).toHaveLength(0);
  });

  it('returns 404 when adding to another organization\'s field', async () => {
    expect((await call('POST', '/crop-history', worker, { ...newEntry, fieldId: OTHER_FIELD })).status).toBe(404);
    const bulk = await call('POST', '/crop-history/bulk', worker, { entries: [newEntry, { ...newEntry, fieldId: OTHER_FIELD }] });
    expect(bulk.status).toBe(404);
    expect(writes()).toHaveLength(0);
  });
});

describe('fields management crop changes follow the rotation rule', () => {
  const history = { cropId: CROP, startDate: '2026-04-01', endDate: '2026-05-01' };
  const change = { cropId: OTHER_CROP, startDate: '2026-04-01' };

  it.each(EDITORS.map((u) => [u.role, u]))('%s can add history and change crop', async (_role, who) => {
    expect((await call('POST', `/fields/${FIELD}/crop-history`, who, history)).status).toBe(201);
    expect((await call('PUT', `/fields/${FIELD}/crop`, who, change)).status).toBe(200);
    expect(mockFieldService.addHistory).toHaveBeenCalled();
    expect(mockFieldService.changeCrop).toHaveBeenCalled();
  });

  it.each(WATCHERS.map((u) => [u.role, u]))('%s gets 403 on crop history and crop change', async (_role, who) => {
    expect((await call('POST', `/fields/${FIELD}/crop-history`, who, history)).status).toBe(403);
    expect((await call('PUT', `/fields/${FIELD}/crop`, who, change)).status).toBe(403);
    expect(mockFieldService.addHistory).not.toHaveBeenCalled();
    expect(mockFieldService.changeCrop).not.toHaveBeenCalled();
  });

  it('returns 404 for a field in another organization', async () => {
    expect((await call('POST', `/fields/${OTHER_FIELD}/crop-history`, EDITORS[0], history)).status).toBe(404);
  });

  it('blocks a crop change dated in a closed season', async () => {
    const res = await call('PUT', `/fields/${FIELD}/crop`, EDITORS[0], { ...change, startDate: '2025-06-01' });
    expect(res.status).toBe(403);
    expect(mockFieldService.changeCrop).not.toHaveBeenCalled();
  });

  const FIELD_EDITORS = ['operation_manager', 'worker'].map((r) => user(r));

  it.each(FIELD_EDITORS.map((u) => [u.role, u]))('%s can still edit other field details', async (_role, who) => {
    const res = await call('PUT', `/fields/${FIELD}`, who, { name: 'NH-02', area: 120 });
    expect(res.status).toBe(200);
    expect(mockFieldService.update).toHaveBeenCalledWith(FIELD, { name: 'NH-02', area: 120 });
  });

  it('the farm manager cannot edit field details at all', async () => {
    const res = await call('PUT', `/fields/${FIELD}`, user('farm_manager'), { name: 'NH-02', area: 120 });
    expect(res.status).toBe(403);
    expect(mockFieldService.update).not.toHaveBeenCalled();
  });

  it('lets field editors resend the unchanged crop with other edits', async () => {
    const res = await call('PUT', `/fields/${FIELD}`, user('operation_manager'), { name: 'NH-02', currentCropId: CROP });
    expect(res.status).toBe(200);
  });

  it.each(FIELD_EDITORS.map((u) => [u.role, u]))('rejects a %s field edit that changes the crop', async (_role, who) => {
    const res = await call('PUT', `/fields/${FIELD}`, who, { name: 'NH-02', currentCropId: OTHER_CROP });
    expect(res.status).toBe(403);
    expect(res.json.error.message).toMatch(/Crop Rotation/);
    expect(mockFieldService.update).not.toHaveBeenCalled();
  });
});
