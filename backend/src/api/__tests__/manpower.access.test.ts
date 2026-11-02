/**
 * Manpower access rules, driven through the real routers on an ephemeral port
 * with fake auth and a mocked manpower service:
 * - worker and operator type days; the server always stores them pending,
 *   whatever the body says;
 * - only the worker imports from Excel (stored approved);
 * - only the operation manager approves / rejects and edits activity names;
 * - agronomist, CEO, farm manager and pest agronomist only read;
 * - team-leader submissions (worker token) are unchanged;
 * - tasks and shift schedule still let the agronomist operate.
 */
jest.mock('../../db/client', () => ({
  dbPool: { query: jest.fn(async () => ({ rows: [], rowCount: 0 })), connect: jest.fn() },
}));
jest.mock('../middleware/auth', () => ({
  auth: (req: any, _res: any, next: any) => {
    const raw = req.headers['x-test-user'];
    if (raw) req.user = JSON.parse(String(raw));
    next();
  },
  authorize: () => (_req: any, _res: any, next: any) => next(),
}));
jest.mock('../middleware/workerAuth', () => ({
  workerAuth: (req: any, res: any, next: any) => {
    const raw = req.headers['x-test-worker'];
    if (!raw) return res.status(401).json({ success: false, error: { message: 'Worker authentication required' } });
    req.worker = JSON.parse(String(raw));
    return next();
  },
  requireTeamLeader: (req: any, res: any, next: any) => {
    if (!req.worker?.isTeamLeader) {
      return res.status(403).json({ success: false, error: { message: 'Team leader access required' } });
    }
    return next();
  },
}));
jest.mock('../middleware/tenant', () => ({
  requireOrgId: () => 'org-1',
}));
jest.mock('../../utils/tenantValidation', () => ({
  assertSiteInOrganization: jest.fn(async () => undefined),
}));
jest.mock('../../services/fieldStaff.service', () => ({
  // Real rule (role-based), without the database.
  assertHarvestTeamLeaderCreate: jest.fn(async (role: string, isTeamLeader: boolean, linkedUserId?: string | null) => {
    const { canCreateHarvestTeamLeader } = jest.requireActual('../../utils/roleAccess');
    const { AppError } = jest.requireActual('../../utils/errors');
    if (isTeamLeader && (linkedUserId || !canCreateHarvestTeamLeader(role))) {
      throw new AppError('Only data entry workers and Operation Managers may create harvest/maintenance team leaders', 'FORBIDDEN', 403);
    }
  }),
  assertWorkerUpdateAllowed: jest.fn(async () => undefined),
}));
jest.mock('../../services/manpower.service', () => ({
  createManpowerSubmissionId: jest.fn(() => 'sub-1'),
  bulkCreateRecords: jest.fn(async (records: any[]) => records.map((_r, i) => ({ id: `rec-${i}` }))),
  bulkUpdateRecords: jest.fn(async (_org: string, records: any[]) => ({ updated: records.map((r) => ({ id: r.id })), sentForApproval: [] })),
  // Records stored by the worker's own Excel import (approved, no submission).
  getRecordsAccessInfo: jest.fn(async (ids: string[]) =>
    ids.map((id) => ({ id, created_by: 'worker-1', approval_status: 'approved', submission_id: null }))),
  notifyApproversForNewSubmission: jest.fn(async () => undefined),
  workerOrganizationId: jest.fn(async () => 'org-1'),
  getRecordById: jest.fn(),
  updateRecord: jest.fn(async (id: string) => ({ id })),
  deleteRecord: jest.fn(async () => undefined),
  approveManpowerSubmission: jest.fn(async () => ({ approved: 1 })),
  rejectManpowerSubmission: jest.fn(async () => ({ rejected: 1 })),
  approveManpowerWorkerInSubmission: jest.fn(async () => ({ approved: 1 })),
  rejectManpowerWorkerInSubmission: jest.fn(async () => ({ rejected: 1 })),
  countPendingManpowerApprovals: jest.fn(async () => 2),
  countPendingManpowerApprovalClashes: jest.fn(async () => 0),
  badgeCountForManpowerApprovals: jest.fn((_role: string, count: number) => count),
  listPendingApprovals: jest.fn(async () => []),
  ensureManpowerActivity: jest.fn(async (name: string) => ({ id: 'act-1', name })),
  applyActivityImportMappings: jest.fn(async () => ({ recordsUpdated: 0, created: [], aliasesSaved: 0 })),
  updateActivityPivotColumn: jest.fn(async (id: string, pivotColumn: string | null) => ({ id, pivot_column: pivotColumn })),
  listActivities: jest.fn(async () => [{ id: 'act-1', name: 'Weeding' }]),
  getFieldsWithVariety: jest.fn(async () => []),
  listActivityReferences: jest.fn(async () => []),
  findManpowerOverlaps: jest.fn(async () => []),
  listWorkers: jest.fn(async () => []),
  listRecords: jest.fn(async () => ({ data: [], total: 0 })),
  createWorker: jest.fn(async (input: any) => ({ id: 'worker-new', ...input })),
  bulkCreateWorkers: jest.fn(async () => ({ created: 1, skipped: 0, errors: [] })),
  updateWorker: jest.fn(async (id: string) => ({ id })),
  deactivateWorker: jest.fn(async () => undefined),
  setWorkerPin: jest.fn(async () => undefined),
  createVariety: jest.fn(async (name: string) => ({ id: 'var-1', name })),
  createActivityReference: jest.fn(),
  deleteActivityReference: jest.fn(),
}));
jest.mock('../../services/task.service', () => ({
  listTasks: jest.fn(async () => ({ tasks: [], total: 0 })),
  getTask: jest.fn(),
  createTask: jest.fn(async (input: any) => ({ id: 'task-1', ...input, assigned_to: null })),
  updateTask: jest.fn(),
  deleteTask: jest.fn(),
  getTaskComments: jest.fn(),
  addTaskComment: jest.fn(),
  getTaskChecklist: jest.fn(),
  addChecklistItem: jest.fn(),
  toggleChecklistItem: jest.fn(),
}));
jest.mock('../../services/shift.service', () => ({
  listShifts: jest.fn(async () => []),
  createShift: jest.fn(async (input: any) => ({ id: 'shift-1', ...input })),
  updateShift: jest.fn(),
  deleteShift: jest.fn(),
}));
jest.mock('../../websocket', () => ({ emitTaskUpdate: jest.fn() }));
jest.mock('../../services/push-notification.service', () => ({
  pushNotificationService: { sendToUser: jest.fn(async () => undefined) },
}));
jest.mock('../v1/health.routes', () => ({ incrementErrorCount: jest.fn() }));
jest.mock('../../utils/sentry', () => ({ captureException: jest.fn() }));
jest.mock('../../utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import * as manpowerService from '../../services/manpower.service';
import { manpowerRouter } from '../v1/manpower.routes';
import { tasksRouter } from '../v1/tasks.routes';
import { shiftsRouter } from '../v1/shifts.routes';
import { errorHandler } from '../middleware/errorHandler';

const svc = manpowerService as jest.Mocked<typeof manpowerService>;

const SITE = '11111111-1111-4111-8111-111111111111';
const RECORD = '22222222-2222-4222-8222-222222222222';
const WORKER_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = '44444444-4444-4444-8444-444444444444';

const user = (role: string, userId = `${role}-1`) => ({ userId, role, email: `${role}@example.com` });
const WORKER = user('worker');
const OPERATOR = user('operator');
const OM = user('operation_manager');
const AGRONOMIST = user('agronomist');
const CEO = user('ceo');
const FM = user('farm_manager');
const PEST = user('pest_agronomist');

const READ_ONLY_ROLES = [AGRONOMIST, CEO, FM, PEST];
const NOT_APPROVERS = [WORKER, OPERATOR, AGRONOMIST, CEO, FM, PEST];

const typedRow = {
  recordDate: '2026-09-28',
  workerId: WORKER_ID,
  activity: 'Weeding',
  location: 'GH 1',
  section: 'A',
  startTime: '07:00',
  endTime: '15:00',
  workHours: 8,
};

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/manpower', manpowerRouter);
  app.use('/tasks', tasksRouter);
  app.use('/shifts', shiftsRouter);
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
});

