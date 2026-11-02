/**
 * Bumble bees: scouter proposes, pest agronomist approves.
 *
 * Exercised through the real IPM router, change-request service and error handler on
 * an ephemeral port. The database is a small in-memory fake that answers by SQL shape
 * and honours BEGIN / COMMIT / ROLLBACK (state is restored on rollback), so "nothing
 * applied" and "stays pending" are checked against real state, not mocks.
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
  authorize: () => (_req: any, _res: any, next: any) => next(),
  requireManager: (_req: any, _res: any, next: any) => next(),
}));
jest.mock('../middleware/tenant', () => ({
  requireOrgId: (req: any) => req.user?.organizationId || 'org-1',
}));
jest.mock('../../utils/tenantValidation', () => {
  const { AppError } = jest.requireActual('../../utils/errors');
  return {
    assertFieldInOrganization: jest.fn(async (fieldId: string, orgId: string) => {
      const owner: Record<string, string> = {
        'f0000000-0000-4000-8000-00000000000a': 'org-1',
        'f0000000-0000-4000-8000-00000000000b': 'org-2',
      };
      if (owner[fieldId] !== orgId) throw new AppError('Field not found in organization', 'FORBIDDEN', 403);
    }),
    assertSiteInOrganization: jest.fn(async (siteId: string, orgId: string) => {
      const owner: Record<string, string> = {
        '50000000-0000-4000-8000-00000000000a': 'org-1',
        '50000000-0000-4000-8000-00000000000b': 'org-2',
      };
      if (owner[siteId] !== orgId) throw new AppError('Site not found in organization', 'FORBIDDEN', 403);
    }),
  };
});
jest.mock('../../websocket', () => ({ emitDataChange: jest.fn(), emitAlert: jest.fn() }));
jest.mock('../v1/workOrder.routes', () => ({ workOrderRouter: jest.requireActual('express').Router() }));
jest.mock('../v1/pppMsds.routes', () => ({ pppMsdsRouter: jest.requireActual('express').Router() }));
jest.mock('../../services/seasons.service', () => ({
  countPendingSeasonReopenRequests: jest.fn(async () => 0),
  assertFieldDateWritable: jest.fn(async () => undefined),
}));
jest.mock('../../services/inventory.service', () => ({ deductByName: jest.fn() }));
jest.mock('../../services/phiAuditLog.service', () => ({ checkAndNotifyFieldHarvestConflicts: jest.fn() }));
jest.mock('../../services/scouting.service', () => ({ getPestCatalog: jest.fn(async () => []) }));
jest.mock('../../services/push-notification.service', () => ({ pushNotificationService: { sendToUser: jest.fn() } }));
jest.mock('../../services/manpower.service', () => ({}));
jest.mock('../../services/bioRecord.service', () => ({}));
jest.mock('../../services/auditLog.service', () => ({
  logAuditEvent: jest.fn(async () => undefined),
}));
jest.mock('../../services/userNotify.service', () => ({
  notifyUser: jest.fn(async () => undefined),
  notifyUsersByRoles: jest.fn(async () => undefined),
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
import { notifyUser, notifyUsersByRoles } from '../../services/userNotify.service';
import { ipmRouter } from '../v1/ipm.routes';
import { errorHandler } from '../middleware/errorHandler';

const FIELD_A = 'f0000000-0000-4000-8000-00000000000a';
const FIELD_B = 'f0000000-0000-4000-8000-00000000000b'; // org-2
const SITE_A = '50000000-0000-4000-8000-00000000000a';
const SITE_B = '50000000-0000-4000-8000-00000000000b'; // org-2
const DEP_A = 'd0000000-0000-4000-8000-00000000000a';
const DEP_B = 'd0000000-0000-4000-8000-00000000000b'; // org-2
const ORDER_A = '0a000000-0000-4000-8000-00000000000a';
const ORDER_B = '0a000000-0000-4000-8000-00000000000b'; // org-2
const INSP_A = '1a000000-0000-4000-8000-00000000000a';
const INSP_B = '1a000000-0000-4000-8000-00000000000b'; // org-2

const u = (role: string, extra: object = {}) => ({
  userId: `${role}-1`, role, email: `${role}@example.com`, organizationId: 'org-1', ...extra,
});
const PEST_AGRONOMIST = u('pest_agronomist');
const IPM_ADMIN = u('ceo', { userId: 'admin-1', email: 'abdullah@elite.com' });
const SCOUTER = u('scouter');
const WATCHERS = ['agronomist', 'operator', 'operation_manager', 'farm_manager', 'ceo', 'worker', 'auditor']
  .map((role) => u(role));

type State = {
  fields: Record<string, { id: string; name: string; organization_id: string; site_id: string }>;
  sites: Record<string, { id: string; name: string; organization_id: string }>;
  deployments: any[];
  inventory: Record<string, { site_id: string; organization_id: string; quantity_on_hand: number }>;
  adjustments: any[];
  orders: any[];
  inspections: any[];
  requests: any[];
};

let state: State;
let seq = 0;
const nextId = (prefix: string) => `${prefix.padEnd(8, '0')}-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

function resetState() {
  seq = 100;
  state = {
    fields: {
      [FIELD_A]: { id: FIELD_A, name: 'NH 1', organization_id: 'org-1', site_id: SITE_A },
      [FIELD_B]: { id: FIELD_B, name: 'Other', organization_id: 'org-2', site_id: SITE_B },
    },
    sites: {
      [SITE_A]: { id: SITE_A, name: 'Main', organization_id: 'org-1' },
      [SITE_B]: { id: SITE_B, name: 'Far', organization_id: 'org-2' },
    },
    deployments: [
      {
        id: DEP_A, field_id: FIELD_A, organization_id: 'org-1', date_placed: '2026-09-01', created_at: 1,
        box_count: 10, box_count_total: 10, boxes_before: 0, boxes_removed: 0, boxes_added: 10, notes: null,
      },
      {
        id: DEP_B, field_id: FIELD_B, organization_id: 'org-2', date_placed: '2026-09-01', created_at: 1,
        box_count: 4, box_count_total: 4, boxes_before: 0, boxes_removed: 0, boxes_added: 4, notes: null,
      },
    ],
    inventory: {
      [SITE_A]: { site_id: SITE_A, organization_id: 'org-1', quantity_on_hand: 20 },
      [SITE_B]: { site_id: SITE_B, organization_id: 'org-2', quantity_on_hand: 5 },
    },
    adjustments: [],
    orders: [
      {
        id: ORDER_A, site_id: SITE_A, organization_id: 'org-1', quantity_expected: 12,
        expected_delivery_date: '2026-10-05', order_date: '2026-09-20', status: 'pending', notes: null,
      },
      {
        id: ORDER_B, site_id: SITE_B, organization_id: 'org-2', quantity_expected: 3,
        expected_delivery_date: '2026-10-05', order_date: '2026-09-20', status: 'pending', notes: null,
      },
    ],
    inspections: [
      {
        id: INSP_A, field_id: FIELD_A, organization_id: 'org-1', inspection_date: '2026-09-28',
        boxes_100: 6, boxes_80: 4, boxes_60: 0, boxes_40: 0, boxes_20: 0, boxes_0: 0, total_boxes: 10,
        notes: null, created_by: SCOUTER.userId, created_at: new Date().toISOString(), // saved seconds ago
      },
      {
        id: INSP_B, field_id: FIELD_B, organization_id: 'org-2', inspection_date: '2026-09-28',
        boxes_100: 4, boxes_80: 0, boxes_60: 0, boxes_40: 0, boxes_20: 0, boxes_0: 0, total_boxes: 4,
        notes: null, created_by: 'scouter-2', created_at: new Date().toISOString(),
      },
    ],
    requests: [],
  };
}

const ok = (rows: any[] = []) => ({ rows, rowCount: rows.length });

/** "SET a = $1, b = $2" → { a: params[0], b: params[1] } (literal values ignored). */
function parseSets(text: string, params: any[]) {
  const setPart = text.slice(text.indexOf(' SET ') + 5, text.indexOf(' WHERE '));
  const out: Record<string, any> = {};
  for (const m of setPart.matchAll(/(\w+) = \$(\d+)/g)) out[m[1]] = params[Number(m[2]) - 1];
  return out;
}

