import {
  FALLBACK_HARVEST_COLUMNS,
  FALLBACK_HARVEST_ENTRY_COLUMNS,
  buildHarvestExcelSheets,
  flattenHarvestEntries,
} from '../harvestExcelExport';

describe('harvestExcelExport', () => {
  it('uses cropName for Product and keeps reports crop fallback', () => {
    const rows = flattenHarvestEntries([
      {
        date: '2026-09-10',
        fieldId: 'f1',
        fieldName: 'GH-1',
        cropName: 'Tomato',
        startTime: '06:00',
        totalQuantity: 12,
        varieties: [{ variety: 'Roma', quantity: 8 }, { variety: 'Elpida', quantity: 4 }],
      },
    ], { f1: { name: 'GH-1', currentCrop: 'Cucumber' } });

    expect(rows).toHaveLength(2);
    expect(rows[0].product).toBe('Tomato');
    expect(rows[0].cropName).toBe('Tomato');
    expect(rows[0].currentCrop).toBe('Cucumber');
    expect(rows[1].variety).toBe('Elpida');
  });

  it('falls back to field currentCrop when cropName is missing', () => {
    const [row] = flattenHarvestEntries([
      { date: '2026-09-10', fieldId: 'f1', varieties: [{ variety: 'Roma', quantity: 2 }] },
    ], { f1: { name: 'GH-1', currentCrop: 'Pepper' } });
    expect(row.product).toBe('Pepper');
    expect(row.currentCrop).toBe('Pepper');
    expect(FALLBACK_HARVEST_COLUMNS.some((col) => col.key === 'currentCrop')).toBe(true);
  });

  it('builds entry sheets with Product as crop', async () => {
    const sheets = await buildHarvestExcelSheets([
      {
        date: '2026-09-10',
        fieldName: 'GH-1',
        cropName: 'Tomato',
        startTime: '06:30',
        varieties: [{ variety: 'Roma', quantity: 5 }],
      },
    ], { variant: 'entry' });

    expect(sheets).toHaveLength(1);
    expect(Object.keys(sheets[0].rows[0])).toEqual(FALLBACK_HARVEST_ENTRY_COLUMNS.map((col) => col.label));
    expect(sheets[0].rows[0].Product).toBe('Tomato');
    expect(sheets[0].rows[0]['Start Time']).toBe('06:30');
    expect(sheets[0].rows[0].Variety).toBe('Roma');
  });
});