async function call(
  method: string,
  path: string,
  who: { user?: object; worker?: object },
  body?: unknown,
) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (who.user) headers['x-test-user'] = JSON.stringify(who.user);
  if (who.worker) headers['x-test-worker'] = JSON.stringify(who.worker);
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json()) as any;
  return { status: res.status, json };
}

const as = (u: object) => ({ user: u });

describe('typing a manpower day (Daily Activity Sheet)', () => {
  for (const submitter of [WORKER, OPERATOR]) {
    it(`${submitter.role}: stored pending even when the body says approved`, async () => {
      const res = await call('POST', '/manpower/admin/records/bulk', as(submitter), {
        approvalStatus: 'approved',
        records: [{ ...typedRow, approvalStatus: 'approved', organizationId: 'org-evil', createdBy: 'someone-else' }],
      });
      expect(res.status).toBe(200);
      expect(res.json.data).toMatchObject({ inserted: 1, submissionId: 'sub-1', approvalStatus: 'pending' });
      expect(svc.bulkCreateRecords).toHaveBeenCalledTimes(1);
      const [rows, options] = svc.bulkCreateRecords.mock.calls[0];
      expect(options).toEqual({ approvalStatus: 'pending', submissionId: 'sub-1' });
      expect(rows[0].createdBy).toBe(submitter.userId);
      expect(rows[0]).not.toHaveProperty('organizationId');
      expect(rows[0]).not.toHaveProperty('approvalStatus');
      expect(svc.notifyApproversForNewSubmission).toHaveBeenCalledWith('org-1', 'sub-1', rows);
    });

    it(`${submitter.role}: single add is pending too`, async () => {
      const res = await call('POST', '/manpower/records', as(submitter), { ...typedRow, approvalStatus: 'approved' });
      expect(res.status).toBe(201);
      expect(res.json.data.approval_status).toBe('pending');
      expect(svc.bulkCreateRecords.mock.calls[0][1]).toEqual({ approvalStatus: 'pending', submissionId: 'sub-1' });
    });
  }

  for (const blocked of [...READ_ONLY_ROLES, OM]) {
    it(`${blocked.role}: cannot type a day (403)`, async () => {
      const bulk = await call('POST', '/manpower/admin/records/bulk', as(blocked), { records: [typedRow] });
      expect(bulk.status).toBe(403);
      const single = await call('POST', '/manpower/records', as(blocked), typedRow);
      expect(single.status).toBe(403);
      expect(svc.bulkCreateRecords).not.toHaveBeenCalled();
    });
  }
});

