import {
  CROP_PAGE_STRUCTURES,
  IRRIGATION_STRUCTURES,
  getAvailableCropPageStructureTabs,
  getAvailableStructureTabs,
  groupFieldsByStructure,
} from '../fieldTypeHelpers';

const fields = [
  { id: 'p1', name: 'P1', type: 'PIVOT' },
  { id: 'n1', name: 'NH-1', type: 'Nethouse' },
  { id: 'g1', name: 'GH-1', type: 'Greenhouse' },
  { id: 'of1', name: 'OF-1', type: 'Open Field' },
  { id: 'cravo', name: 'Cravo-1', type: 'Cravo' },
  { id: 'glass', name: 'GL-1', type: 'Glasshouse' },
];

describe('fieldTypeHelpers crop-page structures', () => {
  it('keeps irrigation tabs pivot-first and without Other', () => {
    expect(IRRIGATION_STRUCTURES.map((s) => s.id)).toEqual([
      'pivot', 'nethouse', 'greenhouse', 'openfield',
    ]);
    const grouped = groupFieldsByStructure(fields);
    expect(getAvailableStructureTabs(grouped).map((s) => s.id)).toEqual([
      'pivot', 'nethouse', 'greenhouse', 'openfield',
    ]);
  });

  it('puts leftover types in other and lists crop tabs nethouse-first', () => {
    expect(CROP_PAGE_STRUCTURES.map((s) => s.id)).toEqual([
      'nethouse', 'greenhouse', 'openfield', 'pivot', 'other',
    ]);
    const grouped = groupFieldsByStructure(fields);
    expect(grouped.other.map((f) => f.id)).toEqual(['cravo', 'glass']);
    expect(getAvailableCropPageStructureTabs(grouped).map((s) => s.id)).toEqual([
      'nethouse', 'greenhouse', 'openfield', 'pivot', 'other',
    ]);
  });
});
