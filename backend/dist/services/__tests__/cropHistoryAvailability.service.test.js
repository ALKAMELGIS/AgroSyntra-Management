"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
jest.mock('../../db/client', () => ({
    dbPool: { query: jest.fn() },
}));
jest.mock('../seasons.service', () => {
    const actual = jest.requireActual('../seasons.service');
    return {
        ...actual,
        getOpenSeason: jest.fn(),
    };
});
const seasons_service_1 = require("../seasons.service");
const cropHistoryAvailability_service_1 = require("../cropHistoryAvailability.service");
const getSeason = seasons_service_1.getOpenSeason;
describe('listCropHistoryAvailability', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        getSeason.mockResolvedValue({
            start_date: '2026-09-01',
            end_date: null,
            planned_end_date: '2027-07-31',
        });
    });
    it('uses a fixed query count and prefers a real uproot over season-close', async () => {
        const query = jest.fn(async (sql) => {
            const text = sql.replace(/\s+/g, ' ');
            if (text.includes('farm_area_name')) {
                return { rows: [
                        { id: 'f1', name: 'NH 01', farm_area_name: 'A' },
                        { id: 'f2', name: 'NH 02', farm_area_name: 'A' },
                    ] };
            }
            if (text.includes('uprooted_at')) {
                return { rows: [
                        {
                            field_id: 'f1',
                            uprooted_at: '2026-09-10',
                            uproot_reason: seasons_service_1.SEASON_CLOSED_REASON,
                            segment: 'B1',
                            crop_name: 'Tomato',
                            variety_name: null,
                        },
                        {
                            field_id: 'f1',
                            uprooted_at: '2026-09-11',
                            uproot_reason: 'Cycle end',
                            segment: 'B2',
                            crop_name: 'Tomato',
                            variety_name: 'Botero',
                        },
                    ] };
            }
            if (text.includes('occupancy_start')) {
                return { rows: [{ field_id: 'f1', occupancy_start: '2026-09-08' }] };
            }
            if (text.includes("p.status = 'active'")) {
                return { rows: [] };
            }
            if (text.includes('FROM valves')) {
                return { rows: [] };
            }
            if (text.includes('segment IS NOT NULL')) {
                return { rows: [
                        { field_id: 'f1', segment: 'B1' },
                        { field_id: 'f1', segment: 'B2' },
                    ] };
            }
            return { rows: [] };
        });
        const rows = await (0, cropHistoryAvailability_service_1.listCropHistoryAvailability)('site-1', { query });
        expect(query).toHaveBeenCalledTimes(6);
        expect(query.mock.calls.some(([sql]) => String(sql).includes('WHERE field_id = $1'))).toBe(false);
        const vacant = rows.find((row) => row.field_id === 'f1');
        expect(vacant?.kind).toBe('uprooted');
        expect(vacant?.uproot_reason).toBe('Cycle end');
        expect(vacant?.uprooted_at).toBe('2026-09-11');
        expect(vacant?.last_crop).toBe('Tomato · Botero');
        expect(vacant?.planted_in_window).toBe(true);
    });
});
