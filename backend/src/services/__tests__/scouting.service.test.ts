jest.mock('../../db/client', () => ({
  dbPool: { query: jest.fn(), connect: jest.fn() },
}));
jest.mock('../push-notification.service', () => ({
  pushNotificationService: { sendToUser: jest.fn(async () => undefined) },
}));
jest.mock('../../websocket', () => ({ emitAlert: jest.fn() }));
jest.mock('../seasons.service', () => ({
  assertFieldDateWritable: jest.fn(async () => undefined),
}));

import { dbPool } from '../../db/client';
import {
  notifyScoutingReport,
  updateScoutingReport,
  updateScoutingReportStatus,
} from '../scouting.service';
import { AppError, NotFoundError } from '../../utils/errors';
import { canEditScoutingReport, canReviewScouting } from '../../utils/ipmAccess';

const ORG = 'org-1';
const REPORT_ID = 'report-1';
const SCOUTER = 'user-scouter';
const PEST_AGRONOMIST = 'user-pest-agronomist';

interface Call { sql: string; params: unknown[] }

const norm = (sql: string) => sql.replace(/\s+/g, ' ').trim();

/** Fake pool + client that answer by SQL shape and record every statement. */
function makeDb(report: Record<string, unknown>, opts: { recipients?: string[] } = {}) {
  const calls: Call[] = [];
  const state = { ...report };
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    const text = norm(sql);
    const orgMatches = params.includes(ORG);

    if (text.startsWith('SELECT status, scout_user_id FROM scouting_reports')) {
      return { rows: orgMatches ? [{ status: state.status, scout_user_id: state.scout_user_id }] : [] };
    }
    if (text.startsWith('UPDATE scouting_reports SET field_id')) {
      if (!orgMatches) return { rows: [], rowCount: 0 };
      state.status = params[25];
      return { rows: [{ ...state }], rowCount: 1 };
    }
    if (text.startsWith('UPDATE scouting_reports SET status')) {
      if (!orgMatches) return { rows: [], rowCount: 0 };
      state.status = params[0];
      if (params[0] === 'returned') state.review_notes = params[3];
      return { rows: [{ ...state }], rowCount: 1 };
    }
    if (text.startsWith('SELECT name, organization_id FROM fields')) {
      return { rows: [{ name: 'GH-1', organization_id: ORG }] };
    }
    if (text.startsWith('SELECT name FROM fields')) return { rows: [{ name: 'GH-1' }] };
    if (text.startsWith('INSERT INTO alert_events')) return { rows: [{ id: 'alert-1' }] };
    if (text.startsWith('SELECT id FROM users')) {
      return { rows: (opts.recipients ?? []).map((id) => ({ id })) };
    }
    return { rows: [], rowCount: 0 };
  });
  (dbPool.query as jest.Mock).mockImplementation(query);
  (dbPool.connect as jest.Mock).mockResolvedValue({ query, release: jest.fn() });
  return calls;
}

const find = (calls: Call[], prefix: string) => calls.filter((c) => norm(c.sql).startsWith(prefix));

