import { orderLocations, matchFieldToLocation, dailyTotal, excelDateToIso, matchExcelLabelToLocation } from '../rc108Locations';
import { detectRc108FieldBlocks, mergeImportedDays, parseRc108Workbook, remapImportedDays, expandSheetRef, defaultRc108Assignments } from '../rc108ImportParser';
import * as XLSX from 'xlsx';

describe('rc108Locations', () => {
  test('matches NH-01 to NH 1', () => {
    const field = matchFieldToLocation([{ id: 'a', name: 'NH-01' }], 'NH 1');
    expect(field.id).toBe('a');
  });

  test('orders Excel locations before unmatched fields', () => {
    const fields = [
      { id: 'x', name: 'Extra House' },
      { id: '1', name: 'NH 2' },
      { id: '0', name: 'NH 1' },
    ];
    const ordered = orderLocations(fields);
    expect(ordered.map((l) => l.label)).toEqual(['NH 1', 'NH 2', 'Extra House']);
  });

  test('fields-only order keeps Management names and does not remap BL plots', () => {
    const fields = [
      { id: 'a4', name: 'A4' },
      { id: 'bl3', name: 'BL -03' },
      { id: 'a5', name: 'A5' },
    ];
    const ordered = orderLocations(fields, { useExcelOrder: false });
    expect(ordered.map((l) => l.label)).toEqual(['A4', 'BL -03', 'A5']);
  });

  test('dailyTotal is water qty times frequency', () => {
    expect(dailyTotal({ waterQty: 5.8, frequency: 9 })).toBe(52.2);
    expect(dailyTotal({ waterQty: '', frequency: '' })).toBe('');
  });

  test('excelDateToIso reads serials as UTC calendar days', () => {
    expect(excelDateToIso(45901)).toBe('2025-09-01');
  });
});

