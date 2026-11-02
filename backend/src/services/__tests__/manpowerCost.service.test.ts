jest.mock('../../db/client', () => ({
  dbPool: { query: jest.fn(), connect: jest.fn() },
}));
jest.mock('../../utils/tenantValidation', () => ({
  assertSiteInOrganization: jest.fn(),
}));

import { dbPool } from '../../db/client';
import {
  deleteRate,
  fetchCostInputRows,
  getCostSummary,
  setGroupRate,
  setWorkerRate,
} from '../manpowerCost.service';

const mockQuery = dbPool.query as jest.Mock;
const mockConnect = dbPool.connect as jest.Mock;
const ORG = '00000000-0000-0000-0000-000000000001';
const SITE = '00000000-0000-0000-0000-0000000000a1';
const USER = '00000000-0000-0000-0000-0000000000u1';

function dbRow(overrides: Record<string, unknown> = {}) {
  return {
    record_id: 'r1',
    record_date: '2026-10-01',
    worker_id: 'w1',
    employee_id: 'E001',
    worker_name: 'Ahmed',
    category: 'Casual',
    site_id: SITE,
    site_name: 'Site A',
    activity: 'Pruning',
    hours: '8.0000',
    personal_rate_id: null,
    personal_rate: null,
    group_rate: '8.00',
    ...overrides,
  };
}

describe('manpowerCost.service', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockConnect.mockReset();
  });

  describe('fetchCostInputRows', () => {
    it('only reads approved, non-deleted records in the org and period', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await fetchCostInputRows(ORG, { startDate: '2026-10-01', endDate: '2026-10-31' });
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain(`r.approval_status = 'approved'`);
      expect(sql).toContain('r.deleted_at IS NULL');
      expect(sql).toContain('mr.effective_from <= r.record_date');
      expect(sql).not.toContain('w.site_id = $4');
      expect(params).toEqual([ORG, '2026-10-01', '2026-10-31']);
    });

    it('filters by the worker home site when a site is given', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await fetchCostInputRows(ORG, { startDate: '2026-10-01', endDate: '2026-10-31', siteId: SITE });
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('w.site_id = $4');
      expect(params[3]).toBe(SITE);
    });

    it('maps numeric strings and marks a found personal rate', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [dbRow({ personal_rate_id: 'p1', personal_rate: '12.50' }), dbRow({ record_id: 'r2', group_rate: null })],
      });
      const rows = await fetchCostInputRows(ORG, { startDate: '2026-10-01', endDate: '2026-10-31' });
      expect(rows[0]).toMatchObject({ hours: 8, personalRateFound: true, personalRate: 12.5, groupRate: 8 });
      expect(rows[1]).toMatchObject({ personalRateFound: false, personalRate: null, groupRate: null });
    });
  });

  it('getCostSummary costs personal over group and leaves missing rates out', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        dbRow({ hours: '10', personal_rate_id: 'p1', personal_rate: '15' }),
        dbRow({ record_id: 'r2', worker_id: 'w2', hours: '4', group_rate: null }),
      ],
    });
    const summary = await getCostSummary(ORG, { startDate: '2026-10-01', endDate: '2026-10-31' });
    expect(summary.totals).toMatchObject({ cost: 150, hours: 14, missingRateHours: 4 });
    expect(summary.offGroupRate[0]).toMatchObject({ workerId: 'w1', differenceVsGroup: 70 });
  });

  describe('saving rates', () => {
    function mockClient(insertedId = 'new-rate') {
      const client = {
        query: jest.fn(async (sql: string, _params?: unknown[]) => (
          sql.startsWith('INSERT') ? { rows: [{ id: insertedId }] } : { rows: [] }
        )),
        release: jest.fn(),
      };
      mockConnect.mockResolvedValueOnce(client);
      return client;
    }

    it('setGroupRate retires a rate on the same start date and inserts the new one in one transaction', async () => {
      const client = mockClient();
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'new-rate', rate_per_hour: '9.00', effective_from: '2026-11-01', site_id: SITE, category: 'Casual' }] });

      const rate = await setGroupRate(ORG, USER, { siteId: SITE, category: 'Casual', ratePerHour: 9, effectiveFrom: '2026-11-01' });

      const sqls = client.query.mock.calls.map((c: any[]) => String(c[0]).trim().split(/\s+/)[0]);
      expect(sqls).toEqual(['BEGIN', 'UPDATE', 'INSERT', 'COMMIT']);
      const [retireSql, retireParams] = client.query.mock.calls[1];
      expect(retireSql).toContain('worker_id IS NULL AND site_id = $4 AND category = $5');
      expect(retireParams).toEqual([ORG, USER, '2026-11-01', SITE, 'Casual']);
      const insertParams = client.query.mock.calls[2][1];
      expect(insertParams).toEqual([ORG, SITE, 'Casual', null, 9, '2026-11-01', null, USER]);
      expect(client.release).toHaveBeenCalled();
      expect(rate).toMatchObject({ id: 'new-rate', ratePerHour: 9, category: 'Casual' });
    });

    it('setWorkerRate with a null rate stores "back on group rate"', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'w1' }] });
      const client = mockClient();
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'new-rate', worker_id: 'w1', rate_per_hour: null, effective_from: '2026-11-01' }] });

      const rate = await setWorkerRate(ORG, USER, { workerId: 'w1', ratePerHour: null, effectiveFrom: '2026-11-01' });

      const insertParams = client.query.mock.calls[2][1];
      expect(insertParams).toEqual([ORG, null, null, 'w1', null, '2026-11-01', null, USER]);
      expect(rate.ratePerHour).toBeNull();
    });

    it('setWorkerRate refuses a worker from another organization', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await expect(setWorkerRate(ORG, USER, { workerId: 'w9', ratePerHour: 10, effectiveFrom: '2026-11-01' }))
        .rejects.toMatchObject({ status: 403 });
      expect(mockConnect).not.toHaveBeenCalled();
    });

    it('rolls back when the insert fails', async () => {
      const client = {
        query: jest.fn(async (sql: string, _params?: unknown[]) => {
          if (sql.startsWith('INSERT')) throw new Error('boom');
          return { rows: [] };
        }),
        release: jest.fn(),
      };
      mockConnect.mockResolvedValueOnce(client);
      await expect(setGroupRate(ORG, USER, { siteId: SITE, category: 'Permanent', ratePerHour: 9, effectiveFrom: '2026-11-01' }))
        .rejects.toThrow('boom');
      expect(client.query.mock.calls.map((c: any[]) => c[0])).toContain('ROLLBACK');
      expect(client.release).toHaveBeenCalled();
    });
  });

  it('deleteRate 404s when the rate is not in the org', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await expect(deleteRate(ORG, USER, 'missing')).rejects.toMatchObject({ status: 404 });
  });
});
