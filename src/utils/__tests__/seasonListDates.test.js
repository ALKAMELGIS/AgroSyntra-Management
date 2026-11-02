import {
  farmTodayYmd,
  clampDateToSeason,
  intersectDateRange,
  isEndedSeason,
  isSeasonLocked,
  pickDefaultSeasonId,
  seasonListDateRange,
  seasonsToCsv,
  toSeasonYmd,
  unusedPastSeasonWindow,
} from '../seasonListDates';
import { getDateRangeForPreset } from '../entryDateRange';

describe('farmTodayYmd', () => {
  it('uses Asia/Dubai so late UTC evening is the next farm day', () => {
    expect(farmTodayYmd(new Date('2026-09-16T22:00:00.000Z'))).toBe('2026-09-17');
    expect(farmTodayYmd(new Date('2026-09-16T19:00:00.000Z'))).toBe('2026-09-16');
  });
});

describe('seasonListDateRange', () => {
  it('reads start_date and end_date', () => {
    expect(seasonListDateRange({
      start_date: '2025-09-01T00:00:00.000Z',
      end_date: '2026-07-31',
      planned_end_date: '2026-07-15',
    })).toEqual({ startDate: '2025-09-01', endDate: '2026-07-31' });
  });

  it('falls back to planned_end_date while the season is still open', () => {
    expect(seasonListDateRange({
      start_date: '2025-09-01',
      planned_end_date: '2026-07-31',
      end_date: null,
    })).toEqual({ startDate: '2025-09-01', endDate: '2026-07-31' });
  });

  it('clamps a pick that sits outside the season', () => {
    expect(clampDateToSeason('2024-01-01', '2025-09-01', '2026-07-31')).toBe('2025-09-01');
    expect(clampDateToSeason('2026-12-01', '2025-09-01', '2026-07-31')).toBe('2026-07-31');
  });
});

describe('isEndedSeason', () => {
  it('locks an End Season year and reopen_pending, not a historical closed year', () => {
    expect(isEndedSeason({ status: 'open' })).toBe(false);
    expect(isEndedSeason({ status: 'closed', closed_by: null })).toBe(false);
    expect(isEndedSeason({ status: 'closed', closed_by: 'user-1' })).toBe(true);
    expect(isEndedSeason({ status: 'reopen_pending', closed_by: 'user-1' })).toBe(true);
  });
});

describe('isSeasonLocked', () => {
  it('locks ended, pending, and historical until reopened_at is set', () => {
    expect(isSeasonLocked({ status: 'open' })).toBe(false);
    expect(isSeasonLocked({ status: 'closed', closed_by: null })).toBe(true);
    expect(isSeasonLocked({ status: 'closed', closed_by: null, reopened_at: '2026-09-01' })).toBe(false);
    expect(isSeasonLocked({ status: 'closed', closed_by: 'user-1' })).toBe(true);
    expect(isSeasonLocked({ status: 'reopen_pending', closed_by: null })).toBe(true);
  });
});

describe('pickDefaultSeasonId', () => {
  it('falls back to the last listed closed year when none is open', () => {
    expect(pickDefaultSeasonId([
      { id: 'ended', status: 'closed' },
      { id: 'hist', status: 'closed' },
    ], '')).toBe('ended');
    expect(pickDefaultSeasonId([
      { id: 'ended', status: 'closed' },
      { id: 'open', status: 'open' },
    ], '')).toBe('open');
    expect(pickDefaultSeasonId([
      { id: 'ended', status: 'closed' },
    ], 'ended')).toBe('ended');
  });
});

describe('unusedPastSeasonWindow', () => {
  it('skips names that already exist', () => {
    expect(unusedPastSeasonWindow(
      [{ name: '2026-2027' }, { name: '2025-2026' }],
      new Date(Date.UTC(2026, 8, 15)),
    )).toEqual({
      name: '2024-2025',
      startDate: '2024-09-01',
      plannedEndDate: '2025-07-31',
    });
  });
});

describe('seasonsToCsv', () => {
  it('writes one header and one data row', () => {
    expect(seasonsToCsv([{
      name: '2025-2026',
      start_date: '2025-09-01T00:00:00.000Z',
      planned_end_date: '2026-07-31',
      end_date: '2026-07-31',
      status: 'closed',
    }])).toBe('name,start_date,planned_end_date,end_date,status\n2025-2026,2025-09-01,2026-07-31,2026-07-31,closed');
  });
});

describe('toSeasonYmd', () => {
  it('keeps a calendar day from a Date at UTC midnight', () => {
    expect(toSeasonYmd(new Date(Date.UTC(2025, 8, 1)))).toBe('2025-09-01');
  });
});

describe('getDateRangeForPreset with a season', () => {
  const season = { startDate: '2025-09-01', endDate: '2026-07-31' };

  it('uses the season window for the season and all-time presets', () => {
    expect(getDateRangeForPreset('season', season)).toEqual({
      start_date: '2025-09-01',
      end_date: '2026-07-31',
    });
    expect(getDateRangeForPreset('all', season)).toEqual({
      start_date: '2025-09-01',
      end_date: '2026-07-31',
    });
  });

  it('keeps a narrower preset inside the season', () => {
    expect(intersectDateRange(
      { startDate: '2026-01-01', endDate: '2026-12-31' },
      season,
    )).toEqual({ startDate: '2026-01-01', endDate: '2026-07-31' });
  });
});
