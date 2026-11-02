import {
  defaultHarvestDateRange,
  farmTodayYmd,
  filterHarvestEntries,
  harvestDateRangeError,
  harvestMatchesVariety,
} from '../harvestEntryFilters';

describe('harvestEntryFilters', () => {
  it('defaults the range to the Dubai month through today', () => {
    const range = defaultHarvestDateRange(new Date('2026-09-20T21:30:00.000Z'));
    expect(farmTodayYmd(new Date('2026-09-20T21:30:00.000Z'))).toBe('2026-09-21');
    expect(range).toEqual({ from: '2026-09-01', to: '2026-09-21' });
  });

  it('rejects from after to', () => {
    expect(harvestDateRangeError('2026-09-10', '2026-09-01')).toMatch(/on or before/);
    expect(harvestDateRangeError('2026-09-01', '2026-09-10')).toBeNull();
  });

  it('matches any variety on the row', () => {
    const entry = { cropName: 'Tomato', varieties: [{ variety: 'Roma' }, { variety: 'Elpida' }] };
    expect(harvestMatchesVariety(entry, 'Elpida')).toBe(true);
    expect(filterHarvestEntries([entry, { cropName: 'Cucumber', varieties: [{ variety: 'Dania' }] }], {
      cropName: 'Tomato',
      variety: 'Elpida',
    })).toEqual([entry]);
  });
});
