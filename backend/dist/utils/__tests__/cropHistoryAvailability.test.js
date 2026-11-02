"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cropHistoryAvailability_1 = require("../cropHistoryAvailability");
const plantingSegmentTokens_1 = require("../plantingSegmentTokens");
const fs_1 = require("fs");
const path_1 = require("path");
describe('classifyFieldAvailability', () => {
    it('omits a fully occupied field', () => {
        expect((0, cropHistoryAvailability_1.classifyFieldAvailability)({
            occupied: ['B1', 'B2'],
            universe: ['B1', 'B2'],
            plantedInWindow: true,
            uprootedInWindow: null,
        })).toBeNull();
        expect((0, cropHistoryAvailability_1.classifyFieldAvailability)({
            occupied: [plantingSegmentTokens_1.ALL_SEGMENTS],
            universe: ['B1'],
            plantedInWindow: true,
            uprootedInWindow: null,
        })).toBeNull();
    });
    it('labels a vacant field never planted when there is no in-window uproot', () => {
        const row = (0, cropHistoryAvailability_1.classifyFieldAvailability)({
            occupied: [],
            universe: ['B1'],
            plantedInWindow: false,
            uprootedInWindow: null,
        });
        expect(row?.availability).toBe('Vacant');
        expect(row?.kind).toBe('never_planted');
        expect(row?.plantedInWindow).toBe(false);
    });
    it('labels a vacant field uprooted when the uproot is in the season window', () => {
        const row = (0, cropHistoryAvailability_1.classifyFieldAvailability)({
            occupied: [],
            universe: ['B1'],
            plantedInWindow: true,
            uprootedInWindow: { at: '2026-09-10', reason: 'Cycle end', tokens: ['B1'], cropName: 'Tomato' },
        });
        expect(row?.kind).toBe('uprooted');
        expect(row?.lastCrop).toContain('Tomato');
        expect(row?.plantedInWindow).toBe(true);
    });
    it('shows occupied and free tokens on a partial field', () => {
        const row = (0, cropHistoryAvailability_1.classifyFieldAvailability)({
            occupied: ['B1'],
            universe: ['B1', 'B2'],
            plantedInWindow: true,
            uprootedInWindow: { at: '2026-09-10', reason: 'Cycle end', tokens: ['B2'] },
        });
        expect(row?.availability).toBe('Partial');
        expect(row?.occupiedTokens).toEqual(['B1']);
        expect(row?.freeTokens).toEqual(['B2']);
        expect(row?.uprootedAt).toBe('2026-09-10');
        expect(row?.uprootReason).toBe('Cycle end');
    });
    it('keeps never_planted distinct from planted-this-season vacant', () => {
        const planted = (0, cropHistoryAvailability_1.classifyFieldAvailability)({
            occupied: [],
            universe: ['B1'],
            plantedInWindow: true,
            uprootedInWindow: null,
        });
        expect(planted?.kind).toBe('never_planted');
        expect(planted?.plantedInWindow).toBe(true);
    });
});
describe('inSeasonWindow', () => {
    it('uses the date window so a previous season-close uproot is outside', () => {
        expect((0, cropHistoryAvailability_1.inSeasonWindow)('2026-07-31', '2026-09-01', '2027-07-31')).toBe(false);
        expect((0, cropHistoryAvailability_1.inSeasonWindow)('2026-09-08', '2026-09-01', '2027-07-31')).toBe(true);
        expect((0, cropHistoryAvailability_1.inSeasonWindow)(null, '2026-09-01', '2027-07-31')).toBe(false);
    });
});
describe('migration 149', () => {
    const sql = (0, fs_1.readFileSync)((0, path_1.join)(__dirname, '../../db/migrations/149_backfill_crop_history_from_occupancy.sql'), 'utf8');
    it('inserts one earliest occupancy row per field and is re-runnable', () => {
        expect(sql).toContain('DISTINCT ON (field_id)');
        expect(sql).toContain('WHERE NOT EXISTS');
        expect(sql).toContain('end_date IS NULL');
        expect(sql).toContain('COALESCE(pr.transplant_date, pr.seeding_date)');
        expect(sql).toContain('ofp.seeding_date AS occupancy_start');
        expect(sql).toContain('migrated_to_planting_record_id IS NULL');
        expect(sql).toContain('current_crop_id');
    });
});
describe('migration 150', () => {
    const sql = (0, fs_1.readFileSync)((0, path_1.join)(__dirname, '../../db/migrations/150_collapse_duplicate_open_crop_history.sql'), 'utf8');
    it('closes extra open rotations and restamps with a season guard', () => {
        expect(sql).toContain('ROW_NUMBER() OVER');
        expect(sql).toContain('r.rn > 1');
        expect(sql).toContain('season_id IS NOT DISTINCT FROM');
        expect(sql).toContain('NOT EXISTS');
        expect(sql).toContain('ch.id DESC');
    });
});
