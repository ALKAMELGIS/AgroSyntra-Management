import { buildCompanyWorkbook, buildCompanyWorkbookFromSheets, OPS_EXPORT } from '../companyExcelExport';

describe('buildCompanyWorkbook', () => {
  it('writes letterhead, exported-by meta, and a dark-green header row', async () => {
    const workbook = await buildCompanyWorkbook(
      [{ Date: '2026-09-01', Field: 'A1', 'Quantity (kg)': 12, Grade: 'A' }],
      {
        ...OPS_EXPORT.harvest,
        organizationName: 'ELITE AGRO UAE LLC',
        siteName: 'Al Maha',
        exportedBy: 'Ahmed',
        exportedAt: new Date(2026, 8, 1),
      },
    );

    const sheet = workbook.getWorksheet('Harvest');
    expect(sheet.getCell('B1').value).toBe('ELITE AGRO UAE LLC');
    expect(sheet.getCell('B2').value).toBe('HARVEST RECORD');
    expect(String(sheet.getCell('B3').value)).toContain('Exported by: Ahmed');
    expect(String(sheet.getCell('B3').value)).toContain('Site: Al Maha');
    expect(String(sheet.getCell('B3').value)).toContain('Exported: 01/09/2026');
    expect(sheet.getCell('G1').value).toBe('EAG/AFO/IMS/RC-111');

    const header = sheet.getCell('A5');
    expect(header.value).toBe('Date');
    expect(header.fill.fgColor.argb).toBe('FF1B5E20');
    expect(header.font.bold).toBe(true);
    expect(header.font.color.argb).toBe('FFFFFFFF');

    expect(sheet.getCell('A6').value).toBe('01/09/2026');
    expect(sheet.getCell('C6').alignment.horizontal).toBe('right');
    expect(sheet.getCell('D6').alignment.horizontal).toBe('center');
  });

  it('leaves A1:A3 empty when no logo is provided', async () => {
    const workbook = await buildCompanyWorkbook(
      [{ Field: 'A1' }],
      { title: 'EC / pH RECORD', sheetName: 'EC pH' },
    );
    const sheet = workbook.getWorksheet('EC pH');
    expect(sheet.getCell('A1').value == null).toBe(true);
    expect(sheet.getCell('B2').value).toBe('EC / pH RECORD');
  });

  it('writes manpower letterhead without a document code and freezes identity columns', async () => {
    const workbook = await buildCompanyWorkbook(
      [{ Date: '2026-09-17', ID: 'E1', 'Employee Name': 'Ali', 'Employee Category': 'Permanent' }],
      {
        ...OPS_EXPORT.manpower,
        organizationName: 'ELITE AGRO UAE LLC',
        exportedAt: new Date(2026, 8, 17),
      },
    );
    const sheet = workbook.getWorksheet('Record');
    expect(sheet.getCell('B1').value).toBe('ELITE AGRO UAE LLC');
    expect(sheet.getCell('B2').value).toBe('MANPOWER RECORD');
    expect(sheet.getCell('A5').value).toBe('Date');
    expect(sheet.getCell('A6').value).toBe('17/09/2026');
    expect(OPS_EXPORT.manpower.docRef).toBe('');
    expect(String(sheet.getCell('G1').value || '')).not.toMatch(/RC-/);
    expect(sheet.views[0].ySplit).toBe(5);
    expect(sheet.views[0].xSplit).toBe(4);
  });

  it('uses a per-sheet title when provided', async () => {
    const workbook = await buildCompanyWorkbookFromSheets(
      [
        { sheetName: 'NH05', title: 'BIOLOGICAL CONTROL RECORD — NH05', rows: [{ Wk: 1 }] },
        { sheetName: 'NH05 SUMMARY', title: 'BIOLOGICAL CONTROL RECORD — NH05 SUMMARY', rows: [{ Product: 'A' }] },
      ],
      { ...OPS_EXPORT.bio },
    );
    expect(OPS_EXPORT.bio.title).toBe('BIOLOGICAL CONTROL RECORD');
    expect(workbook.getWorksheet('NH05').getCell('B2').value).toBe('BIOLOGICAL CONTROL RECORD — NH05');
    expect(workbook.getWorksheet('NH05 SUMMARY').getCell('B2').value).toBe(
      'BIOLOGICAL CONTROL RECORD — NH05 SUMMARY',
    );
  });

  it('registers scouting and bumble bee letterhead titles', () => {
    expect(OPS_EXPORT.scoutingSummary.title).toBe('SCOUTING SUMMARY');
    expect(OPS_EXPORT.bumbleBees.title).toBe('BUMBLE BEE RECORD');
  });
});
