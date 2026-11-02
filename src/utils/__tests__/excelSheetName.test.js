import { excelSheetName, formatExportDate, safeExportFilename, uniqueColumnLabel } from '../excelSheetName';

describe('excelSheetName', () => {
  it('strips illegal characters and uniquifies after truncate', () => {
    const used = new Set();
    expect(excelSheetName('NH/05:A', used)).toBe('NH 05 A');
    expect(excelSheetName('NH 05 A', used)).toBe('NH 05 A (2)');
  });
});

describe('uniqueColumnLabel', () => {
  it('suffixes duplicate labels', () => {
    const used = new Map();
    expect(uniqueColumnLabel('Pump 1', used)).toBe('Pump 1');
    expect(uniqueColumnLabel('Pump 1', used)).toBe('Pump 1 #2');
  });
});

describe('formatExportDate', () => {
  it('turns ISO dates into dd/mm/yyyy', () => {
    expect(formatExportDate('2026-06-15T00:00:00')).toBe('15/06/2026');
    expect(formatExportDate('')).toBe('');
  });
});

describe('safeExportFilename', () => {
  it('strips characters that Windows rejects', () => {
    expect(safeExportFilename('Scouting Summary 2026 Open/Shade')).toBe('Scouting Summary 2026 Open Shade');
  });
});
