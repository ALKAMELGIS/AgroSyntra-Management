import {
  applyFieldPickToExcelValue,
  looksLikeNurseryFieldId,
  resolveImportField,
} from '../pppImportFieldMatch';

const GH01 = { id: 'gh1', name: 'GH-01' };
const NH21 = { id: 'nh21', name: 'NH-21' };
const GH02 = { id: 'gh2', name: 'GH-02' };

describe('looksLikeNurseryFieldId', () => {
  it('matches nursery and close misspellings', () => {
    expect(looksLikeNurseryFieldId('nursery')).toBe(true);
    expect(looksLikeNurseryFieldId('Nursery')).toBe(true);
    expect(looksLikeNurseryFieldId('nursary')).toBe(true);
    expect(looksLikeNurseryFieldId('nursury')).toBe(true);
    expect(looksLikeNurseryFieldId('nersery')).toBe(true);
  });

  it('does not treat field codes as nursery', () => {
    expect(looksLikeNurseryFieldId('NH-21')).toBe(false);
    expect(looksLikeNurseryFieldId('GH-01')).toBe(false);
    expect(looksLikeNurseryFieldId('')).toBe(false);
  });
});

describe('resolveImportField', () => {
  const fields = [GH01, NH21, GH02];

  it('maps nursery to the single designated nursery field', () => {
    const hit = resolveImportField({
      excelField: 'nursery',
      fields,
      nurseryFields: [GH01],
    });
    expect(hit.field?.id).toBe('gh1');
    expect(hit.source).toBe('nursery');
    expect(hit.needsPick).toBe(false);
    expect(hit.warning).toMatch(/GH-01/);
  });

  it('maps nursary the same way', () => {
    const hit = resolveImportField({
      excelField: 'nursary',
      fields,
      nurseryFields: [GH01],
    });
    expect(hit.field?.id).toBe('gh1');
    expect(hit.source).toBe('nursery');
  });

  it('does not auto-pick when several nurseries are designated', () => {
    const hit = resolveImportField({
      excelField: 'nursery',
      fields,
      nurseryFields: [GH01, GH02],
    });
    expect(hit.field).toBeNull();
    expect(hit.needsPick).toBe(true);
    expect(hit.error).toMatch(/Several nursery/);
  });

  it('asks for a pick when no nursery is designated', () => {
    const hit = resolveImportField({
      excelField: 'nursery',
      fields,
      nurseryFields: [],
    });
    expect(hit.field).toBeNull();
    expect(hit.needsPick).toBe(true);
    expect(hit.error).toMatch(/No Crop Rotation nursery/);
  });

  it('exact-matches NH-21 and does not treat it as nursery', () => {
    const hit = resolveImportField({
      excelField: 'NH-21',
      fields,
      nurseryFields: [GH01],
    });
    expect(hit.field?.id).toBe('nh21');
    expect(hit.source).toBe('exact');
    expect(hit.needsPick).toBe(false);
  });

  it('asks for a pick on unknown field codes', () => {
    const hit = resolveImportField({
      excelField: 'GH-99',
      fields,
      nurseryFields: [GH01],
    });
    expect(hit.field).toBeNull();
    expect(hit.needsPick).toBe(true);
    expect(hit.error).toMatch(/pick a field/);
  });

  it('uses a manual pick over auto nursery', () => {
    const hit = resolveImportField({
      excelField: 'nursery',
      fields,
      nurseryFields: [GH01],
      pickedFieldId: 'nh21',
    });
    expect(hit.field?.id).toBe('nh21');
    expect(hit.source).toBe('picked');
  });

  it('errors on a blank Field ID', () => {
    const hit = resolveImportField({ excelField: '  ', fields, nurseryFields: [GH01] });
    expect(hit.error).toBe('Missing Field ID');
    expect(hit.needsPick).toBe(false);
  });
});

describe('applyFieldPickToExcelValue', () => {
  it('applies the pick to every row with the same Excel Field ID', () => {
    const rows = [
      { fieldId: 'GH 03', _rowNum: 1 },
      { fieldId: 'GH 03 ', _rowNum: 2 },
      { fieldId: 'gh-03', _rowNum: 3 },
      { fieldId: 'NH-21', _rowNum: 4 },
      { fieldId: 'GH 3', _rowNum: 5 },
    ];
    const next = applyFieldPickToExcelValue(rows, 'GH 03', 'gh3');
    expect(next.filter((r) => r._pickedFieldId === 'gh3').map((r) => r._rowNum)).toEqual([1, 2, 3]);
    expect(next.find((r) => r._rowNum === 4)._pickedFieldId).toBeUndefined();
    expect(next.find((r) => r._rowNum === 5)._pickedFieldId).toBeUndefined();
  });

  it('clears the pick for the whole Excel Field ID group', () => {
    const rows = [
      { fieldId: 'GH 03', _pickedFieldId: 'gh3' },
      { fieldId: 'NH-21', _pickedFieldId: 'nh21' },
    ];
    const next = applyFieldPickToExcelValue(rows, 'GH 03', '');
    expect(next[0]._pickedFieldId).toBeNull();
    expect(next[1]._pickedFieldId).toBe('nh21');
  });
});
