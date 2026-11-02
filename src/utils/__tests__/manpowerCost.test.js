import {
  defaultPeriod,
  formatAed,
  nextScheduledRate,
  rateInForce,
  todayIso,
  workersOnPersonalRate,
} from '../manpowerCost';

const rate = (overrides) => ({
  id: overrides.id,
  siteId: 's1',
  category: 'Casual',
  workerId: null,
  ratePerHour: 8,
  effectiveFrom: '2026-01-01',
  createdAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('manpowerCost helpers', () => {
  it('defaultPeriod runs from the first of the month to today', () => {
    expect(defaultPeriod(new Date(2026, 9, 14))).toEqual({ startDate: '2026-10-01', endDate: '2026-10-14' });
    expect(todayIso(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('rateInForce picks the latest start date on or before the day', () => {
    const rows = [
      rate({ id: 'a', ratePerHour: 8, effectiveFrom: '2026-01-01' }),
      rate({ id: 'b', ratePerHour: 9, effectiveFrom: '2026-06-01' }),
      rate({ id: 'c', ratePerHour: 10, effectiveFrom: '2026-12-01' }),
    ];
    expect(rateInForce(rows, '2025-12-31')).toBeNull();
    expect(rateInForce(rows, '2026-05-31').id).toBe('a');
    expect(rateInForce(rows, '2026-06-01').id).toBe('b');
    expect(nextScheduledRate(rows, '2026-10-14').id).toBe('c');
  });

  it('workersOnPersonalRate drops workers who went back on the group rate', () => {
    const rows = [
      rate({ id: '1', workerId: 'w1', workerName: 'Ahmed', siteId: null, category: null, ratePerHour: 12, effectiveFrom: '2026-01-01' }),
      rate({ id: '2', workerId: 'w2', workerName: 'Bilal', siteId: null, category: null, ratePerHour: 15, effectiveFrom: '2026-01-01' }),
      rate({ id: '3', workerId: 'w2', workerName: 'Bilal', siteId: null, category: null, ratePerHour: null, effectiveFrom: '2026-09-01' }),
    ];
    const list = workersOnPersonalRate(rows, '2026-10-14');
    expect(list.map((w) => w.workerId)).toEqual(['w1']);
    expect(list[0].current.ratePerHour).toBe(12);
  });

  it('formatAed shows two decimals and a dash for missing values', () => {
    expect(formatAed(1234.5)).toBe('1,234.50');
    expect(formatAed(null)).toBe('-');
  });
});
