import {
  aggregatePivotCells,
  buildWorkersCountCropSummaryPair,
  buildWorkersCountSummaryGrid,
  latestPivotDateInRange,
  localIsoDate,
  normalizePivotDate,
  normalizeSummaryActivity,
  pivotHasRecordsOnDate,
  rollupActivityAggToByCrop,
} from '../utils/manpowerWorkersCountSummaryGrid';
import { buildWorkersCountRowOrder } from '../utils/manpowerSiteRowOrder';

describe('manpowerWorkersCountSummaryGrid', () => {
  const cells = [
    {
      date: '2026-07-29T00:00:00.000Z',
      crop: 'General',
      variety: 'General',
      activity: 'Operator',
      casual: 0,
      eag: 5,
    },
    {
      date: '2026-07-29',
      crop: 'Tomato Plum',
      variety: 'Plum Cherry Mix',
      activity: 'Harvesting',
      casual: 1,
      eag: 9,
    },
    {
      date: '2026-07-15',
      crop: 'General',
      variety: 'General',
      activity: 'Supervisor',
      casual: 0,
      eag: 3,
    },
  ];

  const pivotData = {
    dates: ['2026-07-15', '2026-07-29T00:00:00.000Z'],
    siteCrops: ['Tomato Plum'],
    siteVarieties: ['Plum Cherry Mix'],
    cells,
  };

  const cropRowOrder = ['General', 'Tomato Plum'];
  const varietyRowOrder = ['General', 'Plum Cherry Mix'];

  it('normalizePivotDate handles ISO datetime', () => {
    expect(normalizePivotDate('2026-07-29T00:00:00.000Z')).toBe('2026-07-29');
    expect(normalizePivotDate('2026-07-29')).toBe('2026-07-29');
  });

  it('aggregatePivotCells matches dates when cell date has timezone suffix', () => {
    const agg = aggregatePivotCells(cells, ['2026-07-29'], 'crop');
    expect(agg.get('General|Operator')?.eag).toBe(5);
    expect(agg.get('Tomato Plum|Harvesting')?.eag).toBe(9);
  });

  it('activity grid with From-To matches till range, not daily report date', () => {
    const pair = buildWorkersCountCropSummaryPair(pivotData, {
      dailyReportDate: '2026-07-29',
      tillStartDate: '2026-07-01',
      tillEndDate: '2026-07-31',
      groupBy: 'crop',
      rowOrder: cropRowOrder,
    });
    expect(pair.till.footer.eag).toBe(17);
    expect(pair.till.footer.casual).toBe(1);
    expect(pair.daily.footer.eag).toBe(14);

    const activityGrid = buildWorkersCountSummaryGrid(pivotData, 'eag', {
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      dailyReportDate: '2026-07-29',
      groupBy: 'crop',
      rowOrder: cropRowOrder,
    });
    expect(activityGrid.headers).toContain('Other');
    expect(activityGrid.footer.rowTotal).toBe(pair.till.footer.eag);
    expect(activityGrid.footer.rowTotal).not.toBe(pair.daily.footer.eag);
  });

  it('grid row total including Other equals daily summary total per crop', () => {
    const unmappedPivot = {
      dates: ['2026-07-29'],
      cells: [
        ...cells.filter((c) => normalizePivotDate(c.date) === '2026-07-29'),
        {
          date: '2026-07-29',
          crop: 'Tomato Plum',
          variety: 'Plum Cherry Mix',
          activity: 'Scouting',
          casual: 2,
          eag: 0,
        },
      ],
    };
    const pair = buildWorkersCountCropSummaryPair(unmappedPivot, {
      dailyReportDate: '2026-07-29',
      tillStartDate: '2026-07-01',
      tillEndDate: '2026-07-31',
      groupBy: 'crop',
      rowOrder: cropRowOrder,
    });
    const grid = buildWorkersCountSummaryGrid(unmappedPivot, 'total', {
      dailyReportDate: '2026-07-29',
      groupBy: 'crop',
      rowOrder: cropRowOrder,
    });
    for (const row of grid.rows) {
      const dailyRow = pair.daily.rows.find((r) => r.crop === row.crop);
      const dailyTotal = (dailyRow?.eag || 0) + (dailyRow?.casual || 0);
      expect(row.rowTotal).toBe(dailyTotal);
    }
  });

  it('activity grid without date filter sums full loaded range', () => {
    const activityGrid = buildWorkersCountSummaryGrid(pivotData, 'eag', {
      groupBy: 'crop',
      rowOrder: cropRowOrder,
    });
    expect(activityGrid.footer.rowTotal).toBe(17);
  });

  it('activity grid with only dailyReportDate still filters to that day', () => {
    const activityGrid = buildWorkersCountSummaryGrid(pivotData, 'eag', {
      dailyReportDate: '2026-07-10',
      groupBy: 'crop',
      rowOrder: cropRowOrder,
    });
    expect(activityGrid.footer.rowTotal).toBe(0);
  });

  it('latestPivotDateInRange returns last sorted date with records', () => {
    expect(latestPivotDateInRange(pivotData, '2026-07-01', '2026-07-31')).toBe('2026-07-29');
    expect(latestPivotDateInRange(pivotData, '2026-07-01', '2026-07-20')).toBe('2026-07-15');
    expect(latestPivotDateInRange(pivotData, '2026-06-01', '2026-06-30')).toBe('');
  });

  it('pivotHasRecordsOnDate is false for dates outside loaded cells', () => {
    expect(pivotHasRecordsOnDate(pivotData, '2026-07-29')).toBe(true);
    expect(pivotHasRecordsOnDate(pivotData, '2026-07-10')).toBe(false);
  });

  it('daily report only includes chosen date', () => {
    const pair = buildWorkersCountCropSummaryPair(pivotData, {
      dailyReportDate: '2026-07-29',
      tillStartDate: '2026-07-01',
      tillEndDate: '2026-07-31',
      groupBy: 'crop',
      rowOrder: cropRowOrder,
    });
    expect(pair.daily.footer.eag).toBe(14);
    expect(pair.daily.rows.find((r) => r.crop === 'General')?.eag).toBe(5);

    const rollup = rollupActivityAggToByCrop(
      aggregatePivotCells(cells, ['2026-07-29'], 'crop'),
    );
    expect(rollup.get('General')?.eag).toBe(5);
  });

  it('variety mode groups activity grid and summaries by variety', () => {
    const pair = buildWorkersCountCropSummaryPair(pivotData, {
      dailyReportDate: '2026-07-29',
      tillStartDate: '2026-07-01',
      tillEndDate: '2026-07-31',
      groupBy: 'variety',
      rowOrder: varietyRowOrder,
    });
    expect(pair.daily.rows.find((r) => r.crop === 'Plum Cherry Mix')?.eag).toBe(9);
    expect(pair.daily.headers[0]).toBe('Variety');
    expect(pair.till.headers[0]).toBe('Variety');

    const activityGrid = buildWorkersCountSummaryGrid(pivotData, 'eag', {
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      groupBy: 'variety',
      rowOrder: varietyRowOrder,
    });
    expect(activityGrid.headers[0]).toBe('Variety');
    expect(activityGrid.footer.rowTotal).toBe(pair.till.footer.eag);
  });

  it('crop mode uses field crop on cells not variety name', () => {
    const fieldCropCells = [
      {
        date: '2026-07-29',
        crop: 'Tomato Plum',
        variety: 'Arancia RZ',
        activity: 'Harvesting',
        casual: 1,
        eag: 2,
      },
    ];
    const fieldPivot = {
      dates: ['2026-07-29'],
      siteCrops: ['Tomato Plum'],
      siteVarieties: ['Arancia RZ'],
      cells: fieldCropCells,
    };
    const rowOrder = ['General', 'Tomato Plum'];
    const grid = buildWorkersCountSummaryGrid(fieldPivot, 'eag', {
      startDate: '2026-07-29',
      endDate: '2026-07-29',
      groupBy: 'crop',
      rowOrder,
    });
    expect(grid.footer.rowTotal).toBe(2);
    expect(grid.rows.find((r) => r.crop === 'Tomato Plum')?.rowTotal).toBe(2);
  });

  it('daily and till summaries share the same row list', () => {
    const pair = buildWorkersCountCropSummaryPair(pivotData, {
      dailyReportDate: '2026-07-29',
      tillStartDate: '2026-07-01',
      tillEndDate: '2026-07-31',
      groupBy: 'crop',
      rowOrder: cropRowOrder,
    });
    expect(pair.daily.rows.map((r) => r.crop)).toEqual(pair.till.rows.map((r) => r.crop));
  });

  it('localIsoDate uses the local calendar, not UTC', () => {
    const d = new Date(2026, 7, 20, 0, 30, 0);
    expect(localIsoDate(d)).toBe('2026-08-20');
  });

  it('normalizeSummaryActivity maps aliases to grid keys', () => {
    expect(normalizeSummaryActivity('nursery')).toBe('Nursary');
    expect(normalizeSummaryActivity('office')).toBe('Office');
    expect(normalizeSummaryActivity('Bed Making')).toBe('Bed Making/Mulching');
    expect(normalizeSummaryActivity('Bed preparation')).toBe('Bed preparation');
  });

  it('activity grid counts Office and aliased Nursery in a From-To range', () => {
    const officePivot = {
      dates: ['2026-07-29'],
      siteCrops: [],
      cells: [
        { date: '2026-07-29', crop: 'General', activity: 'Office', casual: 0, eag: 2 },
        { date: '2026-07-29', crop: 'General', activity: 'nursery', casual: 0, eag: 3 },
      ],
    };
    const grid = buildWorkersCountSummaryGrid(officePivot, 'eag', {
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      groupBy: 'crop',
      rowOrder: ['General'],
    });
    expect(grid.footer.rowTotal).toBe(5);
    const officeIdx = grid.headers.indexOf('Office') - 1;
    const nurseryIdx = grid.headers.indexOf('Nursery') - 1;
    expect(grid.rows[0].cells[officeIdx]).toBe(2);
    expect(grid.rows[0].cells[nurseryIdx]).toBe(3);
  });

  it('buckets Bed preparation into Other rather than Bed Making/Mulching', () => {
    const pivot = {
      dates: ['2026-08-11'],
      siteCrops: [],
      cells: [
        { date: '2026-08-11', crop: 'General', activity: 'Bed preparation', casual: 0, eag: 4 },
      ],
    };
    const grid = buildWorkersCountSummaryGrid(pivot, 'eag', {
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      groupBy: 'crop',
      rowOrder: ['General'],
    });
    const bedIdx = grid.headers.indexOf('Bed Making/Mulching') - 1;
    const otherIdx = grid.headers.indexOf('Other') - 1;
    expect(grid.rows[0].cells[bedIdx]).toBe(0);
    expect(grid.rows[0].cells[otherIdx]).toBe(4);
    expect(grid.footer.rowTotal).toBe(4);
  });

  it('activity grid routes unmapped activities into Other without losing them', () => {
    const pivot = {
      dates: ['2026-08-11'],
      siteCrops: [],
      cells: [
        { date: '2026-08-11', crop: 'General', activity: 'Scouting', casual: 0, eag: 4 },
      ],
    };
    const grid = buildWorkersCountSummaryGrid(pivot, 'eag', {
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      groupBy: 'crop',
      rowOrder: ['General'],
    });
    const otherIdx = grid.headers.indexOf('Other') - 1;
    expect(grid.rows[0].cells[otherIdx]).toBe(4);
    expect(grid.footer.rowTotal).toBe(4);
  });

  it('range grid includes harvesting from one day and supervisor from another', () => {
    const grid = buildWorkersCountSummaryGrid(pivotData, 'eag', {
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      groupBy: 'crop',
      rowOrder: cropRowOrder,
    });
    const harvestIdx = grid.headers.indexOf('Harvesting') - 1;
    const supervisorIdx = grid.headers.indexOf('Supervisor') - 1;
    expect(grid.footer.cells[harvestIdx]).toBe(9);
    expect(grid.footer.cells[supervisorIdx]).toBe(3);
  });
});

describe('manpowerSiteRowOrder', () => {
  it('buildWorkersCountRowOrder uses site template only', () => {
    const order = buildWorkersCountRowOrder({
      groupBy: 'crop',
      siteCrops: ['Tomato Plum', 'Snack Cucumber'],
      siteVarieties: [],
      cells: [],
    });
    expect(order).toEqual(['General', 'Snack Cucumber', 'Tomato Plum']);
    expect(order).not.toContain('Broccoli');
  });

  it('falls back to crops from cells when site has no template', () => {
    expect(buildWorkersCountRowOrder({
      groupBy: 'crop',
      siteCrops: [],
      siteVarieties: [],
      cells: [{ crop: 'Tomato Plum', variety: 'X', activity: 'Harvesting' }],
    })).toEqual(['General', 'Tomato Plum']);
  });

  it('falls back to pivot crops when site template and cells are empty', () => {
    expect(buildWorkersCountRowOrder({
      groupBy: 'crop',
      siteCrops: [],
      pivotCrops: ['Snack Cucumber'],
      cells: [],
    })).toEqual(['General', 'Snack Cucumber']);
  });
});
