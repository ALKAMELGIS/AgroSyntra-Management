import {
  templateColumns,
  mapEntryToTemplateRow,
  buildTemplateExportSheets,
} from '../templateExcel';
import { fertigationGetters } from '../fertigationExcelExport';
import { toEcphExportSheets, mapEcphEntriesToExcelRows } from '../ecphExcelExport';

const FARM_PLOTS_CONFIG = {
  columns: [
    { key: 'fieldName', label: 'Field' },
    { key: 'valveNumber', label: 'Valve' },
    { key: 'time', label: 'Time' },
    { key: 'ecIn', label: 'EC In' },
    { key: 'phIn', label: 'pH In' },
    { key: 'dripVolume', label: 'Drip Vol' },
  ],
};

const FERTIGATION_STANDARD_CONFIG = {
  columns: [
    { key: 'fieldName', label: 'Field' },
    { key: 'currentCrop', label: 'Crop' },
    { key: 'recipeId', label: 'Recipe' },
    { key: 'operatorName', label: 'Operator' },
    { key: 'valves', label: 'Valves' },
    { key: 'flowRate', label: 'Flow Rate (m3/hr)' },
    { key: 'waterQty', label: 'Water Qty (M3/Valve)' },
    { key: 'frequency', label: 'Frequency' },
    { key: 'dailyTotal', label: 'Daily Total (m3)' },
    { key: 'totalFertilizer', label: 'Total Fert (kg)' },
  ],
};

describe('templateColumns', () => {
  it('prepends Date when the template does not have it', () => {
    const cols = templateColumns(FERTIGATION_STANDARD_CONFIG);
    expect(cols.map((c) => c.label)[0]).toBe('Date');
    expect(cols.some((c) => c.label === 'Field')).toBe(true);
    expect(cols.some((c) => c.label === 'Water Qty (M3/Valve)')).toBe(true);
    expect(cols.some((c) => c.label === 'Operator')).toBe(true);
  });

  it('does not duplicate Field when the template already has it', () => {
    const cols = templateColumns(FARM_PLOTS_CONFIG);
    expect(cols.filter((c) => c.label === 'Field')).toHaveLength(1);
    expect(cols[0].label).toBe('Date');
  });
});

describe('mapEntryToTemplateRow', () => {
  it('uses getters and leaves unknown keys blank', () => {
    const columns = templateColumns({
      columns: [
        { key: 'fieldName', label: 'Field' },
        { key: 'customNote', label: 'Custom Note' },
      ],
    });
    const row = mapEntryToTemplateRow(
      { date: '2026-09-02', fieldId: 'f1' },
      columns,
      {
        date: (e) => e.date,
        fieldName: () => 'NH-1',
      },
    );
    expect(row.Date).toBe('2026-09-02');
    expect(row.Field).toBe('NH-1');
    expect(row['Custom Note']).toBe('');
  });
});

describe('buildTemplateExportSheets', () => {
  it('falls back to hardcoded columns when no template config exists', () => {
    const sheets = buildTemplateExportSheets({
      entries: [{ date: '2026-09-02', fieldName: 'A' }],
      templates: [],
      getters: { date: (e) => e.date, fieldName: (e) => e.fieldName },
      fallbackColumns: [
        { key: 'date', label: 'Date' },
        { key: 'fieldName', label: 'Field' },
      ],
      defaultSheetName: 'Fertigation',
    });
    expect(sheets).toHaveLength(1);
    expect(sheets[0].sheetName).toBe('Fertigation');
    expect(sheets[0].rows[0]).toEqual({ Date: '2026-09-02', Field: 'A' });
  });

  it('puts rows on the matching template sheet', () => {
    const sheets = buildTemplateExportSheets({
      entries: [
        { date: '2026-09-01', templateId: 't1', fieldName: 'A' },
        { date: '2026-09-02', templateId: 't2', fieldName: 'B' },
      ],
      templates: [
        { id: 't1', name: 'Standard', columns_config: { columns: [{ key: 'fieldName', label: 'Field' }] } },
        { id: 't2', name: 'Farm Plots', columns_config: { columns: [{ key: 'fieldName', label: 'Plot' }] } },
      ],
      getters: {
        date: (e) => e.date,
        fieldName: (e) => e.fieldName,
      },
      fallbackColumns: [],
      defaultSheetName: 'Fertigation',
    });
    expect(sheets.map((s) => s.sheetName)).toEqual(['Standard', 'Farm Plots']);
    expect(sheets[0].rows[0].Field).toBe('A');
    expect(sheets[1].rows[0].Plot).toBe('B');
  });
});

describe('fertigation getters', () => {
  it('fills Water Qty and Operator from stored entry fields', () => {
    const getters = fertigationGetters({
      getFieldLabel: () => 'NH-1',
      getRecipeName: () => 'Mix A',
      getCrop: () => 'Tomato',
    });
    const columns = templateColumns(FERTIGATION_STANDARD_CONFIG);
    const row = mapEntryToTemplateRow(
      {
        date: '2026-09-02',
        dailyWater: 48,
        frequency: 4,
        valvesCount: 4,
        operatorName: 'Ali',
        flowRate: 12,
        totalFertilizer: 2,
      },
      columns,
      getters,
    );
    expect(row['Water Qty (M3/Valve)']).toBe(3);
    expect(row.Operator).toBe('Ali');
    expect(row.Crop).toBe('Tomato');
    expect(row.Recipe).toBe('Mix A');
  });
});

describe('ecph template projection', () => {
  it('uses farm-plot entry columns on Open Field and omits drain / EC Out', () => {
    const rows = mapEcphEntriesToExcelRows(
      [{
        date: '2026-09-01',
        time: '18:00',
        fieldId: 'f2',
        valveReadings: [{
          valveNumber: 1,
          dripVolume: 40,
          drain: 8,
          ecIn: 2.1,
          ec: 1.8,
          phIn: 6.1,
          ph: 6.0,
        }],
      }],
      { fieldInfoMap: { f2: { name: 'Plot 1', type: 'Open Field' } } },
    );
    const sheets = toEcphExportSheets(rows);
    expect(sheets[0].sheetName).toBe('Open Field');
    expect(Object.keys(sheets[0].rows[0])).toEqual([
      'Date', 'Field', 'Valve', 'Time', 'EC In', 'pH In', 'Drip Vol',
      'Water/Drip (M3)', 'Qty Water (M3)', 'Cycle', 'Total Water', 'Weather', 'Status',
    ]);
    expect(sheets[0].rows[0]['Drain Vol']).toBeUndefined();
    expect(sheets[0].rows[0]['EC Out']).toBeUndefined();
    expect(sheets[0].rows[0]['N Drip Volume (ml)']).toBeUndefined();
    expect(sheets[0].rows[0]['% Drain']).toBeUndefined();
  });
});
