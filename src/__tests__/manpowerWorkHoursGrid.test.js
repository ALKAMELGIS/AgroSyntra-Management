import {
  buildWorkHoursSummaryGrid,
  productivityForRowActivity,
} from '../utils/manpowerWorkHoursGrid';
import { buildWorkersCountRowOrder } from '../utils/manpowerSiteRowOrder';

describe('manpowerWorkHoursGrid', () => {
  const cells = [
    {
      date: '2026-08-01',
      crop: 'Tomato Beef',
      variety: 'Elpida F1',
      activity: 'Harvesting',
      casual: 0,
      eag: 1,
      casualHours: 0,
      eagHours: 4,
      actual: 100,
      unit: 'kg',
    },
    {
      date: '2026-08-01',
      crop: 'Snack Cucumber',
      variety: 'V2',
      activity: 'Harvesting',
      casual: 0,
      eag: 1,
      casualHours: 0,
      eagHours: 3,
    },
  ];

  const pivotData = {
    dates: ['2026-08-01'],
    siteCrops: ['Tomato Beef', 'Snack Cucumber'],
    cells,
  };

  it('splits one worker across two crops with correct hours', () => {
    const rowOrder = ['General', 'Snack Cucumber', 'Tomato Beef'];
    const grid = buildWorkHoursSummaryGrid(pivotData, 'eag', {
      groupBy: 'crop',
      rowOrder,
    });
    const beefRow = grid.rows.find((r) => r.rowKey === 'Tomato Beef');
    const cucRow = grid.rows.find((r) => r.rowKey === 'Snack Cucumber');
    const harvestIdx = grid.activityCols.findIndex((a) => a.key === 'Harvesting');
    expect(beefRow.workers[harvestIdx]).toBe('1');
    expect(beefRow.hours[harvestIdx]).toBe('4');
    expect(cucRow.workers[harvestIdx]).toBe('1');
    expect(cucRow.hours[harvestIdx]).toBe('3');
  });

  it('routes unmapped activity hours into the Other column instead of dropping them', () => {
    const withUnmapped = {
      ...pivotData,
      activities: [{ key: 'Harvesting', label: 'Harvesting' }],
      cells: [
        ...cells,
        {
          date: '2026-08-01',
          crop: 'Tomato Beef',
          variety: 'Elpida F1',
          activity: 'Bed Preparation',
          casual: 0,
          eag: 2,
          casualHours: 0,
          eagHours: 6,
        },
      ],
    };
    const grid = buildWorkHoursSummaryGrid(withUnmapped, 'eag', {
      groupBy: 'crop',
      rowOrder: ['General', 'Snack Cucumber', 'Tomato Beef'],
    });
    const beefRow = grid.rows.find((r) => r.rowKey === 'Tomato Beef');
    const otherIdx = grid.activityCols.findIndex((a) => a.key === '__other__');

    expect(otherIdx).toBeGreaterThan(-1);
    expect(beefRow.hours[otherIdx]).toBe('6');
    expect(beefRow.workers[otherIdx]).toBe('2');
    // 4h harvesting + 6h unmapped must both survive into the row total.
    expect(beefRow.rowTotalH).toBe('10');
  });

  it('keeps total-metric row totals equal to the sum of all cell hours', () => {
    const withUnmapped = {
      ...pivotData,
      activities: [{ key: 'Harvesting', label: 'Harvesting' }],
      cells: [
        ...cells,
        {
          date: '2026-08-01',
          crop: 'Tomato Beef',
          activity: 'Scouting',
          casual: 1,
          eag: 0,
          casualHours: 5,
          eagHours: 0,
        },
      ],
    };
    const grid = buildWorkHoursSummaryGrid(withUnmapped, 'total', {
      groupBy: 'crop',
      rowOrder: ['General', 'Snack Cucumber', 'Tomato Beef'],
    });
    expect(grid.footer.rowTotalH).toBe('12');
  });

  it('buildWorkersCountRowOrder fallback still works for hours tab rows', () => {
    const order = buildWorkersCountRowOrder({
      groupBy: 'crop',
      siteCrops: [],
      cells,
      pivotCrops: ['Tomato Beef', 'Snack Cucumber'],
    });
    expect(order).toContain('Tomato Beef');
    expect(order).toContain('Snack Cucumber');
  });

  it('productivityForRowActivity detects mixed units', () => {
    const mixed = {
      cells: [
        ...cells,
        {
          date: '2026-08-02',
          crop: 'Tomato Beef',
          variety: 'Elpida F1',
          activity: 'Harvesting',
          eag: 1,
          eagHours: 2,
          actual: 5,
          unit: 'boxes',
        },
      ],
    };
    const prod = productivityForRowActivity(mixed, 'Tomato Beef', 'Harvesting', 'crop');
    expect(prod.mixedUnits).toBe(true);
    expect(prod.hoursPerUnit).toBeNull();
  });
});
