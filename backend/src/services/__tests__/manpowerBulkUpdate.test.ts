jest.mock('../../db/client', () => ({
  dbPool: { query: jest.fn(), connect: jest.fn() },
}));

import { dbPool } from '../../db/client';
import { bulkUpdateRecords } from '../manpower.service';

const mockConnect = dbPool.connect as jest.Mock;
const ORG = '00000000-0000-0000-0000-000000000001';

/** Fake client: the SELECT returns record dates; each UPDATE returns whether the row was sent back. */
function mockClient(dates: Record<string, string>, sentBack: Record<string, boolean>, workers: Record<string, string> = {}) {
  const client = {
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      const text = sql.trim();
      if (text.startsWith('SELECT')) {
        const ids = (params?.[0] as string[]) || [];
        return { rows: ids.filter((id) => dates[id]).map((id) => ({ id, record_date: dates[id] })) };
      }
      if (text.startsWith('UPDATE')) {
        const id = params?.[0] as string;
        if (!dates[id]) return { rows: [] };
        return { rows: [{ id, worker_id: workers[id] || `w-${id}`, sent_for_approval: Boolean(sentBack[id]) }] };
      }
      return { rows: [] };
    }),
    release: jest.fn(),
  };
  mockConnect.mockResolvedValueOnce(client);
  return client;
}

function updateCalls(client: ReturnType<typeof mockClient>) {
  return client.query.mock.calls.filter((c: any[]) => String(c[0]).trim().startsWith('UPDATE'));
}

describe('bulkUpdateRecords approval', () => {
  beforeEach(() => mockConnect.mockReset());

  it('sends changed approved records back to pending, one submission per date', async () => {
    const client = mockClient(
      { a: '2026-10-01', b: '2026-10-01', c: '2026-10-02' },
      { a: true, b: true, c: true },
      { a: 'w1', b: 'w2', c: 'w1' },
    );

    const result = await bulkUpdateRecords(ORG, [
      { id: 'a', workHours: 8 },
      { id: 'b', workHours: 6 },
      { id: 'c', workHours: 9 },
    ]);

    expect(result.updated).toHaveLength(3);
    expect(result.sentForApproval).toHaveLength(2);
    const [day1, day2] = result.sentForApproval;
    expect(day1.records).toEqual([
      { workerId: 'w1', recordDate: '2026-10-01' },
      { workerId: 'w2', recordDate: '2026-10-01' },
    ]);
    expect(day2.records).toEqual([{ workerId: 'w1', recordDate: '2026-10-02' }]);
    expect(day1.submissionId).not.toBe(day2.submissionId);

    // Same date → same submission id passed to SQL ($14).
    const submissionParams = updateCalls(client).map((c: any[]) => (c[1] as unknown[])[13]);
    expect(submissionParams).toEqual([day1.submissionId, day1.submissionId, day2.submissionId]);
  });

  it('keeps unchanged records approved and reports nothing sent for approval', async () => {
    mockClient({ a: '2026-10-01' }, { a: false });
    const result = await bulkUpdateRecords(ORG, [{ id: 'a', workHours: 8 }]);
    expect(result.updated).toEqual([{ id: 'a' }]);
    expect(result.sentForApproval).toEqual([]);
  });

  it('only flips non-pending rows whose values differ, and never compares total_hours', async () => {
    const client = mockClient({ a: '2026-10-01' }, { a: true });
    await bulkUpdateRecords(ORG, [{ id: 'a', workHours: 8, totalHours: 10 }]);
    const sql = String(updateCalls(client)[0][0]);
    expect(sql).toContain(`r.approval_status <> 'pending'`);
    expect(sql).toContain('IS DISTINCT FROM');
    expect(sql).toContain(`THEN 'pending' ELSE r.approval_status END`);
    const compared = sql.slice(sql.indexOf('r.approval_status <>'), sql.indexOf('IS DISTINCT FROM'));
    expect(compared).toContain('r.work_hours');
    expect(compared).not.toContain('r.total_hours');
  });

  it('skips records outside the organization', async () => {
    const client = mockClient({ a: '2026-10-01' }, { a: true });
    const result = await bulkUpdateRecords(ORG, [{ id: 'a' }, { id: 'other-org' }]);
    expect(result.updated).toEqual([{ id: 'a' }]);
    expect(updateCalls(client)).toHaveLength(1);
  });

  it('returns early without touching the database for an empty list', async () => {
    await expect(bulkUpdateRecords(ORG, [])).resolves.toEqual({ updated: [], sentForApproval: [] });
    expect(mockConnect).not.toHaveBeenCalled();
  });
});
