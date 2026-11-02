import {
  bioExportFilename,
  buildBioEntrySheetRows,
  buildBioExportSheets,
  buildBioFieldSummaryRows,
  entriesByProductWeek,
  excelSheetName,
} from '../bioControlExcelExport';

describe('export uses approved values only', () => {
  it('ignores pending values waiting for approval', () => {
    const map = entriesByProductWeek([
      { product_column_id: 'p1', week_number: 1, per_m2: '2', units: '5', pending_units: '99', pending_at: '2026-09-01' },
      { product_column_id: 'p1', week_number: 2, per_m2: null, units: null, pending_units: '7', pending_at: '2026-09-01' },
    ]);
    expect(map.p1_1).toEqual({ perM2: 2, units: 5 });
    expect(map.p1_2).toEqual({ perM2: 0, units: 0 });
  });
});

const products = [
  {
    id: 'p1',
    product_name: 'APHIDEND',
    item_code: '025000',
    uom_name: 'ml',
    per_package: 100,
    price_per_package: 10,
  },
  {
    id: 'p2',
    product_name: 'APHIDEND',
    item_code: '025000',
    uom_name: 'ml',
    per_package: 100,
    price_per_package: 10,
  },
];

const entries = [
  { product_column_id: 'p1', week_number: 1, per_m2: 5, units: 3 },
  { product_column_id: 'p1', week_number: 2, per_m2: 0, units: 1 },
];

describe('excelSheetName', () => {
  it('strips illegal characters and uniquifies after truncate', () => {
    const used = new Set();
    expect(excelSheetName('NH/05:A', used)).toBe('NH 05 A');
    expect(excelSheetName('NH 05 A', used)).toBe('NH 05 A (2)');
  });
});

describe('buildBioEntrySheetRows', () => {
  it('uses units times site price and keeps a stable header on every row', () => {
    const rows = buildBioEntrySheetRows({
      setup: { start_date: '2026-06-01', week_count: 2 },
      products,
      entries,
      weekNumbers: [1, 2],
    });
    const keys = Object.keys(rows[0]);
    expect(keys).toEqual(Object.keys(rows[rows.length - 1]));
    expect(keys.some((key) => key.includes('#2'))).toBe(true);
    const cost = rows.find((row) => row.Wk === 'COST');
    const unitsKey = keys.find((key) => key.startsWith('APHIDEND (025000) # units'));
    expect(cost[unitsKey]).toBe(40);
  });

  it('still emits week rows when there are no products', () => {
    const rows = buildBioEntrySheetRows({
      setup: { start_date: '2026-06-01', week_count: 2 },
      products: [],
      entries: [],
      weekNumbers: [1, 2],
    });
    expect(rows.length).toBe(4);
    expect(rows[0].Wk).toBe(1);
    expect(rows[2].Wk).toBe('TOTAL');
  });
});

describe('buildBioFieldSummaryRows', () => {
  it('totals the same weeks and keeps a row when products are empty', () => {
    const withProducts = buildBioFieldSummaryRows({
      products: [products[0]],
      entries,
      weekNumbers: [1],
    });
    expect(withProducts[0]['Total units']).toBe(3);
    expect(withProducts[0]['Total cost']).toBe(30);
    expect(withProducts.find((row) => row.Product === 'COST')['Total cost']).toBe(30);

    const empty = buildBioFieldSummaryRows({ products: [], entries: [], weekNumbers: [1] });
    expect(empty.length).toBeGreaterThanOrEqual(3);
    expect(empty[0]).toHaveProperty('Product');
  });
});

describe('buildBioExportSheets', () => {
  it('orders Entry then SUMMARY per field', () => {
    const sheets = buildBioExportSheets([
      {
        fieldName: 'NH05',
        setup: { start_date: '2026-06-01', week_count: 2 },
        products: [products[0]],
        entries,
      },
      {
        fieldName: 'NH07',
        setup: { start_date: '2026-06-01', week_count: 2 },
        products: [products[0]],
        entries: [],
      },
    ]);
    expect(sheets.map((sheet) => sheet.sheetName)).toEqual([
      'NH05',
      'NH05 SUMMARY',
      'NH07',
      'NH07 SUMMARY',
    ]);
    expect(sheets[0].title).toContain('NH05');
    expect(sheets[1].title).toContain('NH05 SUMMARY');
    expect(sheets[0].rows.length).toBeGreaterThan(0);
    expect(sheets[1].rows.length).toBeGreaterThan(0);
  });
});

describe('bioExportFilename', () => {
  it('uses ASCII hyphens', () => {
    expect(bioExportFilename('Table Tomato', '2025-2026')).toBe(
      'Biological-Control-Table-Tomato-2025-2026.xlsx',
    );
  });
});
