import {
  sheetNameToMonth,
  shouldSkipSheet,
  extractYearFromFilename,
  parseDateInput,
  detectIrrigationHeaderRow,
  detectIrrigationColumns,
  normalizeFieldName,
  buildFieldLookup,
  parseMonthSheetRows,
  resolveField,
  resolveHarvestField,
  greenhouseFieldKey,
} from '../utils/irrigationImportParser';

describe('irrigationImportParser', () => {
  test('sheetNameToMonth handles abbreviations and case', () => {
    expect(sheetNameToMonth('Jan')).toBe(1);
    expect(sheetNameToMonth('feb')).toBe(2);
    expect(sheetNameToMonth('APR')).toBe(4);
    expect(sheetNameToMonth('December')).toBe(12);
    expect(sheetNameToMonth('SUMMARY')).toBeNull();
  });

  test('shouldSkipSheet ignores summary and calc tabs', () => {
    expect(shouldSkipSheet('SUMMARY')).toBe(true);
    expect(shouldSkipSheet('Sheet1')).toBe(true);
    expect(shouldSkipSheet('Feb')).toBe(false);
  });

  test('extractYearFromFilename', () => {
    expect(extractYearFromFilename('RC-133_Irrigation Record_2026.xlsx')).toBe(2026);
    expect(extractYearFromFilename('data.xlsx')).toBeNull();
  });

  test('parseDateInput supports dd/mm/yyyy and ddmmyyyy', () => {
    expect(parseDateInput('01/02/2026')).toBe('2026-02-01');
    expect(parseDateInput('01022026')).toBe('2026-02-01');
  });

  test('detectIrrigationHeaderRow finds RC-133 header', () => {
    const rows = [
      ['Banner'],
      [],
      ['Farm Name', '', 'Month and Year', 'February 2026'],
      [],
      ['Date (ddmmyyyy)', 'Field ID', 'Segment ID', 'Total Area', 'Crop', 'Volume', 'Flow Rate', 'Cycle Duration', 'Authorized'],
    ];
    expect(detectIrrigationHeaderRow(rows)).toBe(4);
  });

  test('detectIrrigationColumns maps RC-133 columns', () => {
    const header = ['Date (ddmmyyyy)', 'Field ID (Pivot)', ' Segment ID', 'Total Area (In Ha)', 'Crop',
      'Volume (per Water meter)', 'Flow Rate (m3/hr)', 'Cycle Duration', 'Authorized and Verified By'];
    const cols = detectIrrigationColumns(header);
    expect(cols.date).toBe(0);
    expect(cols.fieldName).toBe(1);
    expect(cols.flow).toBe(6);
    expect(cols.cycle).toBe(7);
  });

  test('parseMonthSheetRows skips daily TOTAL rows and continues parsing', () => {
    const fields = [{ id: 'field-1', name: '1' }];
    const lookup = buildFieldLookup(fields);
    const rows = [
      ['Date', 'Field ID', 'Segment', 'Area', 'Crop', 'Volume', 'Flow Rate', 'Cycle Duration', 'Auth'],
      ['07/01/2026', '1', 'LS', 10, 'Rhodes', 672, 168, 4, 'John'],
      ['', 'TOTAL', '', '', '', 672, '', '', ''],
      ['08/01/2026', '1', 'RS', 10, 'Rhodes', 600, 150, 4, 'John'],
      ['', 'TOTAL', '', '', '', 600, '', '', ''],
      ['', 'TOTAL', '', '', '', 1272, '', '', ''],
    ];
    const parsed = parseMonthSheetRows(rows, lookup);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].date).toBe('2026-01-07');
    expect(parsed.rows[1].date).toBe('2026-01-08');
  });

  test('parseMonthSheetRows skips TOTAL in date or field column', () => {
    const fields = [{ id: 'field-1', name: '1' }];
    const lookup = buildFieldLookup(fields);
    const rows = [
      ['Date', 'Field ID', 'Segment', 'Area', 'Crop', 'Volume', 'Flow Rate', 'Cycle Duration', 'Auth'],
      ['01/02/2026', '1', 'LS', 10, 'Rhodes', 672, 168, 4, 'John'],
      ['02/02/2026', '1', 'RS', 10, 'Rhodes', 600, 150, 4, 'John'],
      ['TOTAL', '', '', '', '', 1272, '', '', ''],
    ];
    const parsed = parseMonthSheetRows(rows, lookup);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].flowRateM3Hr).toBe(168);
    expect(parsed.rows[0].cycleDurationHr).toBe(4);
    expect(parsed.rows[0].computedVolume).toBe(672);
    expect(parsed.rows[0]._errors).toHaveLength(0);
  });

  test('parseMonthSheetRows flags unknown field', () => {
    const lookup = buildFieldLookup([]);
    const rows = [
      ['Date', 'Field ID', 'Segment', 'Area', 'Crop', 'Volume', 'Flow Rate', 'Cycle Duration', 'Auth'],
      ['01/02/2026', '99', 'LS', 10, 'Rhodes', 672, 168, 4, 'John'],
    ];
    const parsed = parseMonthSheetRows(rows, lookup);
    expect(parsed.rows[0]._errors.some((e) => e.includes('Unknown pivot'))).toBe(true);
  });

  test('normalizeFieldName strips pivot prefix and padding zeros', () => {
    expect(normalizeFieldName('Pivot 01')).toBe('1');
    expect(normalizeFieldName('1')).toBe('1');
    expect(normalizeFieldName('PIVOT-11')).toBe('11');
  });

  test('resolveField matches PIVOT-11 style names', () => {
    const fields = [{ id: 'field-11', name: 'Pivot 11' }];
    const lookup = buildFieldLookup(fields);
    expect(resolveField(lookup, 'PIVOT-11')?.id).toBe('field-11');
  });

  test('resolveHarvestField maps A01 to GH A1 and not Pivot 1', () => {
    const fields = [
      { id: 'pivot-1', name: 'Pivot 1' },
      { id: 'gh-a1', name: 'GH A1' },
      { id: 'gh-a2', name: 'GH A2' },
    ];
    expect(resolveHarvestField(fields, 'A01')?.id).toBe('gh-a1');
    expect(resolveHarvestField(fields, 'GH-A01')?.id).toBe('gh-a1');
    expect(resolveHarvestField(fields, 'GHA1')?.id).toBe('gh-a1');
    expect(resolveHarvestField(fields, 'A02')?.id).toBe('gh-a2');
    expect(resolveHarvestField(fields, 'Pivot 1')?.id).toBe('pivot-1');
    expect(resolveHarvestField(fields, '1')?.id).toBe('pivot-1');
  });

  test('greenhouseFieldKey treats padded GH codes as one house', () => {
    expect(greenhouseFieldKey('A01')).toBe('a1');
    expect(greenhouseFieldKey('GH A1')).toBe('a1');
    expect(greenhouseFieldKey('GH-A01')).toBe('a1');
    expect(greenhouseFieldKey('Pivot 1')).toBeNull();
    expect(greenhouseFieldKey('6')).toBeNull();
  });
});
