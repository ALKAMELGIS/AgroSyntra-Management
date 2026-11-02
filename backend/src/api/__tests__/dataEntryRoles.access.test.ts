/**
 * Data-entry write ownership, enforced on the API. Every router is driven
 * through the real route handlers, the real `authorize` middleware and the real
 * error handler on an ephemeral port; login is faked with an x-test-user
 * header, services and the database are faked, and the season lock is faked
 * as "any date equal to CLOSED_DATE is in a closed season".
 *
 *   offline sync, pivot fertilizer, soil sensor        -> worker, agronomist
 *   historical import                                  -> operation manager, worker, agronomist
 *   plantation opening rows                            -> operation manager, agronomist, worker
 *   scouting reports (incl. photos)                    -> scouter (own, open), pest agronomist, agronomist
 *   bio releases                                       -> pest agronomist, IPM admin; field in caller's org
 *   manpower bulk-update                               -> importing worker, own pending / own imported rows
 *   sync / fertigation / drip                          -> refuse closed-season dates
 */
jest.mock('../../db/client', () => ({
  dbPool: { query: jest.fn(), connect: jest.fn() },
}));
jest.mock('../../cache/client', () => ({
  redisClient: { get: jest.fn(), setex: jest.fn(), del: jest.fn() },
}));
jest.mock('../middleware/auth', () => {
  const actual = jest.requireActual('../middleware/auth');
  return {
    ...actual,
    auth: (req: any, _res: any, next: any) => {
      const raw = req.headers['x-test-user'];
      if (raw) req.user = JSON.parse(String(raw));
      next();
    },
  };
});
jest.mock('../middleware/tenant', () => ({
  ...jest.requireActual('../middleware/tenant'),
  requireOrgId: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
}));
jest.mock('../v1/health.routes', () => ({ incrementErrorCount: jest.fn() }));
jest.mock('../../utils/sentry', () => ({ captureException: jest.fn() }));
jest.mock('../../utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../websocket', () => ({ emitDataChange: jest.fn() }));
jest.mock('../../services/webhook.service', () => ({ deliverWebhooks: jest.fn(() => Promise.resolve()) }));
jest.mock('../../services/auditLog.service', () => ({ logAuditEvent: jest.fn(() => Promise.resolve()) }));
jest.mock('../../services/inventory.service', () => ({
  deductByName: jest.fn(() => Promise.resolve()),
  reverseUsageByReference: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../repositories/assignment.repository', () => ({
  AssignmentRepository: jest.fn().mockImplementation(() => ({
    canUserAccessField: jest.fn(() => Promise.resolve(true)),
  })),
}));
jest.mock('../../utils/tenantValidation', () => {
  const { AppError } = jest.requireActual('../../utils/errors');
  const OTHER_ORG_FIELD = '77777777-7777-4777-8777-777777777777';
  return {
    assertFieldInOrganization: jest.fn(async (fieldId: string) => {
      if (fieldId === OTHER_ORG_FIELD) throw new AppError('Field not found in organization', 'FORBIDDEN', 403);
    }),
    assertSiteInOrganization: jest.fn(() => Promise.resolve()),
  };
});
jest.mock('../../services/seasons.service', () => {
  const actual = jest.requireActual('../../services/seasons.service');
  const { AppError } = jest.requireActual('../../utils/errors');
  const closed = (date: unknown) => {
    if (String(date ?? '').slice(0, 10) === '2025-01-15') {
      throw new AppError('Season 2025 is closed.', 'SEASON_CLOSED', 403);
    }
  };
  return {
    ...actual,
    assertFieldDateWritable: jest.fn(async (_fieldId: string, date: unknown) => closed(date)),
    assertFieldDateNotClosed: jest.fn(async (_fieldId: string, date: unknown) => closed(date)),
    assertDateWritableForSite: jest.fn(async (_siteId: string, date: unknown) => closed(date)),
  };
});
jest.mock('../../repositories/fertigation.repository', () => ({
  FertigationRepository: jest.fn().mockImplementation(() => ({
    getById: jest.fn(async (id: string) => ({
      id,
      fieldId: '66666666-6666-4666-8666-666666666666',
      date: id === 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' ? '2025-01-15' : '2026-09-01',
    })),
    create: jest.fn(async () => ({ id: 'new-entry' })),
    update: jest.fn(async (id: string) => ({ id })),
    delete: jest.fn(async () => undefined),
    findIdByFieldAndDate: jest.fn(async () => null),
  })),
}));
jest.mock('../../services/fertilizerApplication.service', () => ({
  listFertilizerProducts: jest.fn(async () => []),
  upsertFertilizerProduct: jest.fn(async () => ({ id: 'p' })),
  syncFertilizerProducts: jest.fn(async () => []),
  getWorkbook: jest.fn(async () => null),
  ensureWorkbook: jest.fn(async () => ({ id: 'wb' })),
  listRecords: jest.fn(async () => []),
  createRecord: jest.fn(async () => ({ id: 'r' })),
  updateRecord: jest.fn(async () => ({ id: 'r' })),
  deleteRecord: jest.fn(async () => undefined),
  bulkImport: jest.fn(async () => ({ inserted: 0 })),
}));
jest.mock('../../services/soilSensor.service', () => ({
  list: jest.fn(async () => ({ items: [], meta: {} })),
  getLatestBySite: jest.fn(async () => []),
  create: jest.fn(async () => ({ id: 'soil' })),
}));
jest.mock('../../services/plantationOpeningApproval.service', () => ({
  approveOpeningRecord: jest.fn(),
  assertOpeningRowEditable: jest.fn(() => Promise.resolve()),
  revokeOpeningApproval: jest.fn(),
}));
jest.mock('../../services/scouting.service');
jest.mock('../../services/ipm.service');
jest.mock('../../services/manpower.service');

