"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const manpowerDetailPivot_1 = require("../manpowerDetailPivot");
describe('normalizeActivity catalog map', () => {
    const columnMap = (0, manpowerDetailPivot_1.buildActivityPivotColumnMap)([
        { name: 'Harvesting Crates Cleaning', pivot_column: 'Crate Washing' },
        { name: 'Scouting', pivot_column: null },
    ]);
    it('prefers catalog pivot_column over fuzzy Harvesting match', () => {
        expect((0, manpowerDetailPivot_1.normalizeActivity)('Harvesting Crates Cleaning', columnMap)).toBe('Crate Washing');
    });
    it('falls back to fuzzy match when catalog has no mapping', () => {
        expect((0, manpowerDetailPivot_1.normalizeActivity)('Weeding & Cleaning', columnMap)).toBe('Weeding');
    });
    it('returns raw name when unmapped in catalog and no fuzzy match', () => {
        expect((0, manpowerDetailPivot_1.normalizeActivity)('Scouting', columnMap)).toBe('Scouting');
    });
});
describe('manpowerDetailPivot resolveRecordCrop', () => {
    it('uses field crop name when location maps to a field', () => {
        expect((0, manpowerDetailPivot_1.resolveRecordCrop)({
            variety: 'Arancia RZ',
            activity: 'Harvesting',
            field_crop_name: 'Tomato Plum',
        })).toBe('Tomato Plum');
    });
    it('falls back to variety crop when field crop missing', () => {
        expect((0, manpowerDetailPivot_1.resolveRecordCrop)({
            variety: 'Arancia RZ',
            activity: 'Harvesting',
            variety_crop_name: 'Tomato Cherry',
        })).toBe('Tomato Cherry');
    });
    it('general activities map to General', () => {
        expect((0, manpowerDetailPivot_1.resolveRecordCrop)({
            variety: 'Arancia RZ',
            activity: 'Supervisor',
            field_crop_name: 'Tomato Plum',
        })).toBe('General');
    });
    it('crate washing catalog mapping moves record to General row', () => {
        const columnMap = (0, manpowerDetailPivot_1.buildActivityPivotColumnMap)([
            { name: 'Harvesting Crates Cleaning', pivot_column: 'Crate Washing' },
        ]);
        expect((0, manpowerDetailPivot_1.resolveRecordCrop)({
            variety: 'Arancia RZ',
            activity: 'Harvesting Crates Cleaning',
            field_crop_name: 'Tomato Plum',
        }, columnMap)).toBe('General');
    });
    it('buildPivotMapsFromRows sets cell crop from field', () => {
        const maps = (0, manpowerDetailPivot_1.buildPivotMapsFromRows)([
            {
                record_date: '2026-07-29',
                variety: 'Arancia RZ',
                activity: 'Harvesting',
                location: 'GH-1',
                field_crop_name: 'Tomato Plum',
                worker_id: 'w1',
                worker_category: 'Permanent',
                hours: 4,
            },
        ]);
        const cells = (0, manpowerDetailPivot_1.pivotMapsToCells)(maps);
        expect(cells[0].crop).toBe('Tomato Plum');
        expect(cells[0].eagHours).toBe(4);
    });
});
describe('manpowerDetailPivot hours aggregation', () => {
    it('sums hours per bucket and splits worker across two crops', () => {
        const maps = (0, manpowerDetailPivot_1.buildPivotMapsFromRows)([
            {
                record_date: '2026-08-01',
                variety: 'V1',
                activity: 'Harvesting',
                field_crop_name: 'Tomato Beef',
                worker_id: 'w1',
                worker_category: 'Permanent',
                hours: 4,
                location: 'NH 01',
            },
            {
                record_date: '2026-08-01',
                variety: 'V2',
                activity: 'Harvesting',
                field_crop_name: 'Snack Cucumber',
                worker_id: 'w1',
                worker_category: 'Permanent',
                hours: 3,
                location: 'NH 02',
            },
        ]);
        const cells = (0, manpowerDetailPivot_1.pivotMapsToCells)(maps);
        const beef = cells.find((c) => c.crop === 'Tomato Beef');
        const cuc = cells.find((c) => c.crop === 'Snack Cucumber');
        expect(beef?.eag).toBe(1);
        expect(beef?.eagHours).toBe(4);
        expect(cuc?.eag).toBe(1);
        expect(cuc?.eagHours).toBe(3);
    });
    it('counts missing hours without inflating totals', () => {
        const maps = (0, manpowerDetailPivot_1.buildPivotMapsFromRows)([
            {
                record_date: '2026-08-01',
                variety: 'V1',
                activity: 'Harvesting',
                field_crop_name: 'Tomato Beef',
                worker_id: 'w1',
                worker_category: 'Casual',
                hours_missing: true,
            },
        ]);
        expect(maps.missingHoursCount).toBe(1);
        const cells = (0, manpowerDetailPivot_1.pivotMapsToCells)(maps);
        expect(cells[0].casualHours).toBe(0);
        expect(cells[0].missingHours).toBe(1);
    });
    it('drill-down filter matches pivot cell totals', () => {
        const raw = [
            {
                record_date: '2026-08-01',
                variety: 'V1',
                activity: 'Harvesting',
                field_crop_name: 'Tomato Beef',
                worker_id: 'w1',
                worker_category: 'Permanent',
                hours: 5,
                location: 'NH 01',
                section: 'A',
                worker_name: 'Ali',
                employee_id: 'E1',
            },
            {
                record_date: '2026-08-02',
                variety: 'V1',
                activity: 'Harvesting',
                field_crop_name: 'Tomato Beef',
                worker_id: 'w2',
                worker_category: 'Casual',
                hours: 3,
                location: 'NH 02',
                section: 'B',
                worker_name: 'Bob',
                employee_id: 'E2',
            },
        ];
        const maps = (0, manpowerDetailPivot_1.buildPivotMapsFromRows)(raw);
        const cells = (0, manpowerDetailPivot_1.pivotMapsToCells)(maps);
        const matching = cells.filter((c) => c.crop === 'Tomato Beef' && c.activity === 'Harvesting');
        const cellHours = matching.reduce((s, c) => s + (c.eagHours || 0) + (c.casualHours || 0), 0);
        const cellWorkers = matching.reduce((s, c) => s + c.eag + c.casual, 0);
        const resolved = (0, manpowerDetailPivot_1.resolveAndNormalizeRows)(raw);
        const filtered = (0, manpowerDetailPivot_1.filterRowsForCell)(resolved, {
            crop: 'Tomato Beef',
            activity: 'Harvesting',
            groupBy: 'crop',
        });
        const grouped = (0, manpowerDetailPivot_1.groupRowsForDrillDown)(filtered);
        const drillHours = grouped.reduce((s, r) => s + r.hours, 0);
        const drillWorkers = new Set(filtered.map((r) => r.workerId)).size;
        expect(drillHours).toBe(cellHours);
        expect(drillWorkers).toBe(cellWorkers);
    });
    it('productivityForCells refuses mixed units', () => {
        const cells = (0, manpowerDetailPivot_1.pivotMapsToCells)((0, manpowerDetailPivot_1.buildPivotMapsFromRows)([
            {
                record_date: '2026-08-01',
                variety: 'V1',
                activity: 'Harvesting',
                field_crop_name: 'Tomato Beef',
                worker_id: 'w1',
                worker_category: 'Permanent',
                hours: 4,
                actual: 10,
                unit: 'kg',
            },
            {
                record_date: '2026-08-02',
                variety: 'V1',
                activity: 'Harvesting',
                field_crop_name: 'Tomato Beef',
                worker_id: 'w2',
                worker_category: 'Permanent',
                hours: 2,
                actual: 5,
                unit: 'boxes',
            },
        ]));
        const prod = (0, manpowerDetailPivot_1.productivityForCells)(cells, 'Tomato Beef', 'Harvesting', 'crop');
        expect(prod.mixedUnits).toBe(true);
        expect(prod.hoursPerUnit).toBeNull();
    });
});
