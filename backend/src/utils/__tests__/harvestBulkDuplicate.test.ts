import {
  harvestBulkShiftKey,
  harvestBulkTimeKey,
  isSameHarvestBulkDuplicate,
} from '../harvestBulkDuplicate';

describe('isSameHarvestBulkDuplicate', () => {
  it('allows a second shift the same day', () => {
    expect(isSameHarvestBulkDuplicate(
      { shiftNumber: '1', startTime: '08:00' },
      { shiftNumber: '2', startTime: '14:00' },
    )).toBe(false);
  });

  it('skips the same shift on re-import', () => {
    expect(isSameHarvestBulkDuplicate(
      { shiftNumber: '1', startTime: '08:00' },
      { shiftNumber: '1', startTime: '08:05' },
    )).toBe(true);
  });

  it('uses start time when both shifts are blank', () => {
    expect(isSameHarvestBulkDuplicate(
      { shiftNumber: '', startTime: '08:00' },
      { shiftNumber: '', startTime: '14:00' },
    )).toBe(false);
    expect(isSameHarvestBulkDuplicate(
      { shiftNumber: '', startTime: '8:00' },
      { shiftNumber: '', startTime: '08:00' },
    )).toBe(true);
  });

  it('treats two blank shift and blank time rows as the same', () => {
    expect(isSameHarvestBulkDuplicate(
      { shiftNumber: '', startTime: '' },
      { shiftNumber: null, startTime: null },
    )).toBe(true);
  });
});

describe('harvestBulkShiftKey / harvestBulkTimeKey', () => {
  it('normalizes shift and clock times', () => {
    expect(harvestBulkShiftKey(' 1 ')).toBe('1');
    expect(harvestBulkTimeKey('8:00')).toBe('08:00');
    expect(harvestBulkTimeKey('08:00:00')).toBe('08:00');
  });
});
