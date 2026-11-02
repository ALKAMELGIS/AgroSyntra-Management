import {
  cellToWeekNumber,
  detectHarvestColumns,
  harvestRowHasSubstance,
  parseDateValue,
  parseHarvestDataRows,
  shouldSkipHarvestSheet,
} from '../harvestImportParse';

describe('shouldSkipHarvestSheet', () => {
  it('skips sheet names that start with summary', () => {
    expect(shouldSkipHarvestSheet('Summary')).toBe(true);
    expect(shouldSkipHarvestSheet('SUMMARY')).toBe(true);
    expect(shouldSkipHarvestSheet('Summary GH')).toBe(true);
  });

  it('keeps greenhouse and non-graded harvest sheets', () => {
    expect(shouldSkipHarvestSheet('GH-A01')).toBe(false);
    expect(shouldSkipHarvestSheet('Nahel')).toBe(false);
    expect(shouldSkipHarvestSheet('Non-Graded F&V')).toBe(false);
  });
});

describe('cellToWeekNumber', () => {
  it('keeps optional week as a short string', () => {
    expect(cellToWeekNumber(null)).toBe('');
    expect(cellToWeekNumber('')).toBe('');
    expect(cellToWeekNumber(12)).toBe('12');
    expect(cellToWeekNumber(' 7 ')).toBe('7');
  });

  it('truncates values longer than 20 characters', () => {
    expect(cellToWeekNumber('12345678901234567890123')).toBe('12345678901234567890');
  });
});

describe('harvestRowHasSubstance', () => {
  it('treats pre-formatted ghost lines as empty', () => {
    expect(harvestRowHasSubstance({
      dateCell: '',
      quantity: 0,
      variety: '',
      product: '',
      fieldName: '',
    })).toBe(false);
  });

  it('keeps a row with its own date, quantity, variety, or field', () => {
    expect(harvestRowHasSubstance({ dateCell: '15/09/2025', quantity: 0, variety: '', product: '', fieldName: '' })).toBe(true);
    expect(harvestRowHasSubstance({ dateCell: '', quantity: 12, variety: '', product: '', fieldName: '' })).toBe(true);
    expect(harvestRowHasSubstance({ dateCell: '', quantity: 0, variety: 'Tomato', product: '', fieldName: '' })).toBe(true);
    expect(harvestRowHasSubstance({ dateCell: '', quantity: 0, variety: '', product: 'Tomato', fieldName: '' })).toBe(true);
    expect(harvestRowHasSubstance({ dateCell: '', quantity: 0, variety: '', product: '', fieldName: 'GH-A01' })).toBe(true);
  });
});

describe('detectHarvestColumns', () => {
  it('maps Week Number separately from Shift No', () => {
    const columns = detectHarvestColumns([
      'Date of Harvest',
      'Week Number',
      'Shift No',
      'Quantity Harvested (Kg)',
      'Variety',
    ]);
    expect(columns.date).toBe(0);
    expect(columns.weekNumber).toBe(1);
    expect(columns.shiftNumber).toBe(2);
    expect(columns.quantity).toBe(3);
    expect(columns.variety).toBe(4);
  });

  it('does not treat a bare Week header as week number', () => {
    const columns = detectHarvestColumns(['Date', 'Week', 'Quantity']);
    expect(columns.weekNumber).toBeUndefined();
  });
});

describe('parseHarvestDataRows', () => {
  const header = [
    'Date of Harvest',
    'Week Number',
    'Shift No',
    'Quantity Harvested (Kg)',
    'Variety',
    'Field Name',
  ];

  it('skips ghost template rows and keeps quantity continuations', () => {
    const rows = parseHarvestDataRows(
      [
        header,
        ['', 0, '', 0, '', ''],
        ['15/09/2025', 12, '1', 25, 'Tomato', 'GH-A01'],
        ['', 12, '1', 10, 'Tomato', 'GH-A01'],
        ['', 0, '', 0, '', ''],
      ],
      0,
      detectHarvestColumns(header),
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      date: '2025-09-15',
      weekNumber: '12',
      shiftNumber: '1',
      quantity: 25,
    });
    expect(rows[1]).toMatchObject({
      date: '2025-09-15',
      weekNumber: '12',
      shiftNumber: '1',
      quantity: 10,
    });
    expect(rows[0].shiftNumber).not.toBe(rows[0].weekNumber);
  });

  it('does not copy week into shift when shift is blank', () => {
    const rows = parseHarvestDataRows(
      [
        header,
        ['16/09/2025', '8', '', 4, 'Cucumber', 'GH-B02'],
      ],
      0,
      detectHarvestColumns(header),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].weekNumber).toBe('8');
    expect(rows[0].shiftNumber).toBe('');
  });
});

describe('parseDateValue', () => {
  it('parses DMY text and Excel serials', () => {
    expect(parseDateValue('15/09/2025')).toBe('2025-09-15');
    expect(parseDateValue(45915)).toBe('2025-09-15');
  });
});
