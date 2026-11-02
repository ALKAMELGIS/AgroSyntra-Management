import { buildRc108ExportSheets, buildRc108SheetRows, uniqueLocationHeaders } from '../irrigationExcelExport';

const locations = [
  { label: 'NH 1', fieldId: 'f1', valveRange: '' },
  { label: 'NH 1', fieldId: 'f2', valveRange: '' },
];

const entries = [
  {
    date: '2026-06-01',
    weekNumber: 23,
    method: 'Drip',
    flowRateM3: 12,
    operatorName: 'Ali',
    authorizedBy: 'OM',
    locationLabel: 'NH 1',
    fieldId: 'f1',
    valveRange: '',
    waterQtyM3: 10,
    frequency: 2,
    fertilizerType: 'NPK',
    fertilizerQty: 1,
  },
];

describe('uniqueLocationHeaders', () => {
  it('prefixes location columns and uniquifies shared labels', () => {
    const headers = uniqueLocationHeaders(locations);
    expect(headers[0].keys.waterQty).toBe('NH 1 Water Qty');
    expect(headers[1].keys.waterQty).toBe('NH 1 #2 Water Qty');
    expect(Object.keys(buildRc108SheetRows(entries, locations)[0])).toEqual(
      expect.arrayContaining(['NH 1 Water Qty', 'NH 1 #2 Water Qty', 'Date', 'Flow (m3)']),
    );
  });
});

describe('buildRc108ExportSheets', () => {
  it('builds one sheet per selected structure with location prefixes', () => {
    const sheets = buildRc108ExportSheets({
      entries,
      structureLocations: { nethouse: locations, greenhouse: [], openfield: [] },
      selectedStructures: ['nethouse', 'greenhouse'],
    });
    expect(sheets).toHaveLength(1);
    expect(sheets[0].sheetName).toBe('Nethouse');
    expect(sheets[0].freezeCols).toBe(6);
    expect(sheets[0].rows[0].Date).toBe('2026-06-01');
    expect(sheets[0].rows[0]['NH 1 Water Qty']).toBe(10);
    expect(sheets[0].rows[0]['NH 1 Daily m3']).toBe(20);
    expect(sheets[0].rows[0]['Flow (m3)']).toBe(12);
  });

  it('skips empty structures', () => {
    expect(buildRc108ExportSheets({
      entries: [],
      structureLocations: { nethouse: locations },
      selectedStructures: ['nethouse'],
    })).toEqual([]);
  });
});
