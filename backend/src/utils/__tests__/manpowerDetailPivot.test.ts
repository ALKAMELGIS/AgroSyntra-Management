import {
  buildActivityPivotColumnMap,
  buildPivotMapsFromRows,
  normalizeActivity,
  pivotMapsToCells,
  resolveRecordCrop,
  resolveAndNormalizeRows,
  filterRowsForCell,
  groupRowsForDrillDown,
  productivityForCells,
} from '../manpowerDetailPivot';

describe('normalizeActivity catalog map', () => {
  const columnMap = buildActivityPivotColumnMap([
    { name: 'Harvesting Crates Cleaning', pivot_column: 'Crate Washing' },
    { name: 'Scouting', pivot_column: null },
  ]);

  it('prefers catalog pivot_column over fuzzy Harvesting match', () => {
    expect(normalizeActivity('Harvesting Crates Cleaning', columnMap)).toBe('Crate Washing');
  });

  it('falls back to fuzzy match when catalog has no mapping', () => {
    expect(normalizeActivity('Weeding & Cleaning', columnMap)).toBe('Weeding');
  });

  it('returns raw name when unmapped in catalog and no fuzzy match', () => {
    expect(normalizeActivity('Scouting', columnMap)).toBe('Scouting');
  });
});

describe('manpowerDetailPivot resolveRecordCrop', () => {
  it('uses field crop name when location maps to a field', () => {
    expect(resolveRecordCrop({
      variety: 'Arancia RZ',
      activity: 'Harvesting',
      field_crop_name: 'Tomato Plum',
    })).toBe('Tomato Plum');
  });

  it('does not inherit field crop when variety is empty (Excel Crop 0)', () => {
    expect(resolveRecordCrop({
      variety: '',
      activity: 'Hook installation',
      field_crop_name: 'Bunch Tomato',
    })).toBe('No Crop');
  });

  it('does not inherit field crop when variety is 0 or dash', () => {
    expect(resolveRecordCrop({
      variety: '0',
      activity: 'Hook installation',
      field_crop_name: 'Bunch Tomato',
    })).toBe('No Crop');
    expect(resolveRecordCrop({
      variety: '-',
      activity: 'Transportation',
      field_crop_name: 'Bunch Tomato',
    })).toBe('No Crop');
  });

  it('still uses field crop when a real variety is set', () => {
    expect(resolveRecordCrop({
      variety: 'Astronaut',
      activity: 'Harvesting',
      field_crop_name: 'Bunch Tomato',
    })).toBe('Bunch Tomato');
  });

  it('falls back to variety crop when field crop missing', () => {
    expect(resolveRecordCrop({
      variety: 'Arancia RZ',
      activity: 'Harvesting',
      variety_crop_name: 'Tomato Cherry',
    })).toBe('Tomato Cherry');
  });

  it('general activities map to General', () => {
    expect(resolveRecordCrop({
      variety: 'Arancia RZ',
      activity: 'Supervisor',
      field_crop_name: 'Tomato Plum',
    })).toBe('General');
  });

  it('crate washing catalog mapping moves record to General row', () => {
    const columnMap = buildActivityPivotColumnMap([
      { name: 'Harvesting Crates Cleaning', pivot_column: 'Crate Washing' },
    ]);
    expect(resolveRecordCrop({
      variety: 'Arancia RZ',
      activity: 'Harvesting Crates Cleaning',
      field_crop_name: 'Tomato Plum',
    }, columnMap)).toBe('General');
  });

  it('buildPivotMapsFromRows sets cell crop from field', () => {
    const maps = buildPivotMapsFromRows([
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
    const cells = pivotMapsToCells(maps);
    expect(cells[0].crop).toBe('Tomato Plum');
    expect(cells[0].eagHours).toBe(4);
  });
});

describe('manpowerDetailPivot hours aggregation', () => {
  it('sums hours per bucket and splits worker across two crops', () => {
    const maps = buildPivotMapsFromRows([
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
    const cells = pivotMapsToCells(maps);
    const beef = cells.find((c) => c.crop === 'Tomato Beef');
    const cuc = cells.find((c) => c.crop === 'Snack Cucumber');
    expect(beef?.eag).toBe(1);
    expect(beef?.eagHours).toBe(4);
    expect(cuc?.eag).toBe(1);
    expect(cuc?.eagHours).toBe(3);
  });

  it('counts missing hours without inflating totals', () => {
    const maps = buildPivotMapsFromRows([
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
    const cells = pivotMapsToCells(maps);
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
    const maps = buildPivotMapsFromRows(raw);
    const cells = pivotMapsToCells(maps);
    const matching = cells.filter((c) => c.crop === 'Tomato Beef' && c.activity === 'Harvesting');
    const cellHours = matching.reduce((s, c) => s + (c.eagHours || 0) + (c.casualHours || 0), 0);
    const cellWorkers = matching.reduce((s, c) => s + c.eag + c.casual, 0);

    const resolved = resolveAndNormalizeRows(raw);
    const filtered = filterRowsForCell(resolved, {
      crop: 'Tomato Beef',
      activity: 'Harvesting',
      groupBy: 'crop',
    });
    const grouped = groupRowsForDrillDown(filtered);

    const drillHours = grouped.reduce((s, r) => s + r.hours, 0);
    const drillWorkers = new Set(filtered.map((r) => r.workerId)).size;

    expect(drillHours).toBe(cellHours);
    expect(drillWorkers).toBe(cellWorkers);
  });

  it('productivityForCells refuses mixed units', () => {
    const cells = pivotMapsToCells(buildPivotMapsFromRows([
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
    const prod = productivityForCells(cells, 'Tomato Beef', 'Harvesting', 'crop');
    expect(prod.mixedUnits).toBe(true);
    expect(prod.hoursPerUnit).toBeNull();
  });
});
