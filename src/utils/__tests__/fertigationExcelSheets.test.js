import {
  isInputFileSheet,
  defaultSelectedSheetNames,
  detectHeaderRow,
  extractSheetData,
  headersMismatch,
  mismatchSheetNames,
  concatSelectedSheets,
  applyColumnMapping,
  autoMapHeaders,
  matchFertilizerHeader,
  isKgPerLiterHeader,
  collectExcelFertilizers,
} from '../fertigationExcelSheets';

const HEADER = ['Week No', 'Date', 'Field ID', 'Number of Valves', 'Flow Rate (m3/hr)', 'Water Qty (M3/Valve)', 'Frequency', 'Daily Total (m3)'];

describe('isInputFileSheet', () => {
  it('matches Input file and close variants', () => {
    expect(isInputFileSheet('Input file')).toBe(true);
    expect(isInputFileSheet('Input File')).toBe(true);
    expect(isInputFileSheet('InputFile')).toBe(true);
    expect(isInputFileSheet('input_file')).toBe(true);
    expect(isInputFileSheet('Input-file dump')).toBe(true);
  });

  it('does not match field tabs', () => {
    expect(isInputFileSheet('NH-21')).toBe(false);
    expect(isInputFileSheet('NH-22')).toBe(false);
    expect(isInputFileSheet('Greenhouse 1')).toBe(false);
  });
});

describe('defaultSelectedSheetNames', () => {
  it('leaves Input file off and field tabs on', () => {
    expect(defaultSelectedSheetNames(['Input file', 'NH-21', 'NH-22'])).toEqual(['NH-21', 'NH-22']);
  });

  it('selects Input file when it is the only data sheet', () => {
    expect(defaultSelectedSheetNames(['Input file'])).toEqual(['Input file']);
  });
});

describe('detectHeaderRow / extractSheetData', () => {
  it('finds the fertigation header and data rows', () => {
    const allRows = [
      ['Title'],
      HEADER,
      [1, 46000, 'NH-21', 4, 10, 3, 1, 12],
      [],
      [1, 46001, 'NH-21', 4, 10, 3, 1, 12],
    ];
    expect(detectHeaderRow(allRows)).toBe(1);
    const extracted = extractSheetData(allRows);
    expect(extracted.headers[2]).toBe('Field ID');
    expect(extracted.rows).toHaveLength(2);
    expect(extracted.rows[1]._rowNum).toBe(5);
  });
});

describe('headersMismatch', () => {
  it('warns when labels or length differ', () => {
    expect(headersMismatch(HEADER, HEADER)).toBe(false);
    expect(headersMismatch(HEADER, [...HEADER.slice(0, -1), 'Daily water'])).toBe(true);
    expect(headersMismatch(HEADER, HEADER.slice(0, -1))).toBe(true);
  });
});

describe('concatSelectedSheets', () => {
  it('concatenates only ticked sheets in workbook order', () => {
    const infos = [
      { name: 'Input file', headers: HEADER, rows: [{ cells: ['', '', 'NH-21'], _rowNum: 2 }] },
      { name: 'NH-21', headers: HEADER, rows: [{ cells: ['', '', 'NH-21'], _rowNum: 2 }] },
      { name: 'NH-22', headers: HEADER, rows: [{ cells: ['', '', 'NH-22'], _rowNum: 2 }] },
    ];
    const mapping = autoMapHeaders(HEADER);
    const rows = concatSelectedSheets(infos, ['NH-22', 'NH-21'], mapping);
    expect(rows.map((r) => r._sheet)).toEqual(['NH-21', 'NH-22']);
  });
});

describe('applyColumnMapping carry-forward', () => {
  const mapping = { 0: 'weekNo', 1: 'date', 2: 'fieldId' };

  it('carries date within a sheet and resets at the next sheet', () => {
    const raw = [
      { cells: [12, '2026-03-01', 'NH-21'], _rowNum: 2, _sheet: 'NH-21' },
      { cells: ['', '', 'NH-21'], _rowNum: 3, _sheet: 'NH-21' },
      { cells: ['', '', 'NH-22'], _rowNum: 2, _sheet: 'NH-22' },
    ];
    const rows = applyColumnMapping(raw, mapping);
    expect(rows[0].date).toBe('2026-03-01');
    expect(rows[0].weekNo).toBe(12);
    expect(rows[1].date).toBe('2026-03-01');
    expect(rows[1].weekNo).toBe(12);
    expect(rows[2].date).toBe('');
    expect(rows[2].weekNo).toBe('');
    expect(rows[2].fieldId).toBe('NH-22');
  });
});

describe('mismatchSheetNames', () => {
  it('returns later ticked sheets whose headers differ from the first', () => {
    const infos = [
      { name: 'NH-21', headers: HEADER },
      { name: 'NH-22', headers: [...HEADER.slice(0, -1), 'Other'] },
    ];
    expect(mismatchSheetNames(infos, ['NH-21', 'NH-22'])).toEqual(['NH-22']);
  });
});

describe('fertilizer kg columns', () => {
  it('matches fertilizer names and skips kg/L headers', () => {
    expect(matchFertilizerHeader('Calcium Nitrate')).toBe('Calcium Nitrate');
    expect(matchFertilizerHeader('Calcium Nitrate (kg)')).toBe('Calcium Nitrate');
    expect(matchFertilizerHeader('MAP')).toBe('MAP');
    expect(isKgPerLiterHeader('Calcium Nitrate kg/L')).toBe(true);
    expect(matchFertilizerHeader('Calcium Nitrate kg/L')).toBeNull();
  });

  it('keeps header indexes aligned when a blank column sits in the middle', () => {
    const allRows = [
      ['Week No', 'Date', 'Field ID', 'Number of Valves', 'Flow Rate (m3/hr)', '', 'Calcium Nitrate'],
      [12, '2026-03-01', 'NH-21', 4, 10, '', 4.5],
    ];
    const extracted = extractSheetData(allRows);
    expect(extracted.headers[2]).toBe('Field ID');
    expect(extracted.headers[5]).toBe('');
    expect(extracted.headers[6]).toBe('Calcium Nitrate');
    expect(extracted.rows[0].cells[6]).toBe(4.5);
  });

  it('collects kg from unmapped fertilizer columns', () => {
    const headers = [...HEADER, 'Recipe', 'Calcium Nitrate', 'Urea'];
    const mapping = autoMapHeaders(headers);
    const collected = collectExcelFertilizers(
      [12, '2026-03-01', 'NH-21', 4, 10, 3, 1, 12, 'R1 ', 2.5, 1],
      headers,
      mapping,
    );
    expect(collected.fertilizers).toEqual({ 'Calcium Nitrate': 2.5, Urea: 1 });
    expect(collected.totalFertilizer).toBe(3.5);
  });

  it('applies fertilizer kg onto mapped rows', () => {
    const headers = ['Date', 'Field ID', 'Phosphoric Acid'];
    const mapping = autoMapHeaders(headers);
    const rows = applyColumnMapping(
      [{ cells: ['2026-03-01', 'NH-21', 0.8], _rowNum: 2, _sheet: 'NH-21' }],
      mapping,
      headers,
    );
    expect(rows[0].fertilizers['Phosphoric Acid']).toBe(0.8);
  });
});
