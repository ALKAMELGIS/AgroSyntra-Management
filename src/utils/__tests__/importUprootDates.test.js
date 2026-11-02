import {
  fieldAliasKey,
  indexExistingPlantings,
  inheritCompanionSegments,
  isValidImportUprootDate,
  matchPlantingImportField,
  markCompanionSkipOccupancy,
  plantingIdentityKey,
  prepareImportRows,
  requiredImportUprootSlots,
} from '../importUprootDates';

const BL07 = { id: 'bl07', name: 'BL-07' };
const BL06 = { id: 'bl06', name: 'BL-06' };

function sweetCornRows(overrides = {}) {
  return [
    {
      fieldId: 'bl07',
      fieldName: 'BL-07',
      _resolvedFieldId: 'bl07',
      _seedDate: '2025-09-15',
      variety: 'Astronaut',
      segment: '6 TO 10',
      _isUpdate: false,
      ...overrides.sep,
    },
    {
      fieldId: 'bl07',
      fieldName: 'BL-07',
      _resolvedFieldId: 'bl07',
      _seedDate: '2025-10-20',
      variety: 'Astronaut',
      segment: '2 To 5',
      _isUpdate: false,
      ...overrides.oct,
    },
    {
      fieldId: 'bl07',
      fieldName: 'BL-07',
      _resolvedFieldId: 'bl07',
      _seedDate: '2025-10-20',
      variety: 'Garrison',
      segment: '4-B1',
      _isUpdate: false,
      ...overrides.trial,
    },
    {
      fieldId: 'bl07',
      fieldName: 'BL-07',
      _resolvedFieldId: 'bl07',
      _seedDate: '2026-02-04',
      variety: 'Astronaut',
      segment: '2 To 5',
      _isUpdate: false,
      ...overrides.feb,
    },
  ];
}

describe('fieldAliasKey / matchPlantingImportField', () => {
  it('treats BL-07, BL-7 and BL -07 as one field', () => {
    expect(fieldAliasKey('BL-07')).toBe('bl7');
    expect(fieldAliasKey('BL-7')).toBe('bl7');
    expect(fieldAliasKey('BL -07')).toBe('bl7');
    expect(matchPlantingImportField('BL-7', [BL07, BL06])?.id).toBe('bl07');
    expect(matchPlantingImportField('BL -06', [BL07, BL06])?.id).toBe('bl06');
  });

  it('does not silently pick when two catalog names share an alias', () => {
    expect(matchPlantingImportField('BL -7', [
      { id: 'a', name: 'BL-07' },
      { id: 'b', name: 'BL-7' },
    ])).toBeNull();
  });
});

describe('plantingIdentityKey', () => {
  it('keeps same-day varieties as separate rows', () => {
    const a = plantingIdentityKey('bl07', '2025-10-20', 'Astronaut', '2 To 5');
    const b = plantingIdentityKey('bl07', '2025-10-20', 'Garrison', '4-B1');
    const c = plantingIdentityKey('bl07', '2025-10-20', 'Astronaut', '2 TO 5');
    expect(a).not.toBe(b);
    expect(a).toBe(c);
  });
});

describe('inheritCompanionSegments', () => {
  it('fills a blank companion from the group main segment so it is not ALL', () => {
    const rows = inheritCompanionSegments([
      { _resolvedFieldId: 'bl07', _seedDate: '2025-10-20', segment: '2 To 5', variety: 'Astronaut' },
      { _resolvedFieldId: 'bl07', _seedDate: '2025-10-20', segment: '', variety: 'Tyson' },
      { _resolvedFieldId: 'bl07', _seedDate: '2025-10-20', segment: '4-B1', variety: 'Garrison' },
    ]);
    expect(rows[1].segment).toBe('2 To 5');
    expect(rows[1]._inheritedSegment).toBe(true);
    expect(rows[2].segment).toBe('4-B1');
  });
});

describe('requiredImportUprootSlots', () => {
  it('asks for one uproot on BL-07 between Oct 2-5 (plus 4-B1) and Feb 2-5', () => {
    const slots = requiredImportUprootSlots(sweetCornRows());
    expect(slots).toHaveLength(1);
    expect(slots[0].afterDate).toBe('2025-10-20');
    expect(slots[0].beforeDate).toBe('2026-02-04');
    expect(slots[0].previousSegments).toEqual(expect.arrayContaining(['2-5', '4-B1']));
    expect(slots[0].previousSegments).not.toContain('6-10');
  });

  it('does not require an uproot between Sep 6-10 and Oct 2-5', () => {
    const slots = requiredImportUprootSlots(sweetCornRows());
    expect(slots.some((slot) => slot.afterDate === '2025-09-15')).toBe(false);
  });

  it('does not ask again when every overlapping row is already in the app', () => {
    const slots = requiredImportUprootSlots(sweetCornRows({
      sep: { _isUpdate: true },
      oct: { _isUpdate: true },
      trial: { _isUpdate: true },
      feb: { _isUpdate: true },
    }));
    expect(slots).toHaveLength(0);
  });

  it('asks when Feb is new and Oct is already live', () => {
    const slots = requiredImportUprootSlots(sweetCornRows({
      sep: { _isUpdate: true },
      oct: { _isUpdate: true },
      trial: { _isUpdate: true },
    }));
    expect(slots).toHaveLength(1);
    expect(slots[0].beforeDate).toBe('2026-02-04');
  });
});

describe('isValidImportUprootDate', () => {
  it('allows a date on or after the previous plant and before the next', () => {
    expect(isValidImportUprootDate('2025-10-20', '2025-10-20', '2026-02-04')).toBe(true);
    expect(isValidImportUprootDate('2026-02-03', '2025-10-20', '2026-02-04')).toBe(true);
    expect(isValidImportUprootDate('2026-02-04', '2025-10-20', '2026-02-04')).toBe(false);
    expect(isValidImportUprootDate('2025-10-19', '2025-10-20', '2026-02-04')).toBe(false);
  });
});

describe('markCompanionSkipOccupancy', () => {
  it('skips occupancy on extra same-day varieties', () => {
    const marked = markCompanionSkipOccupancy(sweetCornRows());
    const oct = marked.filter((row) => row._seedDate === '2025-10-20');
    expect(oct[0]._skipOccupancy).toBe(false);
    expect(oct[1]._skipOccupancy).toBe(true);
  });
});

describe('indexExistingPlantings', () => {
  it('prefers the live row when an uprooted duplicate exists', () => {
    const map = indexExistingPlantings([
      {
        id: 'old', fieldId: 'bl07', seedingDate: '2025-10-20',
        varietyName: 'Astronaut', segment: '2 To 5', status: 'uprooted',
      },
      {
        id: 'live', fieldId: 'bl07', seedingDate: '2025-10-20',
        varietyName: 'Astronaut', segment: '2 TO 5', status: 'active',
      },
    ]);
    expect(map[plantingIdentityKey('bl07', '2025-10-20', 'Astronaut', '2 To 5')].id).toBe('live');
  });
});

describe('prepareImportRows', () => {
  it('inherits then marks skip occupancy', () => {
    const prepared = prepareImportRows([
      { _resolvedFieldId: 'bl07', _seedDate: '2025-10-20', segment: '2 To 5', _isUpdate: false },
      { _resolvedFieldId: 'bl07', _seedDate: '2025-10-20', segment: '', _isUpdate: false },
    ]);
    expect(prepared[1].segment).toBe('2 To 5');
    expect(prepared[1]._skipOccupancy).toBe(true);
  });
});
