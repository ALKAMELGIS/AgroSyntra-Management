"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
jest.mock('../../db/client', () => ({
    dbPool: { query: jest.fn() },
}));
jest.mock('../alertEngine.service', () => ({
    evaluateAlerts: jest.fn(),
}));
const client_1 = require("../../db/client");
const anomalyDetection_service_1 = require("../anomalyDetection.service");
const mockQuery = client_1.dbPool.query;
describe('AnomalyDetection Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    describe('detectAnomalies', () => {
        it('returns empty array when no stats available', async () => {
            mockQuery.mockResolvedValue({ rows: [] });
            const results = await (0, anomalyDetection_service_1.detectAnomalies)('field-1', { ec: 2.5, ph: 6.5 });
            expect(results).toEqual([]);
        });
        it('detects anomaly when value is >2 stddev from mean', async () => {
            mockQuery.mockResolvedValue({
                rows: [{
                        mean_ec: '2.0', std_ec: '0.3',
                        mean_ph: '6.5', std_ph: '0.2',
                        mean_drain: '15', std_drain: '3',
                    }],
            });
            const results = await (0, anomalyDetection_service_1.detectAnomalies)('field-1', { ec: 3.5, ph: 6.5 });
            const ecResult = results.find((r) => r.metric === 'ec');
            expect(ecResult).toBeDefined();
            expect(ecResult.isAnomaly).toBe(true);
            expect(ecResult.zScore).toBeGreaterThan(2);
        });
        it('does not flag normal readings', async () => {
            mockQuery.mockResolvedValue({
                rows: [{
                        mean_ec: '2.0', std_ec: '0.3',
                        mean_ph: '6.5', std_ph: '0.2',
                        mean_drain: '15', std_drain: '3',
                    }],
            });
            const results = await (0, anomalyDetection_service_1.detectAnomalies)('field-1', { ec: 2.1, ph: 6.4 });
            const anomalies = results.filter((r) => r.isAnomaly);
            expect(anomalies).toHaveLength(0);
            // Non-anomaly results should still be returned
            expect(results.length).toBeGreaterThan(0);
            results.forEach((r) => expect(r.isAnomaly).toBe(false));
        });
        it('skips metrics with zero stddev', async () => {
            mockQuery.mockResolvedValue({
                rows: [{
                        mean_ec: '2.0', std_ec: '0',
                        mean_ph: '6.5', std_ph: '0.2',
                        mean_drain: '15', std_drain: '0',
                    }],
            });
            const results = await (0, anomalyDetection_service_1.detectAnomalies)('field-1', { ec: 5.0, ph: 6.5 });
            // EC should be skipped (zero stddev)
            const ecResult = results.find((r) => r.metric === 'ec');
            expect(ecResult).toBeUndefined();
            // pH should still be present
            const phResult = results.find((r) => r.metric === 'ph');
            expect(phResult).toBeDefined();
        });
        it('skips undefined metrics', async () => {
            mockQuery.mockResolvedValue({
                rows: [{
                        mean_ec: '2.0', std_ec: '0.3',
                        mean_ph: '6.5', std_ph: '0.2',
                        mean_drain: '15', std_drain: '3',
                    }],
            });
            const results = await (0, anomalyDetection_service_1.detectAnomalies)('field-1', { ec: 2.0 });
            // Only EC should be evaluated
            expect(results.length).toBeLessThanOrEqual(1);
        });
        it('calculates correct z-score', async () => {
            mockQuery.mockResolvedValue({
                rows: [{
                        mean_ec: '2.0', std_ec: '0.5',
                        mean_ph: '6.5', std_ph: '0.2',
                        mean_drain: '15', std_drain: '3',
                    }],
            });
            const results = await (0, anomalyDetection_service_1.detectAnomalies)('field-1', { ec: 3.0 });
            const ecResult = results.find((r) => r.metric === 'ec');
            expect(ecResult).toBeDefined();
            expect(ecResult.zScore).toBeCloseTo(2.0, 1);
        });
    });
    describe('checkForAnomalies', () => {
        it('creates alert events for detected anomalies', async () => {
            // First call: stats query
            mockQuery
                .mockResolvedValueOnce({
                rows: [{
                        mean_ec: '2.0', std_ec: '0.2',
                        mean_ph: '6.5', std_ph: '0.2',
                        mean_drain: '15', std_drain: '3',
                    }],
            })
                // Second call: insert alert event
                .mockResolvedValueOnce({ rows: [{ id: 'alert-1' }] });
            await (0, anomalyDetection_service_1.checkForAnomalies)('field-1', 'entry-1', { ec: 5.0, ph: 6.5 });
            // Should have called insert for the anomaly
            const insertCalls = mockQuery.mock.calls.filter((call) => typeof call[0] === 'string' && call[0].includes('INSERT INTO alert_events'));
            expect(insertCalls.length).toBeGreaterThan(0);
        });
        it('does not create alerts for normal readings', async () => {
            mockQuery.mockResolvedValue({
                rows: [{
                        mean_ec: '2.0', std_ec: '0.3',
                        mean_ph: '6.5', std_ph: '0.2',
                        mean_drain: '15', std_drain: '3',
                    }],
            });
            await (0, anomalyDetection_service_1.checkForAnomalies)('field-1', 'entry-1', { ec: 2.0, ph: 6.5 });
            const insertCalls = mockQuery.mock.calls.filter((call) => typeof call[0] === 'string' && call[0].includes('INSERT INTO alert_events'));
            expect(insertCalls).toHaveLength(0);
        });
        it('handles errors gracefully', async () => {
            mockQuery.mockRejectedValue(new Error('DB error'));
            // Should not throw
            await expect((0, anomalyDetection_service_1.checkForAnomalies)('field-1', 'entry-1', { ec: 5.0 })).resolves.toBeUndefined();
        });
    });
});