describe('Excel import', () => {
  it('worker: stored approved', async () => {
    const res = await call('POST', '/manpower/admin/records/import', as(WORKER), {
      approvalStatus: 'pending',
      records: [typedRow, typedRow],
    });
    expect(res.status).toBe(200);
    expect(res.json.data).toMatchObject({ inserted: 2, approvalStatus: 'approved' });
    const [rows, options] = svc.bulkCreateRecords.mock.calls[0];
    expect(options).toEqual({ approvalStatus: 'approved', submissionId: null });
    expect(rows.every((r: any) => r.createdBy === WORKER.userId)).toBe(true);
    expect(svc.notifyApproversForNewSubmission).not.toHaveBeenCalled();
  });

  it('worker: hours corrections from the import are allowed', async () => {
    const res = await call('POST', '/manpower/admin/records/bulk-update', as(WORKER), {
      records: [{ id: RECORD, workHours: 6 }],
    });
    expect(res.status).toBe(200);
    expect(svc.bulkUpdateRecords).toHaveBeenCalledTimes(1);
  });

  for (const blocked of [OPERATOR, AGRONOMIST, OM, CEO, FM, PEST]) {
    it(`${blocked.role}: import is 403`, async () => {
      const res = await call('POST', '/manpower/admin/records/import', as(blocked), { records: [typedRow] });
      expect(res.status).toBe(403);
      const upd = await call('POST', '/manpower/admin/records/bulk-update', as(blocked), {
        records: [{ id: RECORD, workHours: 6 }],
      });
      expect(upd.status).toBe(403);
      expect(svc.bulkCreateRecords).not.toHaveBeenCalled();
      expect(svc.bulkUpdateRecords).not.toHaveBeenCalled();
    });
  }
});

