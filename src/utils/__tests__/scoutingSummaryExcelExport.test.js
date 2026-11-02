import { buildScoutingFieldRows, buildScoutingSummarySheets } from '../scoutingSummaryExcelExport';

const COLUMNS = [
  { key: 'location', header: 'Location', kind: 'meta' },
  { key: 'crop', header: 'Crop', kind: 'meta' },
  { key: 'scouting_date', header: 'Scouting Date', kind: 'meta' },
  { key: 'mite', header: 'Mite', kind: 'observation' },
  { key: 'thrips', header: 'Thrips', kind: 'observation' },
  { key: 'notes', header: 'Notes', kind: 'notes' },
];

describe('buildScoutingSummarySheets', () => {
  it('emits one sheet per field with data and omits empty fields', () => {
    const sheets = buildScoutingSummarySheets({
      visibleFields: [
        {
          fieldId: 'f1',
          fieldName: 'NH05',
          columns: COLUMNS,
          rows: [{ location: 'Bay 1', cropName: 'Tomato', reportDate: '2026-06-15', metrics: { mite: 2 }, notes: 'ok' }],
        },
        {
          fieldId: 'f2',
          fieldName: 'NH06',
          columns: COLUMNS,
          rows: [],
        },
        {
          fieldId: 'f3',
          fieldName: 'BL-01',
          columns: COLUMNS,
          rows: [{ cropName: 'Cucumber', reportDate: '2026-07-01T00:00:00Z', metrics: { thrips: 1 } }],
        },
      ],
    });
    expect(sheets.map((s) => s.sheetName)).toEqual(['NH05', 'BL-01']);
    expect(sheets[0].rows).toHaveLength(1);
    expect(sheets[1].rows).toHaveLength(1);
    expect(sheets[0].rows[0]['Scouting Date']).toBe('15/06/2026');
    expect(sheets[1].rows[0]['Scouting Date']).toBe('01/07/2026');
    expect(sheets[1].rows[0].Location).toBe('BL-01');
    expect(sheets.every((s) => s.rows.every((row) => Object.values(row).some((v) => v !== '')))).toBe(true);
  });

  it('returns no sheets when every field is empty', () => {
    expect(buildScoutingSummarySheets({
      visibleFields: [{ fieldName: 'NH05', columns: COLUMNS, rows: [] }],
    })).toEqual([]);
  });

  it('uniquifies duplicate field sheet names', () => {
    const sheets = buildScoutingSummarySheets({
      visibleFields: [
        { fieldId: 'a', fieldName: 'NH05', columns: COLUMNS, rows: [{ reportDate: '2026-01-01' }] },
        { fieldId: 'b', fieldName: 'NH05', columns: COLUMNS, rows: [{ reportDate: '2026-01-02' }] },
      ],
    });
    expect(sheets.map((s) => s.sheetName)).toEqual(['NH05', 'NH05 (2)']);
  });
});

describe('buildScoutingFieldRows', () => {
  it('keeps every column key when the first row has empty metrics', () => {
    const rows = buildScoutingFieldRows({
      fieldName: 'NH05',
      columns: [
        ...COLUMNS,
        { key: 'extra', header: 'Mite', kind: 'observation' },
      ],
      rows: [
        { location: 'A', cropName: 'Tomato', reportDate: '2026-03-01', metrics: {} },
        { location: 'B', cropName: 'Tomato', reportDate: '2026-03-02', metrics: { extra: 4 } },
      ],
    });
    expect(Object.keys(rows[0])).toEqual([
      'Location', 'Crop', 'Scouting Date', 'Mite', 'Thrips', 'Notes', 'Mite #2',
    ]);
    expect(Object.keys(rows[1])).toEqual(Object.keys(rows[0]));
    expect(rows[0]['Mite #2']).toBe('');
    expect(rows[1]['Mite #2']).toBe(4);
    expect(rows[0]['Scouting Date']).toBe('01/03/2026');
    expect(typeof rows[1]['Mite #2']).toBe('number');
  });

  it('does not insert blank spacer rows', () => {
    const rows = buildScoutingFieldRows({
      fieldName: 'NH05',
      columns: COLUMNS,
      rows: [
        { reportDate: '2026-01-01', metrics: { mite: 1 } },
        { reportDate: '2026-01-02', metrics: { mite: 2 } },
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row['Scouting Date'])).toBe(true);
  });
});
