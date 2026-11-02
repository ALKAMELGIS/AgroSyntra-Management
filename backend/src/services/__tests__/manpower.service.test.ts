jest.mock('../../db/client', () => ({
  dbPool: { query: jest.fn() },
}));
jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));
jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(() => 'mock-token'),
}));

import { dbPool } from '../../db/client';
import bcrypt from 'bcryptjs';
import {
  workerLogin,
  listRecords,
  createRecord,
  deleteRecord,
  getDailySummary,
  listActivities,
  updateActivityPivotColumn,
  applyActivityImportMappings,
  listRecordWorkerDates,
} from '../manpower.service';

const mockQuery = dbPool.query as jest.Mock;
const TEST_ORG = '00000000-0000-0000-0000-000000000001';

describe('Manpower Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('pivot_column before migration 143', () => {
    /** Postgres undefined_column, raised when migration 143 has not been applied. */
    const undefinedColumn = Object.assign(new Error('column "pivot_column" does not exist'), {
      code: '42703',
    });

    it('listActivities falls back instead of failing the Records tab', async () => {
      mockQuery.mockRejectedValueOnce(undefinedColumn);
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'a1', name: 'Harvesting', default_unit: 'Box', pivot_column: null }],
      });

      const activities = await listActivities();
      expect(activities).toHaveLength(1);
      expect(activities[0].pivot_column).toBeNull();
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('listActivities still surfaces unrelated database errors', async () => {
      mockQuery.mockRejectedValueOnce(Object.assign(new Error('connection lost'), { code: '08006' }));
      await expect(listActivities()).rejects.toThrow('connection lost');
    });

    it('updateActivityPivotColumn reports the missing migration rather than a 500', async () => {
      mockQuery.mockRejectedValueOnce(undefinedColumn);
      await expect(updateActivityPivotColumn('a1', 'Harvesting')).rejects.toThrow(/migration 143/);
    });
  });

  describe('workerLogin', () => {
    it('returns token for valid credentials', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'w1', employee_id: 'E001', name: 'Ahmed', is_team_leader: true, is_active: true, pin_hash: 'hashed' }],
      });
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);

      const result = await workerLogin('E001', '1234');
      expect(result).toHaveProperty('token', 'mock-token');
      expect(result.worker.name).toBe('Ahmed');
    });

    it('throws for invalid employee ID', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await expect(workerLogin('INVALID', '1234')).rejects.toThrow();
    });

    it('throws for wrong PIN', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'w1', employee_id: 'E001', name: 'Ahmed', is_team_leader: true, is_active: true, pin_hash: 'hashed' }],
      });
      (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);
      await expect(workerLogin('E001', 'wrong')).rejects.toThrow();
    });
  });

  describe('listRecords', () => {
    it('applies soft delete filter', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        .mockResolvedValueOnce({ rows: [] });

      await listRecords({ organizationId: TEST_ORG });
      const countQuery = mockQuery.mock.calls[0][0];
      expect(countQuery).toContain('deleted_at IS NULL');
    });

    it('returns records with total count', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '2' }] })
        .mockResolvedValueOnce({
          rows: [
            { id: 'r1', worker_name: 'Ahmed', activity: 'Picking' },
            { id: 'r2', worker_name: 'Sara', activity: 'Packing' },
          ],
        });

      const result = await listRecords({ organizationId: TEST_ORG, limit: 50, offset: 0 });
      expect(result.total).toBe(2);
      expect(result.data).toHaveLength(2);
    });

    it('filters by date range', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      await listRecords({ organizationId: TEST_ORG, startDate: '2026-01-01', endDate: '2026-01-31' });
      const query = mockQuery.mock.calls[0][0];
      expect(query).toContain('record_date >=');
      expect(query).toContain('record_date <=');
    });

    it('filters by organization and worker site (field-site OR scoping is an open decision)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      await listRecords({ organizationId: TEST_ORG, siteId: 'site-1' });
      const query = mockQuery.mock.calls[0][0];
      expect(query).toContain('organization_id');
      expect(query).toContain('w.site_id');
      expect(query).not.toMatch(/fa\.site_id\s*=/);
    });
  });

  describe('createRecord', () => {
    it('inserts a record and returns it', async () => {
      const newRecord = {
        workerId: 'w1', recordDate: '2026-01-15', activity: 'Picking',
        unit: 'Kg', location: 'GH1', section: 'A1',
        startTime: '08:00', endTime: '12:00', targetQty: 100, actualQty: 95,
        totalHours: 4, taskSequence: 1, submittedBy: 'u1',
      };
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'w1' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'new-id', ...newRecord }],
      });

      const result = await createRecord(newRecord as any);
      expect(result).toHaveProperty('id', 'new-id');
    });
  });

  describe('deleteRecord', () => {
    it('performs soft delete after org check', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'r1' }] });
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });
      await deleteRecord('r1', TEST_ORG);
      expect(mockQuery.mock.calls[1][0]).toContain('SET deleted_at');
      expect(mockQuery.mock.calls[1][0]).not.toContain('DELETE FROM');
    });
  });

  describe('getDailySummary', () => {
    it('returns summary grouped by activity with totals', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            { activity: 'Picking', record_count: '5', activity_hours: '40' },
            { activity: 'Packing', record_count: '3', activity_hours: '24' },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ total_workers: '8', total_hours: '64', total_overtime: '4' }],
        });

      const result = await getDailySummary(TEST_ORG, '2026-01-15');
      expect(result.date).toBe('2026-01-15');
      expect(result.total_workers).toBe('8');
      expect(result.byActivity).toHaveLength(2);
    });
  });

  describe('applyActivityImportMappings', () => {
    it('connects a misspelling, saves the alias, and rewrites existing records', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ name: 'Supervisor' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rowCount: 12 });

      const result = await applyActivityImportMappings(TEST_ORG, [{
        sourceName: 'Supervisior',
        action: 'connect',
        catalogName: 'Supervisor',
      }]);

      expect(result).toEqual({
        created: [],
        aliasesSaved: 1,
        recordsUpdated: 12,
      });
      expect(mockQuery.mock.calls[1][0]).toContain('INSERT INTO manpower_activity_aliases');
      expect(mockQuery.mock.calls[1][1]).toEqual([
        TEST_ORG, 'supervisior', 'Supervisior', 'Supervisor',
      ]);
      expect(mockQuery.mock.calls[2][0]).toContain('UPDATE manpower_records');
      expect(mockQuery.mock.calls[2][1]).toEqual(['Supervisor', TEST_ORG, 'supervisior']);
    });

    it('creates a catalog activity when the sheet name is new', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'a-new', name: 'Seeds Sowing' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rowCount: 3 });

      const result = await applyActivityImportMappings(TEST_ORG, [{
        sourceName: 'Seeds Sowing',
        action: 'create',
        catalogName: 'Seeds Sowing',
      }]);

      expect(result.created).toEqual(['Seeds Sowing']);
      expect(result.aliasesSaved).toBe(1);
      expect(result.recordsUpdated).toBe(3);
      expect(mockQuery.mock.calls[1][0]).toContain('INSERT INTO manpower_activities');
    });

    it('rejects connect to an unknown catalog name', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await expect(applyActivityImportMappings(TEST_ORG, [{
        sourceName: 'Supervisior',
        action: 'connect',
        catalogName: 'Not A Real Activity',
      }])).rejects.toThrow('Unknown activity');
    });
  });

  describe('listRecordWorkerDates', () => {
    it('selects worker, date, activity, and id in the org date range without DISTINCT or ORDER BY', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'rec-1',
          worker_id: 'w-4',
          record_date: '2025-09-01',
          activity: 'Harvesting',
          task_sequence: 1,
        }],
      });
      const rows = await listRecordWorkerDates(TEST_ORG, '2025-09-01', '2025-09-30');
      expect(rows).toEqual([{
        id: 'rec-1',
        worker_id: 'w-4',
        record_date: '2025-09-01',
        activity: 'Harvesting',
        task_sequence: 1,
        created_by: null,
        approval_status: null,
        submission_id: null,
      }]);
      const sql = mockQuery.mock.calls[0][0];
      expect(sql).not.toContain('SELECT DISTINCT');
      expect(sql).toContain('r.id');
      expect(sql).toContain('r.activity');
      expect(sql).toContain("to_char(r.record_date, 'YYYY-MM-DD')");
      expect(sql).toContain('deleted_at IS NULL');
      expect(sql).toContain('organization_id');
      expect(sql).not.toContain('ORDER BY');
      expect(mockQuery.mock.calls[0][1]).toEqual([TEST_ORG, '2025-09-01', '2025-09-30']);
    });
  });
});
