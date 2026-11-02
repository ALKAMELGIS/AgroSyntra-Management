"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
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
const client_1 = require("../../db/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const manpower_service_1 = require("../manpower.service");
const mockQuery = client_1.dbPool.query;
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
            const activities = await (0, manpower_service_1.listActivities)();
            expect(activities).toHaveLength(1);
            expect(activities[0].pivot_column).toBeNull();
            expect(mockQuery).toHaveBeenCalledTimes(2);
        });
        it('listActivities still surfaces unrelated database errors', async () => {
            mockQuery.mockRejectedValueOnce(Object.assign(new Error('connection lost'), { code: '08006' }));
            await expect((0, manpower_service_1.listActivities)()).rejects.toThrow('connection lost');
        });
        it('updateActivityPivotColumn reports the missing migration rather than a 500', async () => {
            mockQuery.mockRejectedValueOnce(undefinedColumn);
            await expect((0, manpower_service_1.updateActivityPivotColumn)('a1', 'Harvesting')).rejects.toThrow(/migration 143/);
        });
    });
    describe('workerLogin', () => {
        it('returns token for valid credentials', async () => {
            mockQuery.mockResolvedValueOnce({
                rows: [{ id: 'w1', employee_id: 'E001', name: 'Ahmed', is_team_leader: true, is_active: true, pin_hash: 'hashed' }],
            });
            bcryptjs_1.default.compare.mockResolvedValueOnce(true);
            const result = await (0, manpower_service_1.workerLogin)('E001', '1234');
            expect(result).toHaveProperty('token', 'mock-token');
            expect(result.worker.name).toBe('Ahmed');
        });
        it('throws for invalid employee ID', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [] });
            await expect((0, manpower_service_1.workerLogin)('INVALID', '1234')).rejects.toThrow();
        });
        it('throws for wrong PIN', async () => {
            mockQuery.mockResolvedValueOnce({
                rows: [{ id: 'w1', employee_id: 'E001', name: 'Ahmed', is_team_leader: true, is_active: true, pin_hash: 'hashed' }],
            });
            bcryptjs_1.default.compare.mockResolvedValueOnce(false);
            await expect((0, manpower_service_1.workerLogin)('E001', 'wrong')).rejects.toThrow();
        });
    });
    describe('listRecords', () => {
        it('applies soft delete filter', async () => {
            mockQuery
                .mockResolvedValueOnce({ rows: [{ count: '5' }] })
                .mockResolvedValueOnce({ rows: [] });
            await (0, manpower_service_1.listRecords)({ organizationId: TEST_ORG });
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
            const result = await (0, manpower_service_1.listRecords)({ organizationId: TEST_ORG, limit: 50, offset: 0 });
            expect(result.total).toBe(2);
            expect(result.data).toHaveLength(2);
        });
        it('filters by date range', async () => {
            mockQuery
                .mockResolvedValueOnce({ rows: [{ count: '0' }] })
                .mockResolvedValueOnce({ rows: [] });
            await (0, manpower_service_1.listRecords)({ organizationId: TEST_ORG, startDate: '2026-01-01', endDate: '2026-01-31' });
            const query = mockQuery.mock.calls[0][0];
            expect(query).toContain('record_date >=');
            expect(query).toContain('record_date <=');
        });
        it('filters by organization and worker site (field-site OR scoping is an open decision)', async () => {
            mockQuery
                .mockResolvedValueOnce({ rows: [{ count: '0' }] })
                .mockResolvedValueOnce({ rows: [] });
            await (0, manpower_service_1.listRecords)({ organizationId: TEST_ORG, siteId: 'site-1' });
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
            const result = await (0, manpower_service_1.createRecord)(newRecord);
            expect(result).toHaveProperty('id', 'new-id');
        });
    });
    describe('deleteRecord', () => {
        it('performs soft delete after org check', async () => {
            mockQuery.mockResolvedValueOnce({ rows: [{ id: 'r1' }] });
            mockQuery.mockResolvedValueOnce({ rowCount: 1 });
            await (0, manpower_service_1.deleteRecord)('r1', TEST_ORG);
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
            const result = await (0, manpower_service_1.getDailySummary)(TEST_ORG, '2026-01-15');
            expect(result.date).toBe('2026-01-15');
            expect(result.total_workers).toBe('8');
            expect(result.byActivity).toHaveLength(2);
        });
    });
});