let snapshot: State | null = null;
const calls: Array<{ via: 'pool' | 'client'; sql: string }> = [];

async function fakeQuery(sql: string, params: any[] = []): Promise<any> {
  const text = sql.replace(/\s+/g, ' ').trim();
  if (text === 'BEGIN') { snapshot = structuredClone(state); return ok(); }
  if (text === 'COMMIT') { snapshot = null; return ok(); }
  if (text === 'ROLLBACK') { if (snapshot) state = snapshot; snapshot = null; return ok(); }

  // ── fields / sites
  if (text.startsWith('SELECT fa.site_id, f.organization_id, f.name AS field_name FROM fields f')) {
    const f = state.fields[params[0]];
    return ok(f ? [{ site_id: f.site_id, organization_id: f.organization_id, field_name: f.name }] : []);
  }
  if (text.startsWith('SELECT f.id, f.name, fa.site_id FROM fields f')) {
    const f = state.fields[params[0]];
    return ok(f && f.organization_id === params[1] ? [{ id: f.id, name: f.name, site_id: f.site_id }] : []);
  }
  if (text.startsWith('SELECT name FROM fields WHERE id = $1')) {
    const f = state.fields[params[0]];
    return ok(f ? [{ name: f.name }] : []);
  }
  if (text.startsWith('SELECT id, name FROM sites WHERE id = $1 AND organization_id = $2')) {
    const s = state.sites[params[0]];
    return ok(s && s.organization_id === params[1] ? [{ id: s.id, name: s.name }] : []);
  }

  // ── deployments
  if (text.startsWith('SELECT bb.* FROM bumble_bee_deployments bb WHERE bb.field_id = $1')) {
    const rows = state.deployments
      .filter((d) => d.field_id === params[0])
      .sort((a, b) => (a.date_placed === b.date_placed ? b.created_at - a.created_at : a.date_placed < b.date_placed ? 1 : -1));
    return ok(rows.slice(0, 1).map((d) => ({ ...d })));
  }
  if (text.startsWith('SELECT bb.*, f.name AS field_name, fa.site_id FROM bumble_bee_deployments bb')) {
    const d = state.deployments.find((x) => x.id === params[0] && x.organization_id === params[1]);
    return ok(d ? [{ ...d, field_name: state.fields[d.field_id]?.name, site_id: state.fields[d.field_id]?.site_id }] : []);
  }
  if (text.startsWith('INSERT INTO bumble_bee_deployments')) {
    const [fieldId, datePlaced, boxCount, before, removed, added, total, notes, orgId, createdBy] = params;
    const row = {
      id: nextId('d'), field_id: fieldId, date_placed: datePlaced, box_count: boxCount, boxes_before: before,
      boxes_removed: removed, boxes_added: added, box_count_total: total, notes, organization_id: orgId,
      created_by: createdBy, created_at: ++seq,
    };
    state.deployments.push(row);
    return ok([{ ...row }]);
  }
  if (text.startsWith('UPDATE bumble_bee_deployments SET')) {
    const id = params[params.length - 1];
    const d = state.deployments.find((x) => x.id === id);
    if (d) Object.assign(d, parseSets(text, params));
    return ok(d ? [{ ...d }] : []);
  }

  // ── inventory
  if (text.startsWith('SELECT * FROM bumble_bee_site_inventory WHERE site_id = $1')) {
    const inv = state.inventory[params[0]];
    return ok(inv ? [{ ...inv }] : []);
  }
  if (text.startsWith('INSERT INTO bumble_bee_site_inventory')) {
    if (state.inventory[params[0]]) return ok();
    state.inventory[params[0]] = { site_id: params[0], organization_id: params[1], quantity_on_hand: 0 };
    return ok([{ ...state.inventory[params[0]] }]);
  }
  if (text.startsWith('SELECT quantity_on_hand FROM bumble_bee_site_inventory WHERE site_id = $1')) {
    const inv = state.inventory[params[0]];
    return ok(inv ? [{ quantity_on_hand: inv.quantity_on_hand }] : []);
  }
  if (text.startsWith('UPDATE bumble_bee_site_inventory SET quantity_on_hand = quantity_on_hand - $1')) {
    const inv = state.inventory[params[2]];
    inv.quantity_on_hand -= Number(params[0]);
    return ok([{ quantity_on_hand: inv.quantity_on_hand }]);
  }
  if (text.startsWith('UPDATE bumble_bee_site_inventory SET quantity_on_hand = quantity_on_hand + $1')) {
    const inv = state.inventory[params[2]];
    inv.quantity_on_hand += Number(params[0]);
    return ok([{ quantity_on_hand: inv.quantity_on_hand }]);
  }
  if (text.startsWith('UPDATE bumble_bee_site_inventory SET quantity_on_hand = $1')) {
    const inv = state.inventory[params[2]];
    inv.quantity_on_hand = Number(params[0]);
    return ok([{ ...inv }]);
  }
  if (text.startsWith('INSERT INTO bumble_bee_inventory_adjustments')) {
    if (text.includes("'manual_set'")) {
      const [siteId, orgId, delta, after, by] = params;
      state.adjustments.push({ site_id: siteId, organization_id: orgId, delta, reason: 'manual_set', quantity_after: after, created_by: by });
    } else {
      const reason = text.includes("'deploy'") ? 'deploy' : 'order_received';
      const [siteId, orgId, delta, ref, after, by] = params;
      state.adjustments.push({ site_id: siteId, organization_id: orgId, delta, reason, reference_id: ref, quantity_after: after, created_by: by });
    }
    return ok();
  }

  // ── orders
  if (text.startsWith('SELECT * FROM bumble_bee_incoming_orders WHERE id = $1 AND organization_id = $2')) {
    const o = state.orders.find((x) => x.id === params[0] && x.organization_id === params[1]);
    return ok(o ? [{ ...o }] : []);
  }
  if (text.startsWith('INSERT INTO bumble_bee_incoming_orders')) {
    const [siteId, orgId, qty, expected, orderDate, notes, by] = params;
    if (!expected) {
      throw Object.assign(new Error('null value in column "expected_delivery_date"'), { code: '23502' });
    }
    const row = {
      id: nextId('0b'), site_id: siteId, organization_id: orgId, quantity_expected: qty,
      expected_delivery_date: expected, order_date: orderDate, notes, created_by: by, status: 'pending',
    };
    state.orders.push(row);
    return ok([{ ...row }]);
  }
  if (text.startsWith("UPDATE bumble_bee_incoming_orders SET status = 'received'")) {
    const o = state.orders.find((x) => x.id === params[0]);
    Object.assign(o, {
      status: 'received', received_at: params[1], quantity_received: params[2],
      quantity_on_hand_before: params[3], quantity_on_hand_after: params[4],
    });
    return ok();
  }
  if (text.startsWith('UPDATE bumble_bee_incoming_orders SET')) {
    const idIdx = Number(/WHERE id = \$(\d+)/.exec(text)![1]) - 1;
    const o = state.orders.find((x) => x.id === params[idIdx]);
    if (!o || (text.includes("status = 'pending'") && o.status !== 'pending')) return ok();
    Object.assign(o, parseSets(text, params));
    return ok([{ ...o }]);
  }

  // ── inspections
  if (text.startsWith('SELECT * FROM bumble_bee_box_inspections WHERE id = $1')) {
    const i = state.inspections.find((x) => x.id === params[0] && (params.length < 2 || x.organization_id === params[1]));
    return ok(i ? [{ ...i }] : []);
  }
  if (text.startsWith('UPDATE bumble_bee_box_inspections')) {
    const i = state.inspections.find((x) => x.id === params[9]);
    Object.assign(i, {
      inspection_date: params[0], boxes_100: params[1], boxes_80: params[2], boxes_60: params[3],
      boxes_40: params[4], boxes_20: params[5], boxes_0: params[6], total_boxes: params[7], notes: params[8],
    });
    return ok([{ ...i }]);
  }
  if (text.startsWith('DELETE FROM bumble_bee_box_inspections WHERE id = $1')) {
    const before = state.inspections.length;
    state.inspections = state.inspections.filter((x) => x.id !== params[0]);
    return ok(before === state.inspections.length ? [] : [{ id: params[0] }]);
  }

  // ── change requests
  if (text.startsWith('INSERT INTO ipm_change_requests')) {
    const [entityType, entityId, action, by, reason, payload, snap, orgId] = params;
    const row = {
      id: nextId('c'), entity_type: entityType, entity_id: entityId, action, requested_by: by, reason,
      proposed_payload: payload ? JSON.parse(payload) : null, snapshot_before: JSON.parse(snap),
      organization_id: orgId, status: 'pending', reviewed_by: null, reviewer_comment: null,
      created_at: new Date().toISOString(),
    };
    state.requests.push(row);
    return ok([{ ...row }]);
  }
  if (text.startsWith('SELECT id FROM ipm_change_requests WHERE entity_type = $1 AND status = \'pending\' AND ( entity_id = ANY')) {
    const ids = params[1] as string[];
    return ok(state.requests.filter((r) => r.entity_type === params[0] && r.status === 'pending' && ids.includes(r.entity_id)));
  }
  if (text.startsWith('SELECT id FROM ipm_change_requests WHERE entity_type = $1 AND status = \'pending\' AND organization_id = $2 AND entity_id IS NULL')) {
    const key = /proposed_payload->>'(\w+)'/.exec(text)![1];
    return ok(state.requests.filter((r) => r.entity_type === params[0] && r.status === 'pending'
      && r.organization_id === params[1] && r.entity_id == null && r.proposed_payload?.[key] === params[2]));
  }
  if (text.startsWith('SELECT id FROM ipm_change_requests WHERE id = $1 AND organization_id = $2 AND requested_by = $3')) {
    return ok(state.requests.filter((r) => r.id === params[0] && r.organization_id === params[1]
      && r.requested_by === params[2] && r.entity_type === params[3] && r.status === 'rejected'));
  }
  if (text.startsWith('SELECT * FROM ipm_change_requests WHERE id = $1 AND organization_id = $2 FOR UPDATE')) {
    const r = state.requests.find((x) => x.id === params[0] && x.organization_id === params[1]);
    return ok(r ? [{ ...r }] : []);
  }
  if (text.startsWith('UPDATE ipm_change_requests SET status = $1')) {
    const r = state.requests.find((x) => x.id === params[3]);
    Object.assign(r, { status: params[0], reviewed_by: params[1], reviewer_comment: params[2] });
    return ok([{ ...r }]);
  }
  if (text.startsWith('SELECT cr.*, ru.name AS requested_by_name, ru.email AS requested_by_email FROM ipm_change_requests cr')) {
    // getPendingRequestForEntity
    return ok(state.requests.filter((r) => r.entity_type === params[0] && r.entity_id === params[1]
      && r.status === 'pending' && r.organization_id === params[2]));
  }
  if (text.startsWith('SELECT cr.*, ru.name AS requested_by_name, ru.email AS requested_by_email, rv.name AS reviewed_by_name')) {
    // listBumbleBeeProposals (site filtering left to SQL; the fake has one site per org)
    return ok(state.requests.filter((r) => r.organization_id === params[0]
      && (r.status === 'pending' || (r.status === 'rejected' && r.requested_by === params[2]))));
  }

  return ok();
}