describe('rc108ImportParser', () => {
  test('detects field blocks from RC-108 header rows', () => {
    const head1 = [];
    head1[6] = 'Location ID';
    head1[7] = 'NH 1';
    head1[11] = 'Location ID';
    head1[12] = 'NH 2';
    const head2 = [];
    head2[6] = 'Water Qty. ( M3 )';
    head2[7] = 'Frequency';
    head2[11] = 'Water Qty. ( M3 )';
    head2[12] = 'Frequency';
    const blocks = detectRc108FieldBlocks(head1, head2);
    expect(blocks[0]).toEqual({ label: 'NH 1', start: 6 });
    expect(blocks[1]).toEqual({ label: 'NH 2', start: 11 });
  });

  test('parses a minimal RC-108 workbook', () => {
    const aoa = [];
    aoa[8] = ['Week No', 'Date (dd/mm/yyyy)', 'Method', 'Flow Rate ( m3 )', 'Operator', 'Authorized', 'Location ID', 'NH 1'];
    aoa[9] = ['', '', '', '', '', '', 'Water Qty. ( M3 )', 'Frequency', 'Daily Total ( m3)', 'Fertilizer Type', 'Fertilizer Qty.'];
    aoa[10] = [36, 45901, 'Drip', 49.6, 'Tara', 'Mr.Ghion', 5.8, 9, 52.2, '', ''];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Irrigation & Fertigation Record');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const parsed = parseRc108Workbook(buf, 'RC-108.xlsx');
    expect(parsed.error).toBeUndefined();
    expect(parsed.days).toHaveLength(1);
    expect(parsed.days[0].date).toBe('2025-09-01');
    expect(parsed.days[0].flowRate).toBe(49.6);
    expect(parsed.days[0].cells['NH 1'].waterQty).toBe(5.8);
    expect(parsed.days[0].cells['NH 1'].frequency).toBe(9);
  });

  test('mergeImportedDays keeps dates that cross the calendar year', () => {
    const locations = [{ id: '1', label: 'NH 1' }];
    const merged = mergeImportedDays([], [
      { date: '2025-09-01', cells: { 'NH 1': { waterQty: 1, frequency: 1 } } },
      { date: '2026-07-15', cells: { 'NH 1': { waterQty: 2, frequency: 2 } } },
    ], locations);
    expect(merged.map((r) => r.date)).toEqual(['2025-09-01', '2026-07-15']);
  });

  test('compact plot names match A4 and BL-03 without valve remapping', () => {
    const ofLocs = [
      { label: 'A4', fieldId: 'a4', valveRange: '' },
      { label: 'BL -03', fieldId: 'bl3', valveRange: '' },
    ];
    expect(matchExcelLabelToLocation('A-4', ofLocs).label).toBe('A4');
    expect(matchExcelLabelToLocation('BL-03', ofLocs).label).toBe('BL -03');
    expect(matchExcelLabelToLocation('BL 3 (V6-V10)', ofLocs)).toBeNull();
  });

  test('expandSheetRef includes cells outside a clipped !ref', () => {
    const aoa = [];
    const head1 = ['Week No', 'Date (dd/mm/yyyy)', 'Method', 'Flow Rate ( m3 )', 'Operator', 'Authorized'];
    head1[40] = 'Location ID';
    head1[41] = 'A4';
    const head2 = [];
    head2[40] = 'Water Qty. ( M3 )';
    head2[41] = 'Frequency';
    aoa[8] = head1;
    aoa[9] = head2;
    const data = [];
    data[1] = 45901;
    data[40] = 2.5;
    data[41] = 4;
    aoa[10] = data;
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!ref'] = 'A1:J20';
    const clipped = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
    expect((clipped[8] || [])[41]).toBeFalsy();
    expandSheetRef(ws);
    const full = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
    expect(full[8][41]).toBe('A4');
    expect(full[10][40]).toBe(2.5);
  });

  test('remapImportedDays splits nethouse and open-field columns onto separate locations', () => {
    const remapped = remapImportedDays([{
      date: '2025-09-01',
      cells: {
        'NH 1': { waterQty: 1, frequency: 1 },
        A4: { waterQty: 2, frequency: 2 },
        'BL-03': { waterQty: 3, frequency: 3 },
        'BL 3 (V6-V10)': { waterQty: 9, frequency: 9 },
      },
    }], {
      nethouse: [
        { label: 'NH 1', fieldId: 'n1', valveRange: '' },
        { label: 'BL 3 (V6-V10)', fieldId: 'nbl', valveRange: 'V6-V10' },
      ],
      greenhouse: [],
      openfield: [
        { label: 'A4', fieldId: 'a4', valveRange: '' },
        { label: 'BL -03', fieldId: 'bl3', valveRange: '' },
      ],
    });
    expect(remapped.counts).toEqual({
      nethouse: 2,
      greenhouse: 0,
      openfield: 2,
      unmatched: 0,
    });
    expect(remapped.days[0].cells['NH 1'].waterQty).toBe(1);
    expect(remapped.days[0].cells.A4.waterQty).toBe(2);
    expect(remapped.days[0].cells['BL -03'].waterQty).toBe(3);
    expect(remapped.days[0].cells['BL 3 (V6-V10)'].waterQty).toBe(9);
  });

  test('assignments map an unmatched Excel column onto A5', () => {
    const groups = {
      nethouse: [{ label: 'NH 1', fieldId: 'n1', valveRange: '' }],
      greenhouse: [],
      openfield: [{ label: 'A5', fieldId: 'a5', valveRange: '' }],
    };
    const remapped = remapImportedDays([{
      date: '2025-09-01',
      cells: {
        'NH 1': { waterQty: 1, frequency: 1 },
        'Plot 1': { waterQty: 4, frequency: 2 },
      },
    }], groups, {
      'NH 1': { structure: 'nethouse', locLabel: 'NH 1' },
      'Plot 1': { structure: 'openfield', locLabel: 'A5' },
    });
    expect(remapped.counts.openfield).toBe(1);
    expect(remapped.days[0].cells.A5.waterQty).toBe(4);
  });

  test('assignments do not auto-send BL valve columns to BL-03', () => {
    const groups = {
      nethouse: [{ label: 'BL 3 (V6-V10)', fieldId: 'nbl', valveRange: 'V6-V10' }],
      greenhouse: [],
      openfield: [{ label: 'BL -03', fieldId: 'bl3', valveRange: '' }],
    };
    const auto = defaultRc108Assignments(['BL 3 (V6-V10)'], groups);
    expect(auto['BL 3 (V6-V10)']).toEqual({ structure: 'nethouse', locLabel: 'BL 3 (V6-V10)' });
    const remapped = remapImportedDays([{
      date: '2025-09-01',
      cells: { 'BL 3 (V6-V10)': { waterQty: 9, frequency: 1 } },
    }], groups);
    expect(remapped.days[0].cells['BL -03']).toBeUndefined();
    expect(remapped.days[0].cells['BL 3 (V6-V10)'].waterQty).toBe(9);
  });
});