import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { dbPool } from '../../db/client';
import * as scoutingService from '../../services/scouting.service';
import * as ipmService from '../../services/ipm.service';
import * as manpowerService from '../../services/manpower.service';
import * as fertApp from '../../services/fertilizerApplication.service';
import * as soilService from '../../services/soilSensor.service';
import { reverseUsageByReference } from '../../services/inventory.service';
import { syncRouter } from '../v1/sync.routes';
import { fertilizerApplicationRouter } from '../v1/fertilizerApplication.routes';
import { historicalImportRouter } from '../v1/historicalImport.routes';
import { soilSensorRouter } from '../v1/soil-sensor.routes';
import { fertigationRouter } from '../v1/fertigation.routes';
import { irrigationDripRouter } from '../v1/irrigationDrip.routes';
import { plantationWorkbookRouter } from '../v1/plantationWorkbook.routes';
import { scoutingRouter } from '../v1/scouting.routes';
import { ipmRouter } from '../v1/ipm.routes';
import { manpowerRouter } from '../v1/manpower.routes';
import { errorHandler } from '../middleware/errorHandler';

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SITE = '11111111-1111-4111-8111-111111111111';
const FIELD = '66666666-6666-4666-8666-666666666666';
const OTHER_ORG_FIELD = '77777777-7777-4777-8777-777777777777';
const RECORD = '22222222-2222-4222-8222-222222222222';
const CLOSED_ENTRY = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OPEN_DATE = '2026-09-01';
const CLOSED_DATE = '2025-01-15';

type TestUser = { userId: string; role: string; email: string };
const as = (role: string, userId = `${role}-1`, email = `${role}@example.com`): TestUser => ({ userId, role, email });

const WK = as('worker');
const AG = as('agronomist');
const OM = as('operation_manager');
const PA = as('pest_agronomist');
const SC = as('scouter');
const FM = as('farm_manager');
const CEO = as('ceo');
const OPERATOR = as('operator');
const AUDITOR = as('auditor');
const ADM = as('ceo', 'adm-1', 'abdullah@elite.com');

const ALL = [WK, AG, OM, PA, SC, FM, CEO, OPERATOR, AUDITOR];
const others = (allowed: TestUser[]) => ALL.filter((u) => !allowed.includes(u));

