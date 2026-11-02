import {
  buildCostSummary,
  buildWorkerCostLines,
  costRows,
  resolveRate,
  type CostInputRow,
} from '../manpowerCost';

function row(overrides: Partial<CostInputRow> = {}): CostInputRow {
  return {
    recordId: 'r1',
    date: '2026-10-01',
    workerId: 'w1',
    employeeId: 'E001',
    workerName: 'Ahmed',
    category: 'Casual',
    siteId: 's1',
    siteName: 'Site A',
    activity: 'Pruning',
    hours: 8,
    personalRateFound: false,
    personalRate: null,
    groupRate: 8,
    ...overrides,
  };
}

describe('resolveRate', () => {
  it('uses the group rate when the worker has no personal rate', () => {
    expect(resolveRate({ personalRateFound: false, personalRate: null, groupRate: 8 }))
      .toEqual({ rate: 8, rateSource: 'group' });
  });

  it('uses the personal rate over the group rate', () => {
    expect(resolveRate({ personalRateFound: true, personalRate: 12, groupRate: 8 }))
      .toEqual({ rate: 12, rateSource: 'personal' });
  });

  it('falls back to the group rate when the personal rate was ended (null)', () => {
    expect(resolveRate({ personalRateFound: true, personalRate: null, groupRate: 8 }))
      .toEqual({ rate: 8, rateSource: 'group' });
  });

  it('keeps a personal rate of 0 instead of treating it as missing', () => {
    expect(resolveRate({ personalRateFound: true, personalRate: 0, groupRate: 8 }))
      .toEqual({ rate: 0, rateSource: 'personal' });
  });

  it('reports a missing rate when neither is in force', () => {
    expect(resolveRate({ personalRateFound: false, personalRate: null, groupRate: null }))
      .toEqual({ rate: null, rateSource: null });
  });
});

describe('buildWorkerCostLines', () => {
  it('splits a worker into one line per rate used in the period', () => {
    const lines = buildWorkerCostLines(costRows([
      row({ recordId: 'a', date: '2026-10-01', hours: 8, groupRate: 8 }),
      row({ recordId: 'b', date: '2026-10-02', hours: 4, groupRate: 8 }),
      row({ recordId: 'c', date: '2026-10-05', hours: 10, groupRate: 9 }),
    ]));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ rate: 8, rateSource: 'group', hours: 12, cost: 96, firstDate: '2026-10-01', lastDate: '2026-10-02' });
    expect(lines[1]).toMatchObject({ rate: 9, rateSource: 'group', hours: 10, cost: 90 });
  });

  it('rounds cost to 2 decimals', () => {
    const [line] = buildWorkerCostLines(costRows([row({ hours: 7.333, groupRate: 8.15 })]));
    expect(line.cost).toBe(59.76);
  });
});

describe('buildCostSummary', () => {
  const rows = costRows([
    row({ recordId: '1', workerId: 'w1', category: 'Casual', activity: 'Pruning', hours: 8, groupRate: 8 }),
    row({ recordId: '2', workerId: 'w1', category: 'Casual', activity: 'Harvest', hours: 2, groupRate: 8 }),
    row({
      recordId: '3', workerId: 'w2', workerName: 'Bilal', category: 'Permanent', activity: '',
      siteId: 's2', siteName: 'Site B', hours: 10, personalRateFound: true, personalRate: 15, groupRate: 10,
    }),
    row({ recordId: '4', workerId: 'w3', workerName: 'Chand', hours: 5, groupRate: null }),
  ]);
  const summary = buildCostSummary(rows);

  it('totals cost from costed hours only and reports missing-rate hours separately', () => {
    expect(summary.totals).toEqual({ cost: 230, hours: 25, costedHours: 20, missingRateHours: 5, workers: 3 });
  });

  it('splits cost by category, activity (blank = unassigned) and site', () => {
    expect(summary.byCategory).toEqual([
      { key: 'Permanent', label: 'Permanent', hours: 10, cost: 150 },
      { key: 'Casual', label: 'Casual', hours: 10, cost: 80 },
    ]);
    expect(summary.byActivity.map((b) => [b.key, b.cost])).toEqual([['', 150], ['Pruning', 64], ['Harvest', 16]]);
    expect(summary.bySite.map((b) => [b.label, b.cost])).toEqual([['Site B', 150], ['Site A', 80]]);
  });

  it('lists workers off the group rate with the difference vs group rate', () => {
    expect(summary.offGroupRate).toEqual([expect.objectContaining({
      workerId: 'w2', personalRates: [15], groupRate: 10, hours: 10, cost: 150, differenceVsGroup: 50,
    })]);
  });

  it('lists workers with hours that have no rate', () => {
    expect(summary.missingRate).toEqual([expect.objectContaining({ workerId: 'w3', hours: 5 })]);
  });

  it('cost by activity adds up to total cost', () => {
    const sum = summary.byActivity.reduce((s, b) => s + b.cost, 0);
    expect(sum).toBeCloseTo(summary.totals.cost, 2);
  });
});