describe('approve / reject', () => {
  const routes = [
    { path: '/manpower/approvals/submissions/sub-1/approve', fn: 'approveManpowerSubmission' },
    { path: '/manpower/approvals/submissions/sub-1/reject', fn: 'rejectManpowerSubmission' },
    { path: `/manpower/approvals/submissions/sub-1/workers/${WORKER_ID}/approve`, fn: 'approveManpowerWorkerInSubmission' },
    { path: `/manpower/approvals/submissions/sub-1/workers/${WORKER_ID}/reject`, fn: 'rejectManpowerWorkerInSubmission' },
  ] as const;

  for (const r of routes) {
    it(`operation manager can ${r.path.split('/').pop()} (${r.fn})`, async () => {
      const res = await call('POST', r.path, as(OM), { reason: 'check hours' });
      expect(res.status).toBe(200);
      expect(svc[r.fn]).toHaveBeenCalledTimes(1);
    });

    for (const blocked of NOT_APPROVERS) {
      it(`${blocked.role} cannot use ${r.fn} (403)`, async () => {
        const res = await call('POST', r.path, as(blocked), { reason: 'x' });
        expect(res.status).toBe(403);
        expect(svc[r.fn]).not.toHaveBeenCalled();
      });
    }
  }

  it('only the operation manager sees the pending queue', async () => {
    expect((await call('GET', '/manpower/approvals/pending-count', as(OM))).status).toBe(200);
    expect((await call('GET', '/manpower/approvals/pending', as(OM))).status).toBe(200);
    for (const blocked of NOT_APPROVERS) {
      expect((await call('GET', '/manpower/approvals/pending-count', as(blocked))).status).toBe(403);
      expect((await call('GET', '/manpower/approvals/pending', as(blocked))).status).toBe(403);
    }
  });
});

describe('activity names: worker and operation manager create / map; pivot column OM only', () => {
  for (const creator of [WORKER, OM]) {
    it(`${creator.role} can create an activity and save an import mapping`, async () => {
      expect((await call('POST', '/manpower/admin/activities', as(creator), { name: 'Pruning' })).status).toBe(201);
      expect((await call('POST', '/manpower/admin/activity-import-mappings', as(creator), {
        mappings: [
          { sourceName: 'prunning', action: 'connect', catalogName: 'Pruning' },
          { sourceName: 'Tying up', action: 'create', catalogName: 'Tying up' },
        ],
      })).status).toBe(200);
      expect(svc.ensureManpowerActivity).toHaveBeenCalledTimes(1);
      expect(svc.applyActivityImportMappings).toHaveBeenCalledTimes(1);
    });
  }

  for (const blocked of [OPERATOR, AGRONOMIST, CEO, FM, PEST]) {
    it(`${blocked.role} cannot create activities or save mappings (403)`, async () => {
      expect((await call('POST', '/manpower/admin/activities', as(blocked), { name: 'Pruning' })).status).toBe(403);
      expect((await call('POST', '/manpower/admin/activity-import-mappings', as(blocked), {
        mappings: [{ sourceName: 'prunning', action: 'create', catalogName: 'Prunning' }],
      })).status).toBe(403);
      expect(svc.ensureManpowerActivity).not.toHaveBeenCalled();
      expect(svc.applyActivityImportMappings).not.toHaveBeenCalled();
    });
  }

  it('only the operation manager sets the pivot column', async () => {
    expect((await call('PUT', `/manpower/admin/activities/${RECORD}/pivot-column`, as(OM), { pivotColumn: null })).status).toBe(200);
    for (const blocked of [WORKER, OPERATOR, AGRONOMIST, CEO, FM, PEST]) {
      expect((await call('PUT', `/manpower/admin/activities/${RECORD}/pivot-column`, as(blocked), { pivotColumn: null })).status).toBe(403);
    }
    expect(svc.updateActivityPivotColumn).toHaveBeenCalledTimes(1);
  });

  it('only the operation manager edits the activity reference', async () => {
    const body = { siteId: SITE, activity: 'Pruning', target: 10 };
    for (const blocked of [WORKER, OPERATOR, AGRONOMIST, CEO, FM, PEST]) {
      expect((await call('POST', '/manpower/activity-references', as(blocked), body)).status).toBe(403);
      expect((await call('DELETE', `/manpower/activity-references/${RECORD}`, as(blocked))).status).toBe(403);
    }
  });
});