const clientQuery = jest.fn(async () => ({ rows: [{ id: 'server-id' }], rowCount: 1 }));
const dbQuery = jest.fn(async () => ({ rows: [], rowCount: 1 }));

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/sync', syncRouter);
  app.use('/fertilizer-applications', fertilizerApplicationRouter);
  app.use('/imports', historicalImportRouter);
  app.use('/soil-sensor', soilSensorRouter);
  app.use('/fertigation', (req: any, _res, next) => {
    // index.ts mounts this router behind `auth`; mirror that with the fake login.
    const raw = req.headers['x-test-user'];
    if (raw) req.user = JSON.parse(String(raw));
    next();
  }, fertigationRouter);
  app.use('/irrigation-drip', irrigationDripRouter);
  app.use('/plantation-workbook', plantationWorkbookRouter);
  app.use('/scouting', scoutingRouter);
  app.use('/ipm', ipmRouter);
  app.use('/manpower', manpowerRouter);
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
  jest.clearAllMocks();
  (dbPool.query as jest.Mock).mockImplementation(dbQuery);
  (dbPool.connect as jest.Mock).mockImplementation(async () => ({ query: clientQuery, release: jest.fn() }));
});

async function call(method: string, path: string, user: TestUser | null, body?: unknown) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (user) headers['x-test-user'] = JSON.stringify(user);
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json()) as any;
  return { status: res.status, json };
}

const inserts = () => clientQuery.mock.calls.filter((c: any[]) => /^\s*INSERT/.test(String(c[0])));

// ─── 1. Offline sync ──────────────────────────────────────────────

describe('POST /sync/batch', () => {
  const batch = (date = OPEN_DATE) => ({
    harvests: [{ localId: 'h1', field_id: FIELD, harvest_date: date, quantity_kg: 10 }],
    fertigations: [{ localId: 'f1', field_id: FIELD, application_date: OPEN_DATE, water_amount: 5 }],
    ecphEntries: [{ localId: 'e1', field_id: FIELD, measurement_date: OPEN_DATE, ec_in: 1.2 }],
  });

  for (const user of [WK, AG]) {
    it(`${user.role} syncs harvest, fertigation and EC/pH rows`, async () => {
      const res = await call('POST', '/sync/batch', user, batch());
      expect(res.status).toBe(200);
      expect(inserts().length).toBeGreaterThanOrEqual(3);
    });
  }

  for (const user of others([WK, AG])) {
    it(`${user.role} is refused`, async () => {
      const res = await call('POST', '/sync/batch', user, batch());
      expect(res.status).toBe(403);
      expect(inserts()).toHaveLength(0);
    });
  }

  it('a harvest dated in a closed season blocks the whole batch', async () => {
    const res = await call('POST', '/sync/batch', WK, batch(CLOSED_DATE));
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe('SEASON_CLOSED');
    expect(inserts()).toHaveLength(0);
  });

  it('a fertigation or EC/pH row dated in a closed season is refused too', async () => {
    const fert = batch();
    fert.fertigations[0].application_date = CLOSED_DATE;
    expect((await call('POST', '/sync/batch', AG, fert)).status).toBe(403);
    const ecph = batch();
    ecph.ecphEntries[0].measurement_date = CLOSED_DATE;
    expect((await call('POST', '/sync/batch', AG, ecph)).status).toBe(403);
    expect(inserts()).toHaveLength(0);
  });
});

// ─── 2. Pivot fertilizer application ──────────────────────────────