const poolQuery = jest.fn(async (sql: string, params?: any[]) => {
  calls.push({ via: 'pool', sql: sql.replace(/\s+/g, ' ').trim() });
  return fakeQuery(sql, params);
});
const clientQuery = jest.fn(async (sql: string, params?: any[]) => {
  calls.push({ via: 'client', sql: sql.replace(/\s+/g, ' ').trim() });
  return fakeQuery(sql, params);
});

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/ipm', ipmRouter);
  app.use(errorHandler);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/ipm`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  resetState();
  snapshot = null;
  calls.length = 0;
  (notifyUser as jest.Mock).mockClear();
  (notifyUsersByRoles as jest.Mock).mockClear();
  (dbPool.query as jest.Mock).mockImplementation(poolQuery);
  (dbPool.connect as jest.Mock).mockImplementation(async () => ({ query: clientQuery, release: jest.fn() }));
});

async function call(method: string, path: string, user: object, body?: unknown) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-test-user': JSON.stringify(user) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json()) as any;
  return { status: res.status, json };
}

/** Writes to live bumble-bee tables (change requests excluded). */
function liveWrites() {
  return calls
    .map((c) => c.sql)
    .filter((sql) => /^(UPDATE|INSERT|DELETE)/.test(sql) && sql.includes('bumble_bee_'));
}

const onHand = (siteId = SITE_A) => state.inventory[siteId].quantity_on_hand;

// Every bumble-bee write the page makes, with a body that is valid for org-1.
const WRITES: Array<{ name: string; method: string; path: string; body?: object; liveStatus: number }> = [
  {
    name: 'deployment create', method: 'POST', path: '/bumble-bees', liveStatus: 201,
    body: { fieldId: FIELD_A, datePlaced: '2026-09-29', boxesBefore: 10, boxesRemoved: 2, boxesAdded: 5 },
  },
  { name: 'deployment edit', method: 'PUT', path: `/bumble-bees/${DEP_A}`, liveStatus: 200, body: { notes: 'moved' } },
  { name: 'boxes on hand', method: 'PUT', path: '/bumble-bees/inventory', liveStatus: 200, body: { siteId: SITE_A, quantityOnHand: 15 } },
  {
    name: 'order create', method: 'POST', path: '/bumble-bees/incoming-orders', liveStatus: 201,
    body: { siteId: SITE_A, quantityExpected: 8, orderDate: '2026-09-29', expectedDeliveryDate: '2026-10-10' },
  },
  { name: 'order edit', method: 'PUT', path: `/bumble-bees/incoming-orders/${ORDER_A}`, liveStatus: 200, body: { quantityExpected: 14 } },
  { name: 'order cancel', method: 'PUT', path: `/bumble-bees/incoming-orders/${ORDER_A}`, liveStatus: 200, body: { status: 'cancelled' } },
  {
    name: 'order receive', method: 'POST', path: `/bumble-bees/incoming-orders/${ORDER_A}/receive`, liveStatus: 200,
    body: { receivedDate: '2026-09-29', quantityReceived: 12 },
  },
  {
    name: 'inspection edit', method: 'PUT', path: `/bumble-bees/inspections/${INSP_A}`, liveStatus: 200,
    body: { inspectionDate: '2026-09-28', boxes100: 5, boxes80: 5, notes: 'recount' },
  },
  { name: 'inspection delete', method: 'DELETE', path: `/bumble-bees/inspections/${INSP_A}`, liveStatus: 200 },
];

describe('role matrix', () => {
  for (const w of WRITES) {
    it(`${w.name}: pest agronomist and IPM admin write live`, async () => {
      for (const user of [PEST_AGRONOMIST, IPM_ADMIN]) {
        resetState();
        const res = await call(w.method, w.path, user, w.body);
        expect(res.status).toBe(w.liveStatus);
        expect(res.json.pendingApproval).toBeUndefined();
        expect(state.requests).toHaveLength(0);
      }
    });

    it(`${w.name}: scouter gets 202 and only a change request is written`, async () => {
      const before = structuredClone(state);
      calls.length = 0;
      const res = await call(w.method, w.path, SCOUTER, w.body);
      expect(res.status).toBe(202);
      expect(res.json.pendingApproval).toBe(true);
      expect(res.json.data.changeRequest.status).toBe('pending');
      expect(state.requests).toHaveLength(1);
      expect(liveWrites()).toEqual([]);
      expect({ ...state, requests: [] }).toEqual({ ...before, requests: [] });
    });

    it(`${w.name}: everyone else gets 403 and nothing is written`, async () => {
      for (const user of WATCHERS) {
        calls.length = 0;
        const res = await call(w.method, w.path, user, w.body);
        expect({ role: user.role, status: res.status }).toEqual({ role: user.role, status: 403 });
        expect(liveWrites()).toEqual([]);
        expect(state.requests).toHaveLength(0);
      }
    });
  }

  it('filing a new inspection stays a direct save for the scouter only', async () => {
    const body = { fieldId: FIELD_A, inspectionDate: '2026-09-29', boxes100: 10 };
    expect((await call('POST', '/bumble-bees/inspections', PEST_AGRONOMIST, body)).status).toBe(403);
    const res = await call('POST', '/bumble-bees/inspections', SCOUTER, body);
    expect(res.status).toBe(201);
    expect(state.requests).toHaveLength(0);
  });
});

describe('scouter proposal → approval', () => {
  async function propose(path: string, body: object, method = 'POST') {
    const res = await call(method, path, SCOUTER, body);
    expect(res.status).toBe(202);
    return res.json.data.changeRequest;
  }

  it('deployment: nothing moves until approval, then deployment + stock + ledger inside the review transaction', async () => {
    const cr = await propose('/bumble-bees', { fieldId: FIELD_A, datePlaced: '2026-09-29', boxesRemoved: 2, boxesAdded: 5 });
    expect(cr.entityId).toBeNull();
    expect(cr.action).toBe('create');
    expect(cr.proposedPayload).toMatchObject({ fieldId: FIELD_A, siteId: SITE_A, boxesBefore: 10, boxesAdded: 5 });
    expect(state.deployments).toHaveLength(2);
    expect(onHand()).toBe(20);
    expect(notifyUsersByRoles).toHaveBeenCalledWith(
      ['pest_agronomist'],
      expect.objectContaining({ organizationId: 'org-1', path: '/audit/change-requests' }),
    );

    calls.length = 0;
    const res = await call('POST', `/change-requests/${cr.id}/approve`, PEST_AGRONOMIST, {});
    expect(res.status).toBe(200);
    expect(res.json.data.status).toBe('approved');

    const created = state.deployments.find((d) => d.date_placed === '2026-09-29');
    expect(created).toMatchObject({ boxes_before: 10, boxes_removed: 2, boxes_added: 5, box_count_total: 13, created_by: SCOUTER.userId });
    expect(onHand()).toBe(15);
    expect(state.adjustments).toEqual([expect.objectContaining({ reason: 'deploy', delta: -5, quantity_after: 15, reference_id: created.id })]);

    // One transaction on one client: BEGIN … deployment, stock, ledger, request … COMMIT.
    const sqls = calls.map((c) => `${c.via}:${c.sql.slice(0, 40)}`);
    const begin = sqls.indexOf('client:BEGIN');
    const commit = sqls.indexOf('client:COMMIT');
    const insert = sqls.findIndex((s) => s.startsWith('client:INSERT INTO bumble_bee_deployments'));
    const stock = sqls.findIndex((s) => s.startsWith('client:UPDATE bumble_bee_site_inventory'));
    const review = sqls.findIndex((s) => s.startsWith('client:UPDATE ipm_change_requests'));
    expect(begin).toBeGreaterThanOrEqual(0);
    expect([begin < insert, insert < stock, stock < review, review < commit]).toEqual([true, true, true, true]);
    expect(calls.filter((c) => c.via === 'pool' && /^(UPDATE|INSERT|DELETE) bumble_bee_/.test(c.sql))).toEqual([]);
    expect(sqls.filter((s) => s === 'client:BEGIN')).toHaveLength(1);

    expect(notifyUser).toHaveBeenCalledWith(SCOUTER.userId, expect.objectContaining({ path: '/ipm/bumble-bees' }));
  });

  it('deployment: stock is checked again at approval — too few boxes → 409 and the request stays pending', async () => {
    const cr = await propose('/bumble-bees', { fieldId: FIELD_A, datePlaced: '2026-09-29', boxesAdded: 15 });
    // The pest agronomist counts the store and finds fewer boxes.
    expect((await call('PUT', '/bumble-bees/inventory', PEST_AGRONOMIST, { siteId: SITE_A, quantityOnHand: 4 })).status).toBe(200);

    const res = await call('POST', `/change-requests/${cr.id}/approve`, PEST_AGRONOMIST, {});
    expect(res.status).toBe(409);
    expect(res.json.error.message).toMatch(/Not enough boxes in stock \(4 on hand, 15 requested\)/);
    expect(state.requests[0].status).toBe('pending');
    expect(state.deployments).toHaveLength(2);
    expect(onHand()).toBe(4);
  });

  it('deployment: another deployment on the field since the proposal → 409, stays pending', async () => {
    const cr = await propose('/bumble-bees', { fieldId: FIELD_A, datePlaced: '2026-09-29', boxesAdded: 2 });
    expect((await call('POST', '/bumble-bees', PEST_AGRONOMIST, { fieldId: FIELD_A, datePlaced: '2026-09-29', boxesAdded: 1 })).status).toBe(201);
    const res = await call('POST', `/change-requests/${cr.id}/approve`, PEST_AGRONOMIST, {});
    expect(res.status).toBe(409);
    expect(state.requests[0].status).toBe('pending');
  });

  it('deployment: a second proposal for the same field waits for the first', async () => {
    await propose('/bumble-bees', { fieldId: FIELD_A, datePlaced: '2026-09-29', boxesAdded: 2 });
    const res = await call('POST', '/bumble-bees', SCOUTER, { fieldId: FIELD_A, datePlaced: '2026-09-30', boxesAdded: 1 });
    expect(res.status).toBe(409);
    expect(state.requests).toHaveLength(1);
  });

  it('boxes on hand: approval sets the count and logs the real change; a stale count is refused', async () => {
    const cr = await propose('/bumble-bees/inventory', { siteId: SITE_A, quantityOnHand: 26 }, 'PUT');
    expect(cr.snapshotBefore).toMatchObject({ quantity_on_hand: 20, site_id: SITE_A });
    expect(onHand()).toBe(20);

    expect((await call('POST', `/change-requests/${cr.id}/approve`, IPM_ADMIN, {})).status).toBe(200);
    expect(onHand()).toBe(26);
    expect(state.adjustments).toEqual([expect.objectContaining({ reason: 'manual_set', delta: 6, quantity_after: 26 })]);

    // Stock moves after the next proposal → approval refused, count untouched.
    const cr2 = await propose('/bumble-bees/inventory', { siteId: SITE_A, quantityOnHand: 30 }, 'PUT');
    await call('POST', `/bumble-bees/incoming-orders/${ORDER_A}/receive`, PEST_AGRONOMIST, { quantityReceived: 12 });
    const res = await call('POST', `/change-requests/${cr2.id}/approve`, PEST_AGRONOMIST, {});
    expect(res.status).toBe(409);
    expect(res.json.error.message).toMatch(/changed from 26 to 38/);
    expect(onHand()).toBe(38);
    expect(state.requests.find((r) => r.id === cr2.id).status).toBe('pending');
  });

  it('order create / receive / cancel are applied only on approval', async () => {
    const created = await propose('/bumble-bees/incoming-orders', {
      siteId: SITE_A, quantityExpected: 6, orderDate: '2026-09-29', expectedDeliveryDate: '2026-10-09',
    });
    expect(state.orders).toHaveLength(2);
    expect((await call('POST', `/change-requests/${created.id}/approve`, PEST_AGRONOMIST, {})).status).toBe(200);
    const newOrder = state.orders.find((o) => o.quantity_expected === 6);
    expect(newOrder).toMatchObject({ expected_delivery_date: '2026-10-09', order_date: '2026-09-29', created_by: SCOUTER.userId });

    const receive = await propose(`/bumble-bees/incoming-orders/${ORDER_A}/receive`, { receivedDate: '2026-09-29', quantityReceived: 11 });
    expect(onHand()).toBe(20);
    expect(state.orders[0].status).toBe('pending');
    expect((await call('POST', `/change-requests/${receive.id}/approve`, PEST_AGRONOMIST, {})).status).toBe(200);
    expect(onHand()).toBe(31);
    expect(state.orders[0]).toMatchObject({ status: 'received', quantity_received: 11, quantity_on_hand_before: 20 });
    expect(state.adjustments).toEqual([expect.objectContaining({ reason: 'order_received', delta: 11 })]);

    const cancel = await propose(`/bumble-bees/incoming-orders/${newOrder.id}`, { status: 'cancelled' }, 'PUT');
    expect(newOrder.status).toBe('pending');
    expect((await call('POST', `/change-requests/${cancel.id}/approve`, PEST_AGRONOMIST, {})).status).toBe(200);
    expect(state.orders.find((o) => o.id === newOrder.id).status).toBe('cancelled');
  });

  it('receiving an order that was already received → 409 at approval, stays pending', async () => {
    const cr = await propose(`/bumble-bees/incoming-orders/${ORDER_A}/receive`, { quantityReceived: 12 });
    // A second receive proposal on the same order is refused while one is pending.
    expect((await call('POST', `/bumble-bees/incoming-orders/${ORDER_A}/receive`, SCOUTER, { quantityReceived: 12 })).status).toBe(409);
    expect((await call('POST', `/bumble-bees/incoming-orders/${ORDER_A}/receive`, PEST_AGRONOMIST, { quantityReceived: 12 })).status).toBe(200);
    const res = await call('POST', `/change-requests/${cr.id}/approve`, PEST_AGRONOMIST, {});
    expect(res.status).toBe(409);
    expect(onHand()).toBe(32);
    expect(state.requests[0].status).toBe('pending');
  });

  it('reject applies nothing and tells the scouter why; a corrected resubmission is linked', async () => {
    const cr = await propose('/bumble-bees', { fieldId: FIELD_A, datePlaced: '2026-09-29', boxesAdded: 5 });
    calls.length = 0;
    const res = await call('POST', `/change-requests/${cr.id}/reject`, PEST_AGRONOMIST, { reviewerComment: 'Only 3 went out' });
    expect(res.status).toBe(200);
    expect(res.json.data).toMatchObject({ status: 'rejected', reviewerComment: 'Only 3 went out' });
    expect(liveWrites()).toEqual([]);
    expect(state.deployments).toHaveLength(2);
    expect(onHand()).toBe(20);
    expect(notifyUser).toHaveBeenCalledWith(
      SCOUTER.userId,
      expect.objectContaining({ message: expect.stringContaining('Reason: Only 3 went out') }),
    );

    const list = await call('GET', `/bumble-bees/proposals?site_id=${SITE_A}`, SCOUTER);
    expect(list.json.data).toEqual([expect.objectContaining({ id: cr.id, status: 'rejected', reviewerComment: 'Only 3 went out' })]);

    const again = await call('POST', '/bumble-bees', SCOUTER, {
      fieldId: FIELD_A, datePlaced: '2026-09-29', boxesAdded: 3, resubmitOf: cr.id, reason: 'Corrected count',
    });
    expect(again.status).toBe(202);
    expect(again.json.data.changeRequest).toMatchObject({ reason: 'Corrected count' });
    expect(again.json.data.changeRequest.snapshotBefore.resubmit_of).toBe(cr.id);
  });

  it('a scouter cannot approve', async () => {
    const cr = await propose('/bumble-bees/inventory', { siteId: SITE_A, quantityOnHand: 3 }, 'PUT');
    expect((await call('POST', `/change-requests/${cr.id}/approve`, SCOUTER, {})).status).toBe(403);
    expect(onHand()).toBe(20);
  });
});

describe('inspections', () => {
  it('scouter edit seconds after saving (old 3-minute window) is a change request; approval applies it in the review transaction', async () => {
    const res = await call('PUT', `/bumble-bees/inspections/${INSP_A}`, SCOUTER, {
      inspectionDate: '2026-09-28', boxes100: 5, boxes80: 5, notes: 'recount',
    });
    expect(res.status).toBe(202);
    expect(state.inspections[0]).toMatchObject({ boxes_100: 6, boxes_80: 4 });
    const cr = res.json.data.changeRequest;
    expect(cr).toMatchObject({ entityType: 'bumble_bee_box_inspection', action: 'update', entityId: INSP_A });

    calls.length = 0;
    expect((await call('POST', `/change-requests/${cr.id}/approve`, PEST_AGRONOMIST, {})).status).toBe(200);
    expect(state.inspections[0]).toMatchObject({ boxes_100: 5, boxes_80: 5, notes: 'recount' });
    expect(calls.filter((c) => c.via === 'pool' && c.sql.startsWith('UPDATE bumble_bee_box_inspections'))).toEqual([]);
    expect(calls.some((c) => c.via === 'client' && c.sql.startsWith('UPDATE bumble_bee_box_inspections'))).toBe(true);
  });

  it('scouter delete seconds after saving is a change request', async () => {
    const res = await call('DELETE', `/bumble-bees/inspections/${INSP_A}`, SCOUTER);
    expect(res.status).toBe(202);
    expect(state.inspections).toHaveLength(2);
  });

  it('pest agronomist edits and deletes inspections live', async () => {
    const edit = await call('PUT', `/bumble-bees/inspections/${INSP_A}`, PEST_AGRONOMIST, {
      inspectionDate: '2026-09-28', boxes100: 10, boxes80: 0,
    });
    expect(edit.status).toBe(200);
    expect(state.inspections[0]).toMatchObject({ boxes_100: 10, boxes_80: 0, total_boxes: 10 });
    expect((await call('DELETE', `/bumble-bees/inspections/${INSP_A}`, PEST_AGRONOMIST)).status).toBe(200);
    expect(state.inspections.find((i) => i.id === INSP_A)).toBeUndefined();
    expect(state.requests).toHaveLength(0);
  });
});

describe('organization scope', () => {
  const cases: Array<[string, string, object | undefined]> = [
    ['PUT', `/bumble-bees/${DEP_B}`, { notes: 'x' }],
    ['PUT', `/bumble-bees/incoming-orders/${ORDER_B}`, { quantityExpected: 9 }],
    ['PUT', `/bumble-bees/incoming-orders/${ORDER_B}`, { status: 'cancelled' }],
    ['POST', `/bumble-bees/incoming-orders/${ORDER_B}/receive`, { quantityReceived: 3 }],
    ['PUT', `/bumble-bees/inspections/${INSP_B}`, { inspectionDate: '2026-09-28', boxes100: 4 }],
    ['DELETE', `/bumble-bees/inspections/${INSP_B}`, undefined],
  ];
  for (const [method, path, body] of cases) {
    it(`${method} ${path.split('/').slice(1, 3).join('/')} of another organization → 404 for pest agronomist and scouter`, async () => {
      for (const user of [PEST_AGRONOMIST, SCOUTER]) {
        calls.length = 0;
        const res = await call(method, path, user, body);
        expect(res.status).toBe(404);
        expect(liveWrites()).toEqual([]);
      }
      expect(state.requests).toHaveLength(0);
      expect(state.orders[1]).toMatchObject({ status: 'pending', quantity_expected: 3 });
      expect(state.inventory[SITE_B].quantity_on_hand).toBe(5);
    });
  }

  it('another organization\'s field or site is refused before anything is written', async () => {
    expect((await call('POST', '/bumble-bees', PEST_AGRONOMIST, { fieldId: FIELD_B, datePlaced: '2026-09-29', boxesAdded: 1 })).status).toBe(403);
    expect((await call('PUT', '/bumble-bees/inventory', SCOUTER, { siteId: SITE_B, quantityOnHand: 1 })).status).toBe(403);
    expect((await call('GET', `/bumble-bees/last-for-field?field_id=${FIELD_B}`, PEST_AGRONOMIST)).status).toBe(403);
    expect(state.requests).toHaveLength(0);
  });

  it('a pending request of another organization is not visible or approvable', async () => {
    const cr = (await call('PUT', '/bumble-bees/inventory', SCOUTER, { siteId: SITE_A, quantityOnHand: 7 })).json.data.changeRequest;
    const other = u('pest_agronomist', { organizationId: 'org-2' });
    expect((await call('POST', `/change-requests/${cr.id}/approve`, other, {})).status).toBe(404);
    const pending = await call('GET', `/change-requests/pending/${INSP_A}?entity_type=bumble_bee_box_inspection`, other);
    expect(pending.json.data).toBeNull();
    expect(onHand()).toBe(20);
  });
});

describe('incoming order dates', () => {
  it('accepts expectedDeliveryDate (what the page sends) and the older expectedDate', async () => {
    const a = await call('POST', '/bumble-bees/incoming-orders', PEST_AGRONOMIST, {
      siteId: SITE_A, quantityExpected: 4, orderDate: '2026-09-29', expectedDeliveryDate: '2026-10-12',
    });
    expect(a.status).toBe(201);
    expect(a.json.data).toMatchObject({ expected_delivery_date: '2026-10-12', order_date: '2026-09-29' });

    const b = await call('POST', '/bumble-bees/incoming-orders', PEST_AGRONOMIST, {
      siteId: SITE_A, quantityExpected: 4, expectedDate: '2026-10-13',
    });
    expect(b.status).toBe(201);
    expect(b.json.data.expected_delivery_date).toBe('2026-10-13');

    const missing = await call('POST', '/bumble-bees/incoming-orders', PEST_AGRONOMIST, { siteId: SITE_A, quantityExpected: 4 });
    expect(missing.status).toBe(400);
  });

  it('an order can only be cancelled through the edit route, never marked received', async () => {
    const res = await call('PUT', `/bumble-bees/incoming-orders/${ORDER_A}`, PEST_AGRONOMIST, { status: 'received' });
    expect(res.status).toBe(400);
    expect(state.orders[0].status).toBe('pending');
  });
});
