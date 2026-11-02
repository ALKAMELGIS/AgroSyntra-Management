import { uniquePumpHeaders, buildPumpMonthRows, buildPumpExportSheets } from '../pumpRoomExcelExport';
import { computePumpTotals, pumpCellUsage } from '../pumpRoomMath';

describe('uniquePumpHeaders', () => {
  it('suffixes duplicate pump labels', () => {
    const headers = uniquePumpHeaders(['Pump 1', 'Pump 1'], 2);
    expect(headers[0].reading).toBe('Pump 1 Reading');
    expect(headers[1].reading).toBe('Pump 1 #2 Reading');
  });
});

describe('pump usage split', () => {
  it('leaves the first row usage blank and falls back to stored usage', () => {
    expect(pumpCellUsage({ reading: 10, usage: 3 }, null, true)).toBeNull();
    expect(pumpCellUsage({ reading: 20 }, { reading: 10 }, false)).toBe(10);
    expect(pumpCellUsage({ usage: 4 }, { reading: null }, false)).toBe(4);
  });

  it('totals only reading deltas', () => {
    const records = [
      { pumps: [{ reading: 10 }] },
      { pumps: [{ reading: 25 }] },
      { pumps: [{ reading: 40 }] },
    ];
    expect(computePumpTotals(records, 1)[0]).toBe(30);
  });
});

describe('buildPumpMonthRows', () => {
  it('uses a Date header with ISO values and a Total footer', () => {
    const rows = buildPumpMonthRows([
      { id: 'a', record_date: '2026-01-02', meter_id: 'M1', usage_area: 'GH', pumps: [{ reading: 10 }] },
      { id: 'b', record_date: '2026-01-03', meter_id: 'M1', usage_area: 'GH', pumps: [{ reading: 18 }] },
    ], { pumpLabels: ['Pump 1'], pumpCount: 1 });
    expect(rows[0].Date).toBe('2026-01-02');
    expect(rows[0]['Pump 1 Usage']).toBe('');
    expect(rows[1]['Pump 1 Usage']).toBe(8);
    expect(rows[2]['Meter ID']).toBe('Total');
    expect(rows[2]['Pump 1 Usage']).toBe(8);
  });
});

describe('buildPumpExportSheets', () => {
  it('skips months with no rows', () => {
    expect(buildPumpExportSheets([], { selectedMonths: ['2026-01'], pumpCount: 1 })).toEqual([]);
  });
});
