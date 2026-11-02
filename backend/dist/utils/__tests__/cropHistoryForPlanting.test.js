"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
jest.mock('../fieldCropSync', () => ({
    autoClosePrevious: jest.fn().mockResolvedValue(undefined),
    syncFieldCrop: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../services/seasons.service', () => ({
    seasonIdForWritableField: jest.fn(),
}));
const seasons_service_1 = require("../../services/seasons.service");
const fieldCropSync_1 = require("../fieldCropSync");
const cropHistoryForPlanting_1 = require("../cropHistoryForPlanting");
const seasonId = seasons_service_1.seasonIdForWritableField;
const autoClose = fieldCropSync_1.autoClosePrevious;
const sync = fieldCropSync_1.syncFieldCrop;
describe('createCropHistoryForPlanting', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        seasonId.mockResolvedValue('season-1');
    });
    it('reuses an open rotation for the same field, crop and season', async () => {
        const client = {
            query: jest.fn().mockResolvedValue({ rows: [{ id: 'hist-existing' }] }),
        };
        const id = await (0, cropHistoryForPlanting_1.createCropHistoryForPlanting)('field-1', 'crop-1', null, '2026-09-08', client);
        expect(id).toBe('hist-existing');
        expect(autoClose).not.toHaveBeenCalled();
        expect(sync).toHaveBeenCalledTimes(1);
        expect(client.query.mock.calls.some(([sql]) => String(sql).includes('LEAST'))).toBe(true);
        expect(client.query.mock.calls.some(([sql]) => String(sql).includes('INSERT'))).toBe(false);
    });
    it('inserts once when 22 bay rows share a field, crop, season and date', async () => {
        let openId = null;
        const client = {
            query: jest.fn(async (sql) => {
                const text = String(sql);
                if (text.includes('SELECT id FROM crop_history')) {
                    return { rows: openId ? [{ id: openId }] : [] };
                }
                if (text.includes('INSERT INTO crop_history')) {
                    openId = 'hist-1';
                    return { rows: [{ id: 'hist-1' }] };
                }
                if (text.includes('LEAST')) {
                    return { rows: [] };
                }
                return { rows: [] };
            }),
        };
        const ids = [];
        for (let i = 0; i < 22; i += 1) {
            ids.push(await (0, cropHistoryForPlanting_1.createCropHistoryForPlanting)('field-1', 'crop-1', null, '2026-09-08', client));
        }
        expect(new Set(ids)).toEqual(new Set(['hist-1']));
        const inserts = client.query.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO crop_history'));
        expect(inserts).toHaveLength(1);
        expect(autoClose).toHaveBeenCalledTimes(1);
        expect(sync).toHaveBeenCalledTimes(22);
    });
    it('uses seeding date when transplant is missing', () => {
        expect((0, cropHistoryForPlanting_1.rotationStartDate)(null, '2026-03-01')).toBe('2026-03-01');
        expect((0, cropHistoryForPlanting_1.rotationStartDate)('2026-04-01', '2026-03-01')).toBe('2026-04-01');
    });
});
