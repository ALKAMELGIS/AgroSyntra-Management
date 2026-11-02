"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
jest.mock('../../db/client', () => ({
    dbPool: { query: jest.fn() },
}));
const client_1 = require("../../db/client");
const fieldCropSync_1 = require("../fieldCropSync");
const mockQuery = client_1.dbPool.query;
/** The UPDATE that writes fields.current_crop_id. */
function fieldUpdate() {
    return mockQuery.mock.calls.find(([sql]) => String(sql).includes('UPDATE fields SET current_crop_id'));
}
describe('syncFieldCrop', () => {
    beforeEach(() => jest.clearAllMocks());
    it('points the field at its latest open rotation', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ crop_id: 'crop-1', variety_id: 'var-1' }] });
        mockQuery.mockResolvedValueOnce({ rows: [] });
        await (0, fieldCropSync_1.syncFieldCrop)('field-1');
        expect(fieldUpdate()?.[1]).toEqual(['crop-1', 'var-1', 'field-1']);
    });
    // The bug this module exists to fix. Every previous copy of syncFieldCrop
    // skipped the update when nothing was open, leaving the field pointing at a
    // crop that had already been cleared or uprooted.
    it('clears the crop when no rotation is left open', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });
        mockQuery.mockResolvedValueOnce({ rows: [] });
        await (0, fieldCropSync_1.syncFieldCrop)('field-1');
        expect(fieldUpdate()).toBeDefined();
        expect(fieldUpdate()?.[1]).toEqual([null, null, 'field-1']);
    });
    it('clears only the variety when the open rotation has none', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ crop_id: 'crop-1', variety_id: null }] });
        mockQuery.mockResolvedValueOnce({ rows: [] });
        await (0, fieldCropSync_1.syncFieldCrop)('field-1');
        expect(fieldUpdate()?.[1]).toEqual(['crop-1', null, 'field-1']);
    });
    it('runs on the caller client so it joins their transaction', async () => {
        const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
        await (0, fieldCropSync_1.syncFieldCrop)('field-1', client);
        expect(client.query).toHaveBeenCalled();
        expect(mockQuery).not.toHaveBeenCalled();
    });
});
describe('autoClosePrevious', () => {
    beforeEach(() => jest.clearAllMocks());
    it('closes an open rotation the day before the new one starts', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        await (0, fieldCropSync_1.autoClosePrevious)('field-1', '2026-01-15');
        const [sql, params] = mockQuery.mock.calls[0];
        expect(sql).toContain("interval '1 day'");
        expect(params).toEqual(['2026-01-15', 'field-1']);
    });
    it('can leave one rotation alone', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        await (0, fieldCropSync_1.autoClosePrevious)('field-1', '2026-01-15', 'keep-me');
        const [sql, params] = mockQuery.mock.calls[0];
        expect(sql).toContain('id != $3');
        expect(params).toEqual(['2026-01-15', 'field-1', 'keep-me']);
    });
});
describe('closeCropHistoryForUproot', () => {
    beforeEach(() => jest.clearAllMocks());
    // The crop occupied the land up to and including the day it was pulled, so
    // the rotation ends on the uproot date rather than the day before.
    it('ends the rotation on the uproot date itself', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        await (0, fieldCropSync_1.closeCropHistoryForUproot)('field-1', '2025-11-30');
        const close = mockQuery.mock.calls.find(([sql]) => String(sql).includes('UPDATE crop_history SET end_date'));
        expect(close?.[0]).toContain('end_date = $1::date');
        expect(close?.[0]).not.toContain("interval '1 day'");
        expect(close?.[1]).toEqual(['2025-11-30', 'field-1']);
    });
    it('clears the field afterwards when nothing is left open', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        await (0, fieldCropSync_1.closeCropHistoryForUproot)('field-1', '2025-11-30');
        expect(fieldUpdate()?.[1]).toEqual([null, null, 'field-1']);
    });
});