describe('workers list (roster) and varieties: worker and operation manager only', () => {
  const rosterCalls = [
    { name: 'create', method: 'POST', path: '/manpower/workers', body: { employeeId: 'E9', name: 'New Person' }, ok: 201, fn: 'createWorker' },
    { name: 'bulk create', method: 'POST', path: '/manpower/workers/bulk', body: { workers: [{ employeeId: 'E9', name: 'New Person' }] }, ok: 200, fn: 'bulkCreateWorkers' },
    { name: 'update', method: 'PUT', path: `/manpower/workers/${WORKER_ID}`, body: { name: 'Renamed' }, ok: 200, fn: 'updateWorker' },
    { name: 'set PIN', method: 'PUT', path: `/manpower/workers/${WORKER_ID}/pin`, body: { pin: '1234' }, ok: 200, fn: 'setWorkerPin' },
    { name: 'deactivate', method: 'DELETE', path: `/manpower/workers/${WORKER_ID}`, ok: 200, fn: 'deactivateWorker' },
    { name: 'add variety', method: 'POST', path: '/manpower/admin/varieties', body: { name: 'Cherry' }, ok: 200, fn: 'createVariety' },
  ] as const;

  for (const manager of [WORKER, OM]) {
    for (const r of rosterCalls) {
      it(`${manager.role}: ${r.name}`, async () => {
        const res = await call(r.method, r.path, as(manager), 'body' in r ? r.body : undefined);
        expect(res.status).toBe(r.ok);
        expect(svc[r.fn]).toHaveBeenCalledTimes(1);
      });
    }
  }

  for (const blocked of [AGRONOMIST, CEO, FM, PEST, OPERATOR]) {
    it(`${blocked.role} cannot change the workers list or varieties (403)`, async () => {
      for (const r of rosterCalls) {
        const res = await call(r.method, r.path, as(blocked), 'body' in r ? r.body : undefined);
        expect({ call: r.name, status: res.status }).toEqual({ call: r.name, status: 403 });
        expect(svc[r.fn]).not.toHaveBeenCalled();
      }
    });
  }

  it('worker and operation manager create a worker marked as team leader; others get 403', async () => {
    const tl = { employeeId: 'E9', name: 'TL', isTeamLeader: true };
    for (const manager of [WORKER, OM]) {
      const res = await call('POST', '/manpower/workers', as(manager), tl);
      expect(res.status).toBe(201);
      expect(res.json.data.isTeamLeader).toBe(true);
    }
    expect(svc.createWorker).toHaveBeenCalledTimes(2);
    for (const blocked of [AGRONOMIST, CEO, FM, PEST, OPERATOR]) {
      expect((await call('POST', '/manpower/workers', as(blocked), tl)).status).toBe(403);
    }
    expect(svc.createWorker).toHaveBeenCalledTimes(2);
  });
});

