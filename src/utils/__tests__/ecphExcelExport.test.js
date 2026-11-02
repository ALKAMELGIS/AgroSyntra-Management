import {
  formatEcphClock,
  mapEcphEntriesToExcelRows,
  toEcphExportSheets,
} from '../ecphExcelExport';
import { buildCompanyWorkbookFromSheets } from '../companyExcelExport';

describe('formatEcphClock', () => {
  it('converts 24-hour times to AM/PM', () => {
    expect(formatEcphClock('18:00')).toBe('6:00 PM');
    expect(formatEcphClock('15:00:00')).toBe('3:00 PM');
    expect(formatEcphClock('00:05')).toBe('12:05 AM');
    expect(formatEcphClock('12:00')).toBe('12:00 PM');
  });

  it('keeps already-AM/PM times', () => {
    expect(formatEcphClock('3:00 PM')).toBe('3:00 PM');
    expect(formatEcphClock('3:00 pm')).toBe('3:00 PM');
  });

  it('leaves empty and unknown text alone', () => {
    expect(formatEcphClock('')).toBe('');
    expect(formatEcphClock('morning')).toBe('morning');
  });
});

describe('mapEcphEntriesToExcelRows', () => {
  const fieldInfoMap = {
    f1: {
      name: 'NH-5',
      type: 'Nethouse',
      farmAreaId: 'a1',
      farmAreaName: 'Nethouse',
      siteName: 'Al Maha',
    },
  };

  it('includes drip volume, cycle, weather, and status', () => {
    const rows = mapEcphEntriesToExcelRows(
      [{
        date: '2026-09-01',
        time: '18:00',
        fieldId: 'f1',
        weatherCondition: 'Sunny',
        irrigationStatus: 'On',
        valveReadings: [{
          valveNumber: 1,
          dripVolume: 40,
          drain: 8,
          ecIn: 2.1,
          ec: 1.8,
          phIn: 6.1,
          ph: 6.0,
          qtyOfWater: 12,
          cycle: 3,
        }],
      }],
      { fieldInfoMap },
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].Time).toBe('6:00 PM');
    expect(rows[0].Field).toBe('NH-5');
    expect(rows[0]['Drip Volume (ml)']).toBe(40);
    expect(rows[0].Cycle).toBe(3);
    expect(rows[0].Weather).toBe('Sunny');
    expect(rows[0].Status).toBe('On');
    expect(rows[0]['Total Water']).toBe('36.000');
    expect(rows[0]['Water/Drip (M³)']).toBe('');
  });

  it('fills Water/Drip from stored dripperCount when crop is missing', () => {
    const rows = mapEcphEntriesToExcelRows(
      [{
        date: '2026-06-29',
        fieldId: 'f1',
        dripperCount: 30000,
        valveReadings: [{
          valveNumber: 1,
          dripVolume: 10500,
          qtyOfWater: 4.5,
          cycle: 12,
        }],
      }],
      { fieldInfoMap },
    );

    expect(rows[0]['Drip Volume (ml)']).toBe(10500);
    expect(rows[0]['Water/Drip (M³)']).toBe('315.000');
    expect(rows[0]['Qty Water (M³)']).toBe(4.5);
    expect(rows[0].Cycle).toBe(12);
    expect(rows[0]['Total Water']).toBe('54.000');
  });

  it('uses stored Water/Drip when already on the valve', () => {
    const rows = mapEcphEntriesToExcelRows(
      [{
        date: '2026-06-29',
        fieldId: 'f1',
        valveReadings: [{
          valveNumber: 1,
          dripVolume: 10500,
          totalWaterBasedOnDrip: 40.5,
        }],
      }],
      { fieldInfoMap },
    );

    expect(rows[0]['Water/Drip (M³)']).toBe('40.500');
  });

  it('splits nethouse and open field onto their own sheets', () => {
    const rows = mapEcphEntriesToExcelRows(
      [
        { date: '2026-09-01', time: '08:00', fieldId: 'f1', valveReadings: [{ valveNumber: 1 }] },
        {
          date: '2026-09-01',
          time: '09:00',
          fieldId: 'f2',
          valveReadings: [{ valveNumber: 1 }],
        },
      ],
      {
        fieldInfoMap: {
          ...fieldInfoMap,
          f2: { name: 'Plot 1', type: 'Open Field', farmAreaName: 'Plots' },
        },
      },
    );
    const sheets = toEcphExportSheets(rows);
    expect(sheets.map((s) => s.sheetName)).toEqual(['Nethouse', 'Open Field']);
    expect(sheets[0].rows[0].Field).toBe('NH-5');
    expect(sheets[0].rows[0]._fieldType).toBeUndefined();
  });

  it('exports nethouse columns in entry order with crop test-drip header', () => {
    const masterData = {
      crops: [{ name: 'Capsicum', drip_test_count: 15, dripper_count: 30000 }],
    };
    const rows = mapEcphEntriesToExcelRows(
      [{
        date: '2026-06-29',
        time: '17:10',
        fieldId: 'f1',
        weatherCondition: 'Sunny',
        irrigationStatus: 'On',
        valveReadings: [{
          valveNumber: 1,
          dripVolume: 40,
          drain: 8,
          ecIn: 2.1,
          ec: 1.8,
          phIn: 6.1,
          ph: 6.0,
          qtyOfWater: 4.5,
          cycle: 12,
        }],
      }],
      {
        fieldInfoMap: { ...fieldInfoMap, f1: { ...fieldInfoMap.f1, currentCrop: 'Capsicum' } },
        masterData,
      },
    );
    const sheets = toEcphExportSheets(rows);
    expect(Object.keys(sheets[0].rows[0])).toEqual([
      'Date', 'Field', 'Valve', 'Time', 'EC In', 'EC Out', 'pH In', 'pH Out',
      'Drip Vol', 'Drain Vol', '15 Drip Volume (ml)', '% Drain',
      'Water/Drip (M3)', 'Qty Water (M3)', 'Cycle', 'Total Water', 'Weather', 'Status',
    ]);
    expect(sheets[0].rows[0]['15 Drip Volume (ml)']).toBe(600);
    expect(sheets[0].rows[0]['% Drain']).toBe('1.33%');
    expect(sheets[0].rows[0]['Water/Drip (M3)']).toBe('1.200');
  });

  it('uses entry cropName for 15 Drip Volume when field currentCrop is empty', () => {
    const masterData = {
      crops: [{ name: 'Capsicum', drip_test_count: 15, dripper_count: 30000 }],
    };
    const rows = mapEcphEntriesToExcelRows(
      [{
        date: '2026-06-07',
        fieldId: 'f1',
        cropName: 'Capsicum',
        valveReadings: [{
          valveNumber: 1,
          dripVolume: 40,
          drain: 8,
        }],
      }],
      { fieldInfoMap, masterData },
    );
    const sheets = toEcphExportSheets(rows);
    expect(Object.keys(sheets[0].rows[0])).toContain('15 Drip Volume (ml)');
    expect(sheets[0].rows[0]['15 Drip Volume (ml)']).toBe(600);
  });

  it('uses stored dripTestCount for 15 Drip Volume when crop is missing', () => {
    const rows = mapEcphEntriesToExcelRows(
      [{
        date: '2026-06-29',
        fieldId: 'f1',
        dripperCount: 30000,
        dripTestCount: 15,
        valveReadings: [{
          valveNumber: 1,
          dripVolume: 40,
          drain: 8,
        }],
      }],
      { fieldInfoMap },
    );
    const sheets = toEcphExportSheets(rows);
    expect(Object.keys(sheets[0].rows[0])).toContain('15 Drip Volume (ml)');
    expect(sheets[0].rows[0]['15 Drip Volume (ml)']).toBe(600);
    expect(sheets[0].rows[0]['Water/Drip (M3)']).toBe('1.200');
  });

  it('uses 15 Drip Volume and Water/Drip from stored dripperCount when crop is missing', () => {
    const masterData = {
      crops: [
        { name: 'Capsicum', dripper_count: 30000, drip_test_count: 15 },
        { name: 'Capsicum Orange', dripper_count: 30000, drip_test_count: 15 },
      ],
    };
    const rows = mapEcphEntriesToExcelRows(
      [{
        date: '2026-06-29',
        fieldId: 'f1',
        dripperCount: 30000,
        valveReadings: [{
          valveNumber: 1,
          dripVolume: 40,
          drain: 8,
          percentDrain: 0.27,
        }],
      }],
      { fieldInfoMap, masterData },
    );
    const sheets = toEcphExportSheets(rows);
    expect(Object.keys(sheets[0].rows[0])).toContain('15 Drip Volume (ml)');
    expect(sheets[0].rows[0]['15 Drip Volume (ml)']).toBe(600);
    expect(sheets[0].rows[0]['% Drain']).toBe('27%');
    expect(sheets[0].rows[0]['Water/Drip (M3)']).toBe('1.200');
  });

  it('uses N Drip Volume when the crop has no test count', () => {
    const masterData = { crops: [{ name: 'Onion' }] };
    const rows = mapEcphEntriesToExcelRows(
      [{
        date: '2026-06-29',
        fieldId: 'f1',
        valveReadings: [{ valveNumber: 1, dripVolume: 40, drain: 8 }],
      }],
      {
        fieldInfoMap: { ...fieldInfoMap, f1: { ...fieldInfoMap.f1, currentCrop: 'Onion' } },
        masterData,
      },
    );
    const sheets = toEcphExportSheets(rows);
    expect(sheets[0].rows[0]['N Drip Volume (ml)']).toBe('');
    expect(sheets[0].rows[0]['% Drain']).toBe('');
    expect(sheets[0].rows[0]['15 Drip Volume (ml)']).toBeUndefined();
  });

  it('falls back to N Drip Volume header when a sheet mixes test counts', () => {
    const masterData = {
      crops: [
        { name: 'Capsicum', drip_test_count: 15 },
        { name: 'Plum Tomato', drip_test_count: 12 },
      ],
    };
    const rows = mapEcphEntriesToExcelRows(
      [
        {
          date: '2026-06-29',
          fieldId: 'f1',
          valveReadings: [{ valveNumber: 1, dripVolume: 40 }],
        },
        {
          date: '2026-06-29',
          fieldId: 'f3',
          valveReadings: [{ valveNumber: 1, dripVolume: 40 }],
        },
      ],
      {
        fieldInfoMap: {
          ...fieldInfoMap,
          f1: { ...fieldInfoMap.f1, currentCrop: 'Capsicum' },
          f3: { name: 'NH-8', type: 'Nethouse', currentCrop: 'Plum Tomato' },
        },
        masterData,
      },
    );
    const sheets = toEcphExportSheets(rows);
    expect(Object.keys(sheets[0].rows[0])).toContain('N Drip Volume (ml)');
    expect(sheets[0].rows[0]['N Drip Volume (ml)']).toBe(600);
    expect(sheets[0].rows[1]['N Drip Volume (ml)']).toBe(480);
  });
});

describe('buildCompanyWorkbookFromSheets', () => {
  it('writes two named letterhead sheets', async () => {
    const workbook = await buildCompanyWorkbookFromSheets(
      [
        { sheetName: 'Nethouse', rows: [{ Field: 'NH-5', Time: '6:00 PM' }] },
        { sheetName: 'Open Field', rows: [{ Field: 'P1', Time: '3:00 PM' }] },
      ],
      { title: 'EC / pH RECORD' },
    );
    expect(workbook.getWorksheet('Nethouse').getCell('B2').value).toBe('EC / pH RECORD');
    expect(workbook.getWorksheet('Nethouse').getCell('A6').value).toBe('NH-5');
    expect(workbook.getWorksheet('Open Field').getCell('A6').value).toBe('P1');
    expect(workbook.getWorksheet('Greenhouse')).toBeUndefined();
  });
});
