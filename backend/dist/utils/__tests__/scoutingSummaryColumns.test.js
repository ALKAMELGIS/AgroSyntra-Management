"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const scoutingSummaryColumns_1 = require("../scoutingSummaryColumns");
describe('scoutingSummaryColumns', () => {
    it('detects BL block column profile', () => {
        expect((0, scoutingSummaryColumns_1.getColumnProfile)('BL-7A')).toBe('bl_block');
        expect((0, scoutingSummaryColumns_1.getColumnProfile)('NH 01')).toBe('standard');
    });
    it('builds bio columns from catalog master data', () => {
        const columns = (0, scoutingSummaryColumns_1.buildBioColumnsFromCatalog)([
            { name: 'Swriski', match_pattern: 'SWIRSKI', sort_order: 1 },
            { name: 'Spidex', match_pattern: 'SPIDEX', sort_order: 2 },
        ]);
        expect(columns).toHaveLength(2);
        expect(columns[0].header).toBe('Swriski');
        expect(columns[0].bioProductPattern).toBe('SWIRSKI');
        expect(columns[1].header).toBe('Spidex');
        const profileColumns = (0, scoutingSummaryColumns_1.getColumnsForProfile)('standard', columns);
        expect(profileColumns.some((c) => c.key === 'swriski' && c.kind === 'bio')).toBe(true);
    });
    it('falls back to default bio columns when catalog is empty', () => {
        const columns = (0, scoutingSummaryColumns_1.buildBioColumnsFromCatalog)([]);
        expect(columns).toHaveLength(4);
        expect(columns[0].header).toBe('Swriski');
    });
    it('includes bio columns only for standard profile', () => {
        const standard = (0, scoutingSummaryColumns_1.getColumnsForProfile)('standard');
        const bl = (0, scoutingSummaryColumns_1.getColumnsForProfile)('bl_block');
        expect(standard.some((c) => c.key === 'swriski')).toBe(true);
        expect(bl.some((c) => c.key === 'swriski')).toBe(false);
        expect(bl.some((c) => c.key === 'worm')).toBe(true);
        expect(standard.some((c) => c.key === 'mealybug')).toBe(true);
    });
    it('extracts abbreviation from pest name', () => {
        expect((0, scoutingSummaryColumns_1.extractAbbrFromPestName)('Mite adult (MA)')).toBe('MA');
        expect((0, scoutingSummaryColumns_1.extractAbbrFromPestName)('Thrips')).toBeNull();
    });
    it('derives observation total from counts when total is missing', () => {
        expect((0, scoutingSummaryColumns_1.deriveObservationTotal)({
            pestName: 'Mite adult (MA)',
            category: 'insect',
            count1: 1,
            count2: 1,
        })).toBe(2);
    });
    it('sums totals for duplicate pest rows on one report', () => {
        const columns = (0, scoutingSummaryColumns_1.getColumnsForProfile)('standard');
        const metrics = (0, scoutingSummaryColumns_1.aggregateObservationMetrics)([
            { pestName: 'Mite adult (MA)', category: 'insect', total: 1 },
            { pestName: 'Mite adult (MA)', category: 'insect', total: 1 },
            { pestName: 'Thrips (T)', category: 'insect', total: 3 },
        ], columns);
        expect(metrics.mite).toBe(2);
        expect(metrics.thrips).toBe(3);
    });
    it('matches diseases by abbreviation and name patterns', () => {
        const columns = (0, scoutingSummaryColumns_1.getColumnsForProfile)('standard');
        const botrytis = columns.find((c) => c.key === 'botrytis');
        const bSpot = columns.find((c) => c.key === 'b_spot');
        expect((0, scoutingSummaryColumns_1.observationMatchesColumn)({ pestName: 'Botrytis (B)', category: 'disease' }, botrytis)).toBe(true);
        expect((0, scoutingSummaryColumns_1.observationMatchesColumn)({ pestName: 'Bacterial Spot', category: 'disease' }, bSpot)).toBe(true);
    });
    it('matches bio products by name or item code', () => {
        expect((0, scoutingSummaryColumns_1.bioProductMatchesPattern)('SWIRSKI-MITE/50.000/500ml', '05405', 'SWIRSKI')).toBe(true);
        expect((0, scoutingSummaryColumns_1.bioProductMatchesPattern)('Spidex /10000/500 ML', 'SPD10K', 'SPIDEX')).toBe(true);
        expect((0, scoutingSummaryColumns_1.bioProductMatchesPattern)('Other product', 'FOO', 'SPIDEX')).toBe(false);
    });
    it('aligns scouting dates to ISO weeks for bio lookup', () => {
        const reportDate = '2025-11-19';
        const bioWeek = (0, scoutingSummaryColumns_1.getIsoWeekAndYear)(reportDate);
        const entryWeek = (0, scoutingSummaryColumns_1.getIsoWeekAndYear)('2025-11-20');
        expect(bioWeek.week).toBe(entryWeek.week);
        expect(bioWeek.year).toBe(2025);
    });
});
describe('scoutingSummary aggregation scenarios', () => {
    it('builds row metrics for two reports with two pests', () => {
        const columns = (0, scoutingSummaryColumns_1.getColumnsForProfile)('standard');
        const reportOne = (0, scoutingSummaryColumns_1.aggregateObservationMetrics)([
            { pestName: 'Mite adult (MA)', category: 'insect', total: 2 },
            { pestName: 'Thrips (T)', category: 'insect', total: 1 },
        ], columns);
        const reportTwo = (0, scoutingSummaryColumns_1.aggregateObservationMetrics)([{ pestName: 'Mite adult (MA)', category: 'insect', total: 4 }], columns);
        expect(reportOne.mite).toBe(2);
        expect(reportOne.thrips).toBe(1);
        expect(reportTwo.mite).toBe(4);
        expect(reportTwo.thrips).toBeNull();
    });
});