describe('/fertilizer-applications writes', () => {
  const record = { siteId: SITE, fieldId: FIELD, date: OPEN_DATE, fertilizerName: 'Urea' };
  const writes: Array<[string, string, unknown]> = [
    ['POST', '/records', record],
    ['PUT', `/records/${RECORD}`, { totalKg: 5 }],
    ['DELETE', `/records/${RECORD}`, undefined],
    ['POST', '/import', { siteId: SITE, mode: 'merge', records: [] }],
    ['POST', '/workbook', { siteId: SITE }],
    ['POST', '/fertilizer-products', { name: 'Urea' }],
    ['POST', '/fertilizer-products/sync', { names: ['Urea'] }],
  ];

  for (const [method, path, body] of writes) {
    for (const user of [WK, AG]) {
      it(`${user.role}: ${method} ${path} is allowed`, async () => {
        const res = await call(method, `/fertilizer-applications${path}`, user, body);
        expect(res.status).toBeLessThan(300);
      });
    }
    for (const user of others([WK, AG])) {
      it(`${user.role}: ${method} ${path} is 403`, async () => {
        const res = await call(method, `/fertilizer-applications${path}`, user, body);
        expect(res.status).toBe(403);
      });
    }
  }

  it('nothing is written for a refused role', async () => {
    await call('POST', '/fertilizer-applications/records', FM, record);
    await call('DELETE', `/fertilizer-applications/records/${RECORD}`, CEO);
    expect(fertApp.createRecord).not.toHaveBeenCalled();
    expect(fertApp.deleteRecord).not.toHaveBeenCalled();
  });

  it('every role still reads the records', async () => {
    for (const user of [CEO, FM, OM]) {
      const res = await call('GET', `/fertilizer-applications/records?site_id=${SITE}`, user);
      expect(res.status).toBe(200);
    }
  });
});

// ─── 3. Historical import ─────────────────────────────────────────

describe('/imports', () => {
  for (const user of [OM, WK, AG]) {
    it(`${user.role} may use the importer`, async () => {
      expect((await call('GET', '/imports/targets', user)).status).toBe(200);
    });
  }
  for (const user of others([OM, WK, AG])) {
    it(`${user.role} is 403`, async () => {
      expect((await call('GET', '/imports/targets', user)).status).toBe(403);
    });
  }
});

// ─── 4. Soil sensor ───────────────────────────────────────────────

describe('POST /soil-sensor', () => {
  const body = { field_id: FIELD, date: OPEN_DATE, moisture_pct: 20 };
  for (const user of [WK, AG]) {
    it(`${user.role} adds a reading`, async () => {
      expect((await call('POST', '/soil-sensor', user, body)).status).toBe(201);
    });
  }
  for (const user of others([WK, AG])) {
    it(`${user.role} is 403`, async () => {
      expect((await call('POST', '/soil-sensor', user, body)).status).toBe(403);
      expect(soilService.create).not.toHaveBeenCalled();
    });
  }
});

// ─── 5. Fertigation entries and drip irrigation: closed season ────

