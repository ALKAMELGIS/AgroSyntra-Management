"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
jest.mock('../../db/client', () => ({
    dbPool: { query: jest.fn() },
}));
const client_1 = require("../../db/client");
const yieldPrediction_service_1 = require("../yieldPrediction.service");
const mockQuery = client_1.dbPool.query;
describe('YieldPrediction Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    it('returns insufficient data message with <3 harvests', async () => {
        mockQuery.mockResolvedValue({
            rows: [
                { date: '2025-01-01', total_quantity: '100', crop_name: 'Tomato' },
            ],
        });
        const prediction = await (0, yieldPrediction_service_1.predictYield)('field-1');
        expect(prediction.confidence_pct).toBe(0);
        expect(prediction.methodology).toContain('Insufficient data');
        expect(prediction.factors.data_points).toBe(1);
    });
    it('generates prediction with sufficient data', async () => {
        const rows = [];
        for (let i = 0; i < 10; i++) {
            const date = new Date(2024, i, 15);
            rows.push({ date: date.toISOString(), total_quantity: String(100 + i * 10), crop_name: 'Tomato' });
        }
        mockQuery.mockResolvedValue({ rows });
        const prediction = await (0, yieldPrediction_service_1.predictYield)('field-1');
        expect(prediction.predicted_yield).toBeGreaterThan(0);
        expect(prediction.confidence_pct).toBeGreaterThan(0);
        expect(prediction.crop_name).toBe('Tomato');
        expect(prediction.factors.data_points).toBe(10);
    });
    it('includes 6 monthly predictions', async () => {
        const rows = [];
        for (let i = 0; i < 5; i++) {
            rows.push({ date: `2024-0${i + 1}-15`, total_quantity: String(50 + i * 5), crop_name: 'Pepper' });
        }
        mockQuery.mockResolvedValue({ rows });
        const prediction = await (0, yieldPrediction_service_1.predictYield)('field-1');
        expect(prediction.monthly_predictions).toHaveLength(6);
        prediction.monthly_predictions.forEach((mp) => {
            expect(mp.month).toMatch(/^\d{4}-\d{2}$/);
            expect(mp.predicted).toBeGreaterThanOrEqual(0);
            expect(mp.lower).toBeLessThanOrEqual(mp.predicted);
            expect(mp.upper).toBeGreaterThanOrEqual(mp.predicted);
        });
    });
    it('detects increasing trend', async () => {
        const rows = [];
        for (let i = 0; i < 8; i++) {
            rows.push({ date: `2024-0${i + 1}-15`, total_quantity: String(50 + i * 20), crop_name: 'Tomato' });
        }
        mockQuery.mockResolvedValue({ rows });
        const prediction = await (0, yieldPrediction_service_1.predictYield)('field-1');
        expect(prediction.factors.trend_slope).toBeGreaterThan(0);
    });
    it('detects decreasing trend', async () => {
        const rows = [];
        for (let i = 0; i < 8; i++) {
            rows.push({ date: `2024-0${i + 1}-15`, total_quantity: String(200 - i * 20), crop_name: 'Tomato' });
        }
        mockQuery.mockResolvedValue({ rows });
        const prediction = await (0, yieldPrediction_service_1.predictYield)('field-1');
        expect(prediction.factors.trend_slope).toBeLessThan(0);
    });
    it('confidence increases with more data points', async () => {
        const makeRows = (n) => {
            const rows = [];
            for (let i = 0; i < n; i++) {
                rows.push({ date: `2024-01-${String(i + 1).padStart(2, '0')}`, total_quantity: String(100), crop_name: 'Test' });
            }
            return rows;
        };
        mockQuery.mockResolvedValue({ rows: makeRows(3) });
        const pred3 = await (0, yieldPrediction_service_1.predictYield)('field-1');
        mockQuery.mockResolvedValue({ rows: makeRows(15) });
        const pred15 = await (0, yieldPrediction_service_1.predictYield)('field-1');
        expect(pred15.confidence_pct).toBeGreaterThan(pred3.confidence_pct);
    });
    it('predicted yield is never negative', async () => {
        const rows = [];
        for (let i = 0; i < 5; i++) {
            rows.push({ date: `2024-0${i + 1}-15`, total_quantity: String(100 - i * 30), crop_name: 'Test' });
        }
        mockQuery.mockResolvedValue({ rows });
        const prediction = await (0, yieldPrediction_service_1.predictYield)('field-1');
        expect(prediction.predicted_yield).toBeGreaterThanOrEqual(0);
        expect(prediction.confidence_lower).toBeGreaterThanOrEqual(0);
    });
});
