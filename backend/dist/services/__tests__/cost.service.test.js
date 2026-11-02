"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
jest.mock('../../db/client', () => ({
    dbPool: { query: jest.fn() },
}));
const client_1 = require("../../db/client");
const cost_service_1 = require("../cost.service");
const mockQuery = client_1.dbPool.query;
const TEST_ORG = '00000000-0000-0000-0000-000000000001';
describe('Cost Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    describe('listCosts', () => {
        it('returns costs with total count', async () => {
            mockQuery
                .mockResolvedValueOnce({ rows: [{ count: '5' }] })
                .mockResolvedValueOnce({ rows: [
                    { id: '1', category: 'fertilizer', amount: '100.00' },
                    { id: '2', category: 'labor', amount: '200.00' },
                ] });
            const result = await (0, cost_service_1.listCosts)({ organizationId: TEST_ORG });
            expect(result.total).toBe(5);
            expect(result.costs).toHaveLength(2);
        });
        it('applies field_id filter', async () => {
            mockQuery
                .mockResolvedValueOnce({ rows: [{ count: '2' }] })
                .mockResolvedValueOnce({ rows: [] });
            await (0, cost_service_1.listCosts)({ organizationId: TEST_ORG, field_id: 'field-1' });
            const countCall = mockQuery.mock.calls[0][0];
            expect(countCall).toContain('field_id');
            expect(mockQuery.mock.calls[0][1]).toContain('field-1');
        });
        it('applies date range filters', async () => {
            mockQuery
                .mockResolvedValueOnce({ rows: [{ count: '0' }] })
                .mockResolvedValueOnce({ rows: [] });
            await (0, cost_service_1.listCosts)({ organizationId: TEST_ORG, start_date: '2025-01-01', end_date: '2025-12-31' });
            const countCall = mockQuery.mock.calls[0][0];
            expect(countCall).toContain('date >=');
            expect(countCall).toContain('date <=');
        });
        it('uses default limit and offset', async () => {
            mockQuery
                .mockResolvedValueOnce({ rows: [{ count: '0' }] })
                .mockResolvedValueOnce({ rows: [] });
            await (0, cost_service_1.listCosts)({ organizationId: TEST_ORG });
            const queryCall = mockQuery.mock.calls[1];
            expect(queryCall[1]).toContain(50); // default limit
            expect(queryCall[1]).toContain(0); // default offset
        });
    });
    describe('createCost', () => {
        it('creates a cost entry with all fields', async () => {
            const data = {
                field_id: 'field-1',
                category: 'fertilizer',
                amount: 150.50,
                currency: 'AED',
                description: 'NPK fertilizer',
                date: '2025-06-15',
                created_by: 'user-1',
            };
            mockQuery.mockResolvedValue({ rows: [{ id: 'cost-1', ...data }] });
            const result = await (0, cost_service_1.createCost)(data);
            expect(result.id).toBe('cost-1');
            expect(mockQuery).toHaveBeenCalledTimes(1);
            expect(mockQuery.mock.calls[0][0]).toContain('INSERT INTO cost_entries');
        });
        it('defaults currency to AED', async () => {
            mockQuery.mockResolvedValue({ rows: [{ id: 'cost-1' }] });
            await (0, cost_service_1.createCost)({ category: 'labor', amount: 100, date: '2025-01-01', created_by: 'user-1' });
            const params = mockQuery.mock.calls[0][1];
            expect(params).toContain('AED');
        });
    });
    describe('updateCost', () => {
        it('updates specified fields', async () => {
            mockQuery.mockResolvedValue({ rows: [{ id: 'cost-1', amount: 200 }] });
            const result = await (0, cost_service_1.updateCost)('cost-1', { amount: 200 });
            expect(result.amount).toBe(200);
            expect(mockQuery.mock.calls[0][0]).toContain('UPDATE cost_entries');
        });
    });
    describe('deleteCost', () => {
        it('deletes by id', async () => {
            mockQuery.mockResolvedValue({ rowCount: 1 });
            await (0, cost_service_1.deleteCost)('cost-1');
            expect(mockQuery).toHaveBeenCalledWith('DELETE FROM cost_entries WHERE id = $1', ['cost-1']);
        });
    });
    describe('getCostSummary', () => {
        it('returns summary with all aggregations', async () => {
            mockQuery
                .mockResolvedValueOnce({ rows: [{ category: 'fertilizer', total: '500', count: '3' }] })
                .mockResolvedValueOnce({ rows: [{ field_id: 'f1', field_name: 'Field A', total: '500' }] })
                .mockResolvedValueOnce({ rows: [{ month: '2025-01-01', total: '500' }] })
                .mockResolvedValueOnce({ rows: [{ total: '500' }] });
            const summary = await (0, cost_service_1.getCostSummary)({ organizationId: TEST_ORG });
            expect(summary.byCategory).toHaveLength(1);
            expect(summary.byField).toHaveLength(1);
            expect(summary.monthly).toHaveLength(1);
            expect(summary.total).toBe(500);
        });
        it('applies field filter to summary', async () => {
            mockQuery
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [{ total: '0' }] });
            await (0, cost_service_1.getCostSummary)({ organizationId: TEST_ORG, field_id: 'field-1' });
            mockQuery.mock.calls.forEach((call) => {
                expect(call[1]).toContain('field-1');
            });
        });
    });
});