/** Let fire-and-forget notifications finish. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

const baseReport = {
  id: REPORT_ID,
  field_id: 'field-1',
  scout_user_id: SCOUTER,
  organization_id: ORG,
  report_date: '2026-09-27',
  status: 'submitted',
};

const reportInput = { fieldId: 'field-1', reportDate: '2026-09-27', notes: 'fixed counts' };

beforeEach(() => jest.clearAllMocks());

describe('updateScoutingReportStatus', () => {
  it('requires a reason to send a report back', async () => {
    const calls = makeDb(baseReport);
    await expect(
      updateScoutingReportStatus(REPORT_ID, 'returned', PEST_AGRONOMIST, ORG, '   '),
    ).rejects.toBeInstanceOf(AppError);
    await expect(
      updateScoutingReportStatus(REPORT_ID, 'returned', PEST_AGRONOMIST, ORG),
    ).rejects.toThrow(/reason is required/i);
    expect(calls).toHaveLength(0);
  });

  it('rejects statuses a reviewer cannot set', async () => {
    makeDb(baseReport);
    await expect(
      updateScoutingReportStatus(REPORT_ID, 'submitted' as never, PEST_AGRONOMIST, ORG),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('scopes the update to the organization', async () => {
    const calls = makeDb(baseReport);
    await updateScoutingReportStatus(REPORT_ID, 'reviewed', PEST_AGRONOMIST, ORG);

    const [update] = find(calls, 'UPDATE scouting_reports SET status');
    expect(norm(update.sql)).toMatch(/WHERE id = \$3 AND COALESCE\(scouting_reports\.organization_id/);
    expect(update.params).toEqual(['reviewed', PEST_AGRONOMIST, REPORT_ID, null, ORG]);
  });

  it('is not found for a report of another organization', async () => {
    makeDb(baseReport);
    await expect(
      updateScoutingReportStatus(REPORT_ID, 'reviewed', PEST_AGRONOMIST, 'org-2'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('stores the reason and notifies the scouter when sent back', async () => {
    const calls = makeDb(baseReport);
    const report = await updateScoutingReportStatus(
      REPORT_ID, 'returned', PEST_AGRONOMIST, ORG, '  Trap card counts missing ',
    );
    await flush();

    expect(report.status).toBe('returned');
    const [update] = find(calls, 'UPDATE scouting_reports SET status');
    expect(update.params[3]).toBe('Trap card counts missing');
    expect(norm(update.sql)).toContain("returned_at = CASE WHEN $1 = 'returned' THEN NOW()");

    const notifications = find(calls, 'INSERT INTO user_notifications');
    expect(notifications).toHaveLength(1);
    expect(notifications[0].params[0]).toBe(SCOUTER);
    expect(String(notifications[0].params[3])).toContain('Trap card counts missing');
  });

  it('does not notify anyone when marking reviewed', async () => {
    const calls = makeDb(baseReport);
    await updateScoutingReportStatus(REPORT_ID, 'reviewed', PEST_AGRONOMIST, ORG);
    await flush();
    expect(find(calls, 'INSERT INTO user_notifications')).toHaveLength(0);
  });
});

describe('updateScoutingReport', () => {
  it('resubmits a returned report when its scouter saves it and tells the org pest agronomists', async () => {
    const calls = makeDb(
      { ...baseReport, status: 'returned' },
      { recipients: [PEST_AGRONOMIST] },
    );
    const updated = await updateScoutingReport(REPORT_ID, reportInput, SCOUTER, ORG);
    await flush();

    expect(updated.status).toBe('submitted');
    const [update] = find(calls, 'UPDATE scouting_reports SET field_id');
    expect(update.params[25]).toBe('submitted');
    expect(update.params[26]).toBe(ORG);
    expect(norm(update.sql)).toMatch(/WHERE id = \$1 AND COALESCE\(scouting_reports\.organization_id/);

    const [users] = find(calls, 'SELECT id FROM users');
    expect(users.params).toEqual(['pest_agronomist', ORG]);
    expect(norm(users.sql)).toContain('AND organization_id = $2');

    const notifications = find(calls, 'INSERT INTO user_notifications');
    expect(notifications).toHaveLength(1);
    expect(notifications[0].params).toContain(PEST_AGRONOMIST);
    expect(notifications[0].params).toContain('Scouting report resubmitted');
  });

  it('keeps the status when a reviewer edits a returned report', async () => {
    const calls = makeDb({ ...baseReport, status: 'returned' });
    const updated = await updateScoutingReport(REPORT_ID, reportInput, PEST_AGRONOMIST, ORG);
    await flush();

    expect(updated.status).toBe('returned');
    expect(find(calls, 'SELECT id FROM users')).toHaveLength(0);
  });

  it('keeps the status of a submitted report', async () => {
    const calls = makeDb(baseReport);
    const updated = await updateScoutingReport(REPORT_ID, reportInput, SCOUTER, ORG);
    await flush();

    expect(updated.status).toBe('submitted');
    expect(find(calls, 'SELECT id FROM users')).toHaveLength(0);
  });

  it('returns null for a report of another organization', async () => {
    const calls = makeDb(baseReport);
    const updated = await updateScoutingReport(REPORT_ID, reportInput, SCOUTER, 'org-2');
    expect(updated).toBeNull();
    expect(find(calls, 'UPDATE scouting_reports')).toHaveLength(0);
  });
});

describe('notifyScoutingReport', () => {
  it('notifies pest agronomists and managers of the report organization only', async () => {
    const calls = makeDb(baseReport, { recipients: [PEST_AGRONOMIST, 'user-ceo'] });
    await notifyScoutingReport({ ...baseReport, infestation_pct: 10 });

    const [users] = find(calls, 'SELECT id FROM users');
    expect(users.params).toEqual(
      expect.arrayContaining(['pest_agronomist', 'agronomist', 'operation_manager', 'farm_manager', 'ceo']),
    );
    expect(users.params[users.params.length - 1]).toBe(ORG);
    expect(norm(users.sql)).toMatch(/AND organization_id = \$6$/);
    expect(find(calls, 'INSERT INTO user_notifications')).toHaveLength(2);
  });

  it("falls back to the field's organization for older reports", async () => {
    const calls = makeDb(baseReport);
    await notifyScoutingReport({ ...baseReport, organization_id: null });
    const [users] = find(calls, 'SELECT id FROM users');
    expect(users.params[users.params.length - 1]).toBe(ORG);
  });
});

describe('scouting access rules', () => {
  const scouter = { userId: SCOUTER, email: 'scout@example.com', role: 'scouter' as const };

  it('lets only the pest agronomist or IPM admin review', () => {
    expect(canReviewScouting({ email: 'a@example.com', role: 'pest_agronomist' })).toBe(true);
    expect(canReviewScouting({ email: 'abdullah@elite.com', role: 'ceo' })).toBe(true);
    expect(canReviewScouting({ email: 'a@example.com', role: 'agronomist' })).toBe(false);
    expect(canReviewScouting({ email: 'a@example.com', role: 'ceo' })).toBe(false);
    expect(canReviewScouting({ email: 'a@example.com', role: 'farm_manager' })).toBe(false);
  });

  it('lets the scouter edit own report only while submitted or returned', () => {
    expect(canEditScoutingReport(scouter, { scout_user_id: SCOUTER, status: 'submitted' })).toBe(true);
    expect(canEditScoutingReport(scouter, { scout_user_id: SCOUTER, status: 'returned' })).toBe(true);
    expect(canEditScoutingReport(scouter, { scout_user_id: SCOUTER, status: 'reviewed' })).toBe(false);
    expect(canEditScoutingReport(scouter, { scout_user_id: SCOUTER, status: 'resolved' })).toBe(false);
    expect(canEditScoutingReport(scouter, { scout_user_id: 'someone-else', status: 'submitted' })).toBe(false);
  });

  it('keeps reviewer edit rights on any status', () => {
    const reviewer = { userId: PEST_AGRONOMIST, email: 'p@example.com', role: 'pest_agronomist' as const };
    expect(canEditScoutingReport(reviewer, { scout_user_id: SCOUTER, status: 'resolved' })).toBe(true);
  });
});