describe('editing and deleting a typed record', () => {
  const record = (status: string, createdBy: string | null) => ({
    id: RECORD,
    approval_status: status,
    created_by: createdBy,
  });

  it('a submitter edits and deletes their own pending record', async () => {
    for (const submitter of [WORKER, OPERATOR]) {
      svc.getRecordById.mockResolvedValue(record('pending', submitter.userId));
      expect((await call('PUT', `/manpower/records/${RECORD}`, as(submitter), { workHours: 7 })).status).toBe(200);
      expect((await call('DELETE', `/manpower/records/${RECORD}`, as(submitter))).status).toBe(200);
    }
  });

  it("a submitter cannot touch someone else's record or an approved one", async () => {
    svc.getRecordById.mockResolvedValue(record('pending', USER_ID));
    expect((await call('PUT', `/manpower/records/${RECORD}`, as(WORKER), { workHours: 7 })).status).toBe(403);
    expect((await call('DELETE', `/manpower/records/${RECORD}`, as(OPERATOR))).status).toBe(403);
    svc.getRecordById.mockResolvedValue(record('approved', WORKER.userId));
    expect((await call('PUT', `/manpower/records/${RECORD}`, as(WORKER), { workHours: 7 })).status).toBe(403);
    expect((await call('DELETE', `/manpower/records/${RECORD}`, as(WORKER))).status).toBe(403);
    expect(svc.updateRecord).not.toHaveBeenCalled();
    expect(svc.deleteRecord).not.toHaveBeenCalled();
  });

  it('the operation manager may edit or delete any record', async () => {
    svc.getRecordById.mockResolvedValue(record('approved', USER_ID));
    expect((await call('PUT', `/manpower/records/${RECORD}`, as(OM), { workHours: 7 })).status).toBe(200);
    expect((await call('DELETE', `/manpower/records/${RECORD}`, as(OM))).status).toBe(200);
  });

  for (const blocked of READ_ONLY_ROLES) {
    it(`${blocked.role} cannot edit or delete (403)`, async () => {
      svc.getRecordById.mockResolvedValue(record('pending', blocked.userId));
      expect((await call('PUT', `/manpower/records/${RECORD}`, as(blocked), { workHours: 7 })).status).toBe(403);
      expect((await call('DELETE', `/manpower/records/${RECORD}`, as(blocked))).status).toBe(403);
      expect(svc.updateRecord).not.toHaveBeenCalled();
      expect(svc.deleteRecord).not.toHaveBeenCalled();
    });
  }
});

describe('reading', () => {
  for (const reader of [OPERATOR, PEST, AGRONOMIST, CEO, FM]) {
    it(`${reader.role} can load what the sheet and record page read`, async () => {
      const paths = [
        `/manpower/admin/activities?site_id=${SITE}`,
        `/manpower/admin/fields-with-variety?site_id=${SITE}`,
        `/manpower/activity-references?site_id=${SITE}`,
        `/manpower/workers?site_id=${SITE}&active_only=true`,
        `/manpower/admin/records/overlaps?date=2026-09-28&worker_ids=${WORKER_ID}`,
        '/manpower/records',
      ];
      for (const p of paths) {
        const res = await call('GET', p, as(reader));
        expect({ path: p, status: res.status }).toEqual({ path: p, status: 200 });
      }
    });
  }
});

describe('team leader submissions (worker token) are unchanged', () => {
  it('a team leader submits a pending day', async () => {
    const res = await call('POST', '/manpower/records/bulk', {
      worker: { workerId: WORKER_ID, employeeId: 'E1', name: 'TL', isTeamLeader: true, siteId: SITE },
    }, { records: [typedRow] });
    expect(res.status).toBe(200);
    const [rows, options] = svc.bulkCreateRecords.mock.calls[0];
    expect(options).toEqual({ approvalStatus: 'pending', submissionId: 'sub-1' });
    expect(rows[0].submittedBy).toBe(WORKER_ID);
  });

  it('a worker token without team leader is refused', async () => {
    const res = await call('POST', '/manpower/records/bulk', {
      worker: { workerId: WORKER_ID, employeeId: 'E1', name: 'W', isTeamLeader: false, siteId: SITE },
    }, { records: [typedRow] });
    expect(res.status).toBe(403);
    expect(svc.bulkCreateRecords).not.toHaveBeenCalled();
  });
});

describe('tasks and shift schedule still let worker and agronomist operate', () => {
  for (const operatorOfWorkforce of [WORKER, AGRONOMIST]) {
    it(`${operatorOfWorkforce.role} can create a task and a shift`, async () => {
      const task = await call('POST', '/tasks', as(operatorOfWorkforce), { title: 'Check drippers' });
      expect(task.status).toBe(201);
      const shift = await call('POST', '/shifts', as(operatorOfWorkforce), {
        user_id: USER_ID,
        shift_date: '2026-09-29',
        start_time: '07:00',
        end_time: '15:00',
      });
      expect(shift.status).toBe(201);
    });
  }

  it('operator still cannot create tasks or shifts', async () => {
    expect((await call('POST', '/tasks', as(OPERATOR), { title: 'x' })).status).toBe(403);
    expect((await call('POST', '/shifts', as(OPERATOR), {
      user_id: USER_ID, shift_date: '2026-09-29', start_time: '07:00', end_time: '15:00',
    })).status).toBe(403);
  });
});
