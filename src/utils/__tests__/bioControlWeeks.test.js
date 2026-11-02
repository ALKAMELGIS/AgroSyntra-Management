import {
  DEFAULT_NEW_WEEK_COUNT,
  MAX_BIO_WEEKS,
  defaultNewStartDate,
  formatIsoDate,
  mondayOf,
  pickSeasonForSetup,
  programDateSpan,
  resolveWeek1Start,
  toDateInputValue,
  weekOverlapsRange,
  weekToDateRange,
  weeksFromCount,
  defaultNewStartDateForSeason,
  formatPackCost,
  packCost,
  resolvedSitePrice,
} from '../bioControlWeeks';

describe('mondayOf / parse local dates', () => {
  it('snaps a local Wednesday to that week Monday', () => {
    expect(formatIsoDate(mondayOf('2026-06-03'))).toBe('2026-06-01');
  });

  it('keeps an already-Monday date', () => {
    expect(formatIsoDate(mondayOf('2026-06-01'))).toBe('2026-06-01');
  });

  it('does not shift a date-only string via UTC midnight', () => {
    expect(formatIsoDate(mondayOf('2026-01-05'))).toBe('2026-01-05');
  });
});

describe('weekToDateRange', () => {
  it('uses the chosen Week 1 Monday, not January', () => {
    expect(weekToDateRange(1, '2026-06-01')).toBe('Jun 1 – Jun 7');
    expect(weekToDateRange(2, '2026-06-01')).toBe('Jun 8 – Jun 14');
    expect(weekToDateRange(36, '2026-06-01')).toBe('Feb 1 – Feb 7');
  });

  it('keeps January mapping when only year is passed (legacy sheets)', () => {
    expect(weekToDateRange(1, 2025)).toBe('Jan 6 – Jan 12');
  });

  it('uses start_week + year when start_date is missing', () => {
    const start = resolveWeek1Start({ year: 2025, startWeek: 1 });
    expect(weekToDateRange(1, { year: 2025, startWeek: 1 })).toBe(weekToDateRange(1, start));
  });
});

describe('weeksFromCount', () => {
  it('defaults to 36 and can add one week', () => {
    expect(weeksFromCount(DEFAULT_NEW_WEEK_COUNT)).toHaveLength(36);
    expect(weeksFromCount(37)).toEqual(expect.arrayContaining([36, 37]));
    expect(weeksFromCount(37)).toHaveLength(37);
  });

  it('caps at 53', () => {
    expect(weeksFromCount(99)).toHaveLength(MAX_BIO_WEEKS);
  });
});

describe('toDateInputValue', () => {
  it('strips a timestamp to a Monday ISO date', () => {
    expect(toDateInputValue('2026-06-03T00:00:00.000Z')).toBe('2026-06-01');
  });
});

describe('defaultNewStartDate', () => {
  it('returns an ISO Monday', () => {
    expect(defaultNewStartDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(mondayOf(defaultNewStartDate())?.getDay()).toBe(1);
  });
});

describe('pickSeasonForSetup', () => {
  const seasonA = { id: 'a', start_date: '2024-09-01', planned_end_date: '2025-06-30' };
  const seasonB = { id: 'b', start_date: '2025-09-01', planned_end_date: '2026-06-30' };

  it('prefers the season that contains Week 1 start_date', () => {
    expect(pickSeasonForSetup({
      startDate: '2026-01-15',
      year: 2025,
      seasons: [seasonA, seasonB],
    })?.id).toBe('b');
  });

  it('does not use Jan 1 of year when that day is before the current season', () => {
    expect(pickSeasonForSetup({
      year: 2025,
      seasons: [seasonB],
    })?.id).toBe('b');
  });

  it('uses Jan 1 of year when it falls inside a season', () => {
    expect(pickSeasonForSetup({
      year: 2026,
      seasons: [seasonA, seasonB],
    })?.id).toBe('b');
  });
});

describe('weekOverlapsRange / programDateSpan', () => {
  it('keeps June week 36 when the season ended in June', () => {
    expect(weekOverlapsRange(36, '2026-06-01', '2026-06-01', '2027-02-07')).toBe(true);
    expect(weekOverlapsRange(36, '2026-06-01', '2025-09-01', '2026-06-30')).toBe(false);
  });

  it('returns the full program window', () => {
    expect(programDateSpan(36, '2026-06-01')).toEqual({
      startDate: '2026-06-01',
      endDate: '2027-02-07',
    });
  });
});

describe('packCost', () => {
  it('is units times site price, not divided by per package', () => {
    expect(packCost(3, 10)).toBe(30);
    expect(packCost(1, 10)).toBe(10);
  });

  it('shows a dash when units exist but price is missing', () => {
    expect(formatPackCost(3, null)).toBe('—');
    expect(formatPackCost(3, 0)).toBe('—');
    expect(formatPackCost(3, 10)).toBe('30.00');
    expect(formatPackCost(0, 10)).toBe('');
  });

  it('treats 0 as an unset site price', () => {
    expect(resolvedSitePrice(0)).toBeNull();
    expect(resolvedSitePrice(10)).toBe(10);
  });
});

describe('defaultNewStartDateForSeason', () => {
  const season = { start_date: '2025-09-01', planned_end_date: '2026-06-30' };

  it('uses today when today is inside the season', () => {
    expect(defaultNewStartDateForSeason(season, new Date(2026, 0, 7))).toBe('2026-01-05');
  });

  it('falls back to the season start Monday', () => {
    expect(defaultNewStartDateForSeason(season, new Date(2024, 0, 7))).toBe('2025-09-01');
  });
});
