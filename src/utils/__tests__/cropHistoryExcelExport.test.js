import {
  buildGerminationSheetRows,
  buildHistoryRows,
  buildNurseryExportRows,
  buildOccupiedRows,
  buildPlantingExportRows,
  buildPlantationExportSheets,
} from '../cropHistoryExcelExport';

describe('buildGerminationSheetRows', () => {
  it('prefixes all five counting columns including both percents', () => {
    const rows = buildGerminationSheetRows([
      {
        variety_name: 'Tom',
        counts: [{ counting_number: 1, date: '2026-01-02', seeds_total: 100, seeds_no_germ: 10 }],
      },
    ], 1);
    expect(Object.keys(rows[0])).toEqual([
      'Variety',
      '1st Counting Date',
      '1st Counting Seeds Total',
      '1st Counting No Germ',
      '1st Counting No Germ %',
      '1st Counting Germ %',
    ]);
    expect(rows[0]['1st Counting Date']).toBe('02/01/2026');
    expect(rows[0]['1st Counting No Germ %']).toBe(10);
    expect(rows[0]['1st Counting Germ %']).toBe(90);
  });
});

describe('buildNurseryExportRows', () => {
  it('keeps unique UoM keys for each media', () => {
    const rows = buildNurseryExportRows([{
      _isNew: false,
      seedingDate: '2026-03-01',
      cropId: 'c1',
      mediaComponents: {
        perlite: { qty: 2, uom: 'Lit' },
        peatMoss: { qty: 3, uom: 'Kg' },
        compost: { qty: 1, uom: 'Lit' },
        vermiculite: { qty: 4, uom: 'pcs' },
      },
    }], { cropNameById: { c1: 'Tomato' } });
    const keys = Object.keys(rows[0]);
    expect(keys.filter((k) => k.endsWith('UoM'))).toEqual([
      'Perlite UoM',
      'Peat moss UoM',
      'Compost UoM',
      'Vermiculite UoM',
    ]);
    expect(rows[0]['Peat moss UoM']).toBe('Kg');
    expect(rows[0]['Date of sowing']).toBe('01/03/2026');
    expect(rows[0].Crop).toBe('Tomato');
  });
});

describe('buildPlantingExportRows', () => {
  it('repeats crop names on every saved row and formats dates', () => {
    const rows = buildPlantingExportRows([
      { _isNew: true, cropId: 'c1', seedingDate: '2026-01-01' },
      { _isNew: false, cropId: 'c1', varietyId: 'v1', fieldId: 'f1', seedingDate: '2026-01-01', transplantDate: '2026-02-01', segment: '1' },
      { _isNew: false, cropId: 'c1', varietyId: 'v1', fieldId: 'f1', seedingDate: '2026-01-01', transplantDate: '2026-02-01', segment: '2' },
    ], {
      cropNameById: { c1: 'Tomato' },
      varietyNameById: { v1: 'Tyty' },
      fieldNameById: { f1: 'NH05' },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]['Crop Name']).toBe('Tomato');
    expect(rows[1]['Crop Name']).toBe('Tomato');
    expect(rows[0]['Seeding Date']).toBe('01/01/2026');
    expect(rows[0]['Field ID']).toBe('NH05');
  });
});

describe('buildOccupiedRows and buildHistoryRows', () => {
  it('formats occupied since and includes uprooted plus cycles', () => {
    expect(buildOccupiedRows([{
      fieldName: 'NH05',
      occupancyStart: '2026-06-01',
      cropName: 'Tomato',
    }])[0]['Occupied since']).toBe('01/06/2026');
    const history = buildHistoryRows([{
      field_name: 'NH05',
      crop_name: 'Tomato',
      start_date: '2026-01-01',
      uprooted_at: '2026-03-01',
      uproot_reason: 'End of crop',
      cycle_count: 2,
    }])[0];
    expect(history.Uprooted).toBe('2026-03-01 · End of crop');
    expect(history.Cycles).toBe(2);
    expect(history['Start Date']).toBe('01/01/2026');
  });
});

describe('buildPlantationExportSheets', () => {
  it('exports crop and variety names, not ids, and formats date labels', () => {
    const sheets = buildPlantationExportSheets({
      opening: [{
        _isNew: false,
        requestedDate: '2026-04-01',
        cropId: 'c1',
        varietyId: 'v1',
        fieldId: 'f1',
      }],
      lookups: {
        cropNameById: { c1: 'Tomato' },
        varietyNameById: { v1: 'Tyty' },
        fieldNameById: { f1: 'NH05' },
      },
    });
    expect(sheets[0].rows[0]['Requested date']).toBe('01/04/2026');
    expect(sheets[0].rows[0]['Family Code']).toBe('Tomato');
    expect(sheets[0].rows[0]['Variety Sown Code']).toBe('Tyty');
    expect(sheets[0].rows[0]['Field (GH/NH/Pivot)']).toBe('NH05');
  });
});
