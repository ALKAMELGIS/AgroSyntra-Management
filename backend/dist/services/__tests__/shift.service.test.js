"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
jest.mock('../../db/client', () => ({
    dbPool: { query: jest.fn() },
}));
const client_1 = require("../../db/client");
const shift_service_1 = require("../shift.service");
const mockQuery = client_1.dbPool.query;
describe('Shift Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    describe('listShifts', () => {
        it('returns shifts without filters', async () => {
            mockQuery.mockResolvedValue({
                rows: [
                    { id: 's1', user_name: 'Ahmed', shift_type: 'morning', date: '2025-06-01' },
                    { id: 's2', user_name: 'Sara', shift_type: 'afternoon', date: '2025-06-01' },
                ],
            });
            const shifts = await (0, shift_service_1.listShifts)({});
            expect(shifts).toHaveLength(2);
            expect(shifts[0].user_name).toBe('Ahmed');
        });
        it('applies user_id filter', async () => {
            mockQuery.mockResolvedValue({ rows: [] });
            await (0, shift_service_1.listShifts)({ user_id: 'user-1' });
            expect(mockQuery.mock.calls[0][0]).toContain('user_id');
            expect(mockQuery.mock.calls[0][1]).toContain('user-1');
        });
        it('applies date range filters', async () => {
            mockQuery.mockResolvedValue({ rows: [] });
            await (0, shift_service_1.listShifts)({ start_date: '2025-06-01', end_date: '2025-06-07' });
            expect(mockQuery.mock.calls[0][0]).toContain('date >=');
            expect(mockQuery.mock.calls[0][0]).toContain('date <=');
        });
        it('orders by date and start_time', async () => {
            mockQuery.mockResolvedValue({ rows: [] });
            await (0, shift_service_1.listShifts)({});
            expect(mockQuery.mock.calls[0][0]).toContain('ORDER BY s.date, s.start_time');
        });
    });
    describe('createShift', () => {
        it('creates a shift with all fields', async () => {
            const data = {
                user_id: 'user-1',
                field_id: 'field-1',
                shift_type: 'morning',
                start_time: '06:00',
                end_time: '14:00',
                date: '2025-06-01',
                notes: 'Irrigation duty',
                created_by: 'admin-1',
            };
            mockQuery.mockResolvedValue({ rows: [{ id: 'shift-1', ...data }] });
            const result = await (0, shift_service_1.createShift)(data);
            expect(result.id).toBe('shift-1');
            expect(result.shift_type).toBe('morning');
            expect(mockQuery.mock.calls[0][0]).toContain('INSERT INTO shifts');
        });
    });
    describe('updateShift', () => {
        it('updates shift type and time', async () => {
            mockQuery.mockResolvedValue({ rows: [{ id: 's1', shift_type: 'afternoon' }] });
            const result = await (0, shift_service_1.updateShift)('s1', { shift_type: 'afternoon', start_time: '14:00', end_time: '22:00' });
            expect(result.shift_type).toBe('afternoon');
            expect(mockQuery.mock.calls[0][0]).toContain('UPDATE shifts');
        });
    });
    describe('deleteShift', () => {
        it('deletes a shift by id', async () => {
            mockQuery.mockResolvedValue({ rowCount: 1 });
            await (0, shift_service_1.deleteShift)('shift-1');
            expect(mockQuery).toHaveBeenCalledWith('DELETE FROM shifts WHERE id = $1', ['shift-1']);
        });
    });
});