describe('fertigation entries refuse closed-season dates', () => {
  it('create in an open season works', async () => {
    const res = await call('POST', '/fertigation', WK, { fieldId: FIELD, date: OPEN_DATE });
    expect(res.status).toBe(201);
  });

  it('create in a closed season is 403', async () => {
    const res = await call('POST', '/fertigation', WK, { fieldId: FIELD, date: CLOSED_DATE });
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe('SEASON_CLOSED');
  });

  it('moving an entry into a closed season is 403 and inventory is untouched', async () => {
    const res = await call('PUT', `/fertigation/${RECORD}`, AG, { date: CLOSED_DATE });
    expect(res.status).toBe(403);
    expect(reverseUsageByReference).not.toHaveBeenCalled();
  });

  it('editing or deleting an entry already in a closed season is 403', async () => {
    expect((await call('PUT', `/fertigation/${CLOSED_ENTRY}`, AG, { dailyWater: 3 })).status).toBe(403);
    expect((await call('DELETE', `/fertigation/${CLOSED_ENTRY}`, AG)).status).toBe(403);
    expect(reverseUsageByReference).not.toHaveBeenCalled();
  });

  it('bulk import rejects only the closed-season rows', async () => {
    const res = await call('POST', '/fertigation/bulk', WK, {
      entries: [
        { fieldId: FIELD, date: OPEN_DATE },
        { fieldId: FIELD, date: CLOSED_DATE },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.json.data.inserted).toBe(1);
    expect(res.json.data.errors).toEqual([expect.stringContaining('closed')]);
  });

  it('managers still cannot write fertigation entries', async () => {
    expect((await call('POST', '/fertigation', FM, { fieldId: FIELD, date: OPEN_DATE })).status).toBe(403);
  });
});

describe('drip irrigation refuses closed-season dates', () => {
  const day = (date: string) => ({
    date,
    locations: [{ locationLabel: 'NH1', waterQtyM3: 2, frequency: 3 }],
  });

  it('saving an open-season day works', async () => {
    const res = await call('POST', '/irrigation-drip/bulk', WK, { siteId: SITE, days: [day(OPEN_DATE)] });
    expect(res.status).toBe(200);
  });

  it('saving a closed-season day is 403 and nothing is replaced', async () => {
    const res = await call('POST', '/irrigation-drip/bulk', WK, { siteId: SITE, days: [day(OPEN_DATE), day(CLOSED_DATE)] });
    expect(res.status).toBe(403);
    expect(dbPool.connect).not.toHaveBeenCalled();
  });

  it('deleting a closed-season day is 403', async () => {
    const res = await call('DELETE', `/irrigation-drip/day?site_id=${SITE}&date=${CLOSED_DATE}`, AG);
    expect(res.status).toBe(403);
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it('deleting a single closed-season entry is 403', async () => {
    dbQuery.mockResolvedValueOnce({ rows: [{ site_id: SITE, date: CLOSED_DATE }], rowCount: 1 } as any);
    const res = await call('DELETE', `/irrigation-drip/${RECORD}`, AG);
    expect(res.status).toBe(403);
    expect(dbQuery).toHaveBeenCalledTimes(1);
  });
});

// ─── 6. Plantation workbook opening rows ──────────────────────────

describe('plantation opening rows', () => {
  const routes: Array<[string, string, unknown]> = [
    ['POST', '/opening', {}],
    ['PUT', `/opening/${RECORD}`, {}],
    ['DELETE', `/opening/${RECORD}`, undefined],
    ['POST', '/opening/bulk', {}],
  ];
  for (const [method, path, body] of routes) {
    for (const user of [CEO, FM]) {
      it(`${user.role}: ${method} ${path} is 403 and touches nothing`, async () => {
        const res = await call(method, `/plantation-workbook${path}`, user, body);
        expect(res.status).toBe(403);
        expect(dbQuery).not.toHaveBeenCalled();
        expect(dbPool.connect).not.toHaveBeenCalled();
      });
    }
    for (const user of [OM, AG, WK]) {
      it(`${user.role}: ${method} ${path} passes the role check`, async () => {
        const res = await call(method, `/plantation-workbook${path}`, user, body);
        expect(res.status).not.toBe(403);
      });
    }
  }

  it('the operation manager deletes an unapproved opening row', async () => {
    const res = await call('DELETE', `/plantation-workbook/opening/${RECORD}`, OM);
    expect(res.status).toBe(200);
  });
});

// ─── 7. Scouting reports ──────────────────────────────────────────

describe('scouting reports', () => {
  const report = (overrides: object = {}) => ({
    id: RECORD,
    field_id: FIELD,
    scout_user_id: SC.userId,
    status: 'submitted',
    ...overrides,
  });

  beforeEach(() => {
    (scoutingService.getScoutingReportById as jest.Mock).mockResolvedValue(report());
    (scoutingService.createScoutingReport as jest.Mock).mockResolvedValue(report());
    (scoutingService.updateScoutingReport as jest.Mock).mockResolvedValue(report());
    (scoutingService.deleteScoutingReport as jest.Mock).mockResolvedValue(true);
    (scoutingService.addScoutingPhotos as jest.Mock).mockResolvedValue([{ id: 'photo' }]);
    (scoutingService.updateScoutingReportStatus as jest.Mock).mockResolvedValue(report({ status: 'reviewed' }));
  });

  const body = { fieldId: FIELD, reportDate: OPEN_DATE };
  const photos = { photos: [{ filePath: '/uploads/p.jpg' }] };

  for (const user of [SC, PA, AG]) {
    it(`${user.role} creates a report`, async () => {
      expect((await call('POST', '/scouting/reports', user, body)).status).toBe(201);
    });
  }
  for (const user of others([SC, PA, AG])) {
    it(`${user.role} cannot create a report`, async () => {
      expect((await call('POST', '/scouting/reports', user, body)).status).toBe(403);
    });
  }

  it('pest agronomist and agronomist edit any report, whatever its status', async () => {
    (scoutingService.getScoutingReportById as jest.Mock).mockResolvedValue(report({ status: 'resolved', scout_user_id: 'someone' }));
    for (const user of [PA, AG]) {
      expect((await call('PUT', `/scouting/reports/${RECORD}`, user, body)).status).toBe(200);
    }
  });

  it('the scouter edits only their own submitted or returned report', async () => {
    expect((await call('PUT', `/scouting/reports/${RECORD}`, SC, body)).status).toBe(200);
    (scoutingService.getScoutingReportById as jest.Mock).mockResolvedValue(report({ status: 'reviewed' }));
    expect((await call('PUT', `/scouting/reports/${RECORD}`, SC, body)).status).toBe(403);
    (scoutingService.getScoutingReportById as jest.Mock).mockResolvedValue(report({ scout_user_id: 'someone' }));
    expect((await call('PUT', `/scouting/reports/${RECORD}`, SC, body)).status).toBe(403);
  });

  for (const user of [CEO, FM, OM, WK, ADM]) {
    it(`${user.email}: edit, delete and photos are 403`, async () => {
      expect((await call('PUT', `/scouting/reports/${RECORD}`, user, body)).status).toBe(403);
      expect((await call('DELETE', `/scouting/reports/${RECORD}`, user)).status).toBe(403);
      expect((await call('POST', `/scouting/reports/${RECORD}/photos`, user, photos)).status).toBe(403);
      expect(scoutingService.updateScoutingReport).not.toHaveBeenCalled();
      expect(scoutingService.deleteScoutingReport).not.toHaveBeenCalled();
      expect(scoutingService.addScoutingPhotos).not.toHaveBeenCalled();
    });
  }

  it('only the pest agronomist and agronomist delete', async () => {
    expect((await call('DELETE', `/scouting/reports/${RECORD}`, PA)).status).toBe(200);
    expect((await call('DELETE', `/scouting/reports/${RECORD}`, AG)).status).toBe(200);
    expect((await call('DELETE', `/scouting/reports/${RECORD}`, SC)).status).toBe(403);
  });

  it('photos follow the edit rule', async () => {
    expect((await call('POST', `/scouting/reports/${RECORD}/photos`, SC, photos)).status).toBe(201);
    expect((await call('POST', `/scouting/reports/${RECORD}/photos`, PA, photos)).status).toBe(201);
    (scoutingService.getScoutingReportById as jest.Mock).mockResolvedValue(report({ scout_user_id: 'someone' }));
    expect((await call('POST', `/scouting/reports/${RECORD}/photos`, SC, photos)).status).toBe(403);
    (scoutingService.getScoutingReportById as jest.Mock).mockResolvedValue(report({ status: 'resolved' }));
    expect((await call('POST', `/scouting/reports/${RECORD}/photos`, SC, photos)).status).toBe(403);
  });

  it('review stays with the pest agronomist and the IPM admin', async () => {
    expect((await call('PATCH', `/scouting/reports/${RECORD}/status`, PA, { status: 'reviewed' })).status).toBe(200);
    expect((await call('PATCH', `/scouting/reports/${RECORD}/status`, ADM, { status: 'reviewed' })).status).toBe(200);
    expect((await call('PATCH', `/scouting/reports/${RECORD}/status`, AG, { status: 'reviewed' })).status).toBe(403);
  });
});

// ─── 8. Bio-control releases ──────────────────────────────────────

describe('POST /ipm/bio-releases', () => {
  const body = { fieldId: FIELD, productId: 'p-1', quantity: 10, organizationId: 'spoofed-org' };

  beforeEach(() => {
    (ipmService.createBioRelease as jest.Mock).mockResolvedValue({ id: 'release' });
  });

  for (const user of [PA, ADM]) {
    it(`${user.email} records a release in their own organization`, async () => {
      const res = await call('POST', '/ipm/bio-releases', user, body);
      expect(res.status).toBe(201);
      expect(ipmService.createBioRelease).toHaveBeenCalledWith(
        expect.objectContaining({ fieldId: FIELD, organizationId: ORG }),
        user.userId,
      );
    });
  }

  for (const user of others([PA])) {
    it(`${user.role} is 403`, async () => {
      expect((await call('POST', '/ipm/bio-releases', user, body)).status).toBe(403);
      expect(ipmService.createBioRelease).not.toHaveBeenCalled();
    });
  }

  it("a field from another organization is refused", async () => {
    const res = await call('POST', '/ipm/bio-releases', PA, { ...body, fieldId: OTHER_ORG_FIELD });
    expect(res.status).toBe(403);
    expect(ipmService.createBioRelease).not.toHaveBeenCalled();
  });

  it('a release without a field is a 400', async () => {
    const res = await call('POST', '/ipm/bio-releases', PA, { productId: 'p-1' });
    expect(res.status).toBe(400);
  });
});

// ─── 9. Manpower bulk-update (Excel hours corrections) ────────────

describe('POST /manpower/admin/records/bulk-update', () => {
  const A = '0aaaaaaa-0000-4000-8000-000000000001';
  const B = '0aaaaaaa-0000-4000-8000-000000000002';
  const info: Record<string, { created_by: string | null; approval_status: string; submission_id: string | null }> = {};

  beforeEach(() => {
    for (const k of Object.keys(info)) delete info[k];
    (manpowerService.getRecordsAccessInfo as jest.Mock).mockImplementation(async (ids: string[]) =>
      ids.filter((id) => info[id]).map((id) => ({ id, ...info[id] })));
    (manpowerService.bulkUpdateRecords as jest.Mock).mockImplementation(async (_org: string, recs: any[]) =>
      ({ updated: recs.map((r) => ({ id: r.id })), sentForApproval: [] }));
  });

  const send = (user: TestUser, ids: string[]) =>
    call('POST', '/manpower/admin/records/bulk-update', user, { records: ids.map((id) => ({ id, workHours: 8 })) });

  it("the worker corrects their own pending record", async () => {
    info[A] = { created_by: WK.userId, approval_status: 'pending', submission_id: 'sub-1' };
    const res = await send(WK, [A]);
    expect(res.status).toBe(200);
    expect(res.json.data.updated).toBe(1);
  });

  it('the worker corrects a record their own Excel import stored (approved, no submission)', async () => {
    info[A] = { created_by: WK.userId, approval_status: 'approved', submission_id: null };
    expect((await send(WK, [A])).status).toBe(200);
  });

  it('an approved typed day needs a change request', async () => {
    info[A] = { created_by: WK.userId, approval_status: 'approved', submission_id: 'sub-1' };
    expect((await send(WK, [A])).status).toBe(403);
    expect(manpowerService.bulkUpdateRecords).not.toHaveBeenCalled();
  });

  it("someone else's record is refused, and the whole batch with it", async () => {
    info[A] = { created_by: WK.userId, approval_status: 'pending', submission_id: null };
    info[B] = { created_by: 'other-worker', approval_status: 'pending', submission_id: null };
    const res = await send(WK, [A, B]);
    expect(res.status).toBe(403);
    expect(res.json.error.message).toMatch(/change request/);
    expect(manpowerService.bulkUpdateRecords).not.toHaveBeenCalled();
  });

  it('a record outside the organization (not found) is refused', async () => {
    expect((await send(WK, [A])).status).toBe(403);
  });

  for (const user of others([WK])) {
    it(`${user.role} cannot bulk-update`, async () => {
      info[A] = { created_by: user.userId, approval_status: 'pending', submission_id: null };
      expect((await send(user, [A])).status).toBe(403);
      expect(manpowerService.bulkUpdateRecords).not.toHaveBeenCalled();
    });
  }
});
