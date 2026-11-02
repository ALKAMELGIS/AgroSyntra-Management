import {
  FIELD_ACTIVITIES,
  GENERAL_ACTIVITIES,
  WORKERS_COUNT_BLANK_CROP,
  WORKERS_COUNT_SUMMARY_ACTIVITIES,
  WORKERS_COUNT_SUMMARY_METRICS,
} from './manpowerDetailPivotConstants';
import {
  knownPivotActivityKeySet,
  resolvePivotActivityColumns,
  WORKERS_COUNT_OTHER_ACTIVITY,
} from './manpowerPivotActivities';
import {
  buildWorkersCountRowOrder,
  rowLabelHeader,
} from './manpowerSiteRowOrder';

/** @typedef {'eag' | 'casual' | 'total'} WorkersCountMetric */
/** @typedef {'crop' | 'variety'} WorkersCountGroupBy */

/** @param {unknown} value */
export function normalizePivotDate(value) {
  if (value == null || value === '') return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().split('T')[0];
  }
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parsed = Date.parse(s);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString().split('T')[0];
  }
  return s.split('T')[0];
}

/** Local calendar YYYY-MM-DD (not UTC from toISOString). */
export function localIsoDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const ACTIVITY_ALIASES = {
  nursery: 'Nursary',
  nursary: 'Nursary',
  'bed making': 'Bed Making/Mulching',
  'bed making/mulching': 'Bed Making/Mulching',
  mulching: 'Bed Making/Mulching',
  uprooting: 'Uprooting/Cleaning',
  'uprooting/cleaning': 'Uprooting/Cleaning',
  cleaning: 'Uprooting/Cleaning',
  'hook making': 'Hook Making',
  'crate washing': 'Crate Washing',
};

function activityLookupList() {
  return [
    ...WORKERS_COUNT_SUMMARY_ACTIVITIES.map((a) => a.key),
    ...FIELD_ACTIVITIES,
    ...GENERAL_ACTIVITIES,
  ];
}

function normalizeActivityKey(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Same aliases as backend manpowerDetailPivot so grid keys match cell.activity. */
export function normalizeSummaryActivity(raw) {
  const t = String(raw || '').trim();
  if (!t) return '(blank)';
  const key = normalizeActivityKey(t);
  if (ACTIVITY_ALIASES[key]) return ACTIVITY_ALIASES[key];
  const canonical = activityLookupList();
  for (const a of canonical) {
    if (normalizeActivityKey(a) === key) return a;
  }
  for (const a of canonical) {
    const n = normalizeActivityKey(a);
    if (key.includes(n) || n.includes(key)) return a;
  }
  return t;
}

function cellRowKey(cell, groupBy) {
  if (groupBy === 'variety') {
    return cell.variety || cell.crop || 'No Variety';
  }
  return cell.crop || 'No Crop';
}

/**
 * Sum casual/eag across filtered dates per row × activity.
 * @param {Array<{ date: string, crop: string, variety?: string, activity: string, casual: number, eag: number }>} cells
 * @param {string[]|null|undefined} dates
 * @param {WorkersCountGroupBy} [groupBy]
 */
export function aggregatePivotCells(cells, dates, groupBy = 'crop') {
  const dateSet = dates == null
    ? null
    : new Set(dates.map((d) => normalizePivotDate(d)));
  /** @type {Map<string, { casual: number, eag: number }>} */
  const map = new Map();

  for (const c of cells) {
    const date = normalizePivotDate(c.date);
    if (dateSet && !dateSet.has(date)) continue;
    const rowKey = cellRowKey(c, groupBy);
    const key = `${rowKey}|${normalizeSummaryActivity(c.activity)}`;
    if (!map.has(key)) {
      map.set(key, { casual: 0, eag: 0 });
    }
    const bucket = map.get(key);
    bucket.casual += Number(c.casual) || 0;
    bucket.eag += Number(c.eag) || 0;
  }
  return map;
}

/** @param {Map<string, { casual: number, eag: number }>} activityAgg */
export function rollupActivityAggToByCrop(activityAgg) {
  /** @type {Map<string, { eag: number, casual: number }>} */
  const map = new Map();
  for (const [key, bucket] of activityAgg) {
    const rowLabel = key.split('|')[0];
    if (rowLabel === WORKERS_COUNT_BLANK_CROP) continue;
    if (!map.has(rowLabel)) {
      map.set(rowLabel, { eag: 0, casual: 0 });
    }
    const byRow = map.get(rowLabel);
    byRow.eag += bucket.eag;
    byRow.casual += bucket.casual;
  }
  return map;
}

/**
 * @param {object} pivotData
 * @param {string} startDate
 * @param {string} endDate
 */
export function pivotDatesInRange(pivotData, startDate, endDate) {
  const start = normalizePivotDate(startDate);
  const end = normalizePivotDate(endDate);
  const set = new Set();
  for (const d of pivotData?.dates || []) {
    const n = normalizePivotDate(d);
    if (n >= start && n <= end) set.add(n);
  }
  for (const c of pivotData?.cells || []) {
    const n = normalizePivotDate(c.date);
    if (n >= start && n <= end) set.add(n);
  }
  return [...set].sort();
}

/** @param {object} pivotData @param {string} exactDate */
export function pivotDatesOnDay(pivotData, exactDate) {
  const target = normalizePivotDate(exactDate);
  const set = new Set();
  for (const d of pivotData?.dates || []) {
    if (normalizePivotDate(d) === target) set.add(target);
  }
  for (const c of pivotData?.cells || []) {
    if (normalizePivotDate(c.date) === target) set.add(target);
  }
  return set.size ? [target] : [];
}

export function pivotHasRecordsOnDate(pivotData, exactDate) {
  return pivotDatesOnDay(pivotData, exactDate).length > 0;
}

/**
 * Latest ISO date (YYYY-MM-DD) with records within an inclusive range, or '' if none.
 * @param {object} pivotData
 * @param {string} startDate
 * @param {string} endDate
 */
export function latestPivotDateInRange(pivotData, startDate, endDate) {
  const dates = pivotDatesInRange(pivotData, startDate, endDate);
  return dates.length ? dates[dates.length - 1] : '';
}

/**
 * Keep the selected day when the activity grid has workers; otherwise the latest
 * day in range whose grid total is > 0. Also clamps the selection into From–To.
 */
export function resolveDailyReportDate(
  pivotData,
  selected,
  startDate,
  endDate,
  groupBy = 'crop',
  rowOrder,
) {
  const start = normalizePivotDate(startDate);
  const end = normalizePivotDate(endDate);
  let chosen = normalizePivotDate(selected);
  if (chosen && start && chosen < start) chosen = start;
  if (chosen && end && chosen > end) chosen = end;
  const rows = rowOrder?.length ? rowOrder : rowOrderFromPivotData(pivotData, groupBy);
  if (chosen && activityGridTotalForDate(pivotData, chosen, groupBy, rows) > 0) return chosen;
  return latestDateWithActivityGridCounts(pivotData, startDate, endDate, groupBy, rows)
    || latestPivotDateInRange(pivotData, startDate, endDate)
    || chosen;
}

export function rowOrderFromPivotData(pivotData, groupBy = 'crop') {
  const pivotVarieties = [
    ...new Set((pivotData?.cells || []).map((c) => c.variety).filter(Boolean)),
  ];
  return buildWorkersCountRowOrder({
    groupBy,
    siteCrops: pivotData?.siteCrops || [],
    siteVarieties: pivotData?.siteVarieties || [],
    pivotCrops: pivotData?.crops || [],
    pivotVarieties,
    cells: pivotData?.cells || [],
  });
}

export function activityGridTotalForDate(pivotData, isoDate, groupBy = 'crop', rowOrder) {
  const rows = rowOrder?.length ? rowOrder : rowOrderFromPivotData(pivotData, groupBy);
  if (!isoDate || !rows.length) return 0;
  return buildWorkersCountSummaryGrid(pivotData, 'total', {
    dailyReportDate: isoDate,
    groupBy,
    rowOrder: rows,
  }).footer.rowTotal;
}

export function latestDateWithActivityGridCounts(
  pivotData,
  startDate,
  endDate,
  groupBy = 'crop',
  rowOrder,
) {
  const dates = pivotDatesInRange(pivotData, startDate, endDate);
  const rows = rowOrder?.length ? rowOrder : rowOrderFromPivotData(pivotData, groupBy);
  for (let i = dates.length - 1; i >= 0; i -= 1) {
    if (activityGridTotalForDate(pivotData, dates[i], groupBy, rows) > 0) return dates[i];
  }
  return '';
}

/** @param {WorkersCountMetric} metric */
function valueForMetric(bucket, metric) {
  if (metric === 'eag') return bucket.eag;
  if (metric === 'casual') return bucket.casual;
  return bucket.casual + bucket.eag;
}

export function summaryHeadersForGroupBy(groupBy) {
  const labelCol = rowLabelHeader(groupBy);
  return [labelCol, 'EAG', 'Casual Worker', 'Budget', 'Difference'];
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** @param {string} isoDate YYYY-MM-DD */
export function formatDailyReportTitle(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return `${d}-${MONTH_SHORT[m - 1]}-${String(y).slice(-2)} Report`;
}

/**
 * @deprecated use rollupActivityAggToByCrop(aggregatePivotCells(...))
 */
export function aggregateByCrop(cells, filter = {}) {
  const { exactDate, startDate, endDate } = filter;
  let dates = null;
  if (exactDate) {
    dates = [normalizePivotDate(exactDate)];
  } else if (startDate || endDate) {
    const start = startDate ? normalizePivotDate(startDate) : '0000-01-01';
    const end = endDate ? normalizePivotDate(endDate) : '9999-12-31';
    const set = new Set();
    for (const c of cells) {
      const n = normalizePivotDate(c.date);
      if (n >= start && n <= end) set.add(n);
    }
    dates = [...set];
  }
  return rollupActivityAggToByCrop(aggregatePivotCells(cells, dates ?? undefined));
}

/**
 * @param {Map<string, { eag: number, casual: number }>} byRow
 * @param {string[]} rowOrder
 * @param {string} title
 * @param {WorkersCountGroupBy} groupBy
 */
function buildRowSummaryPanel(byRow, rowOrder, title, groupBy) {
  /** @type {Array<{ crop: string, eag: number, casual: number, budget: string, difference: string }>} */
  const rows = [];
  let totalEag = 0;
  let totalCasual = 0;

  for (const label of rowOrder) {
    const bucket = byRow.get(label) || { eag: 0, casual: 0 };
    totalEag += bucket.eag;
    totalCasual += bucket.casual;
    rows.push({
      crop: label,
      eag: bucket.eag,
      casual: bucket.casual,
      budget: '',
      difference: '',
    });
  }

  return {
    title,
    headers: summaryHeadersForGroupBy(groupBy),
    rows,
    footer: {
      label: 'Total',
      eag: totalEag,
      casual: totalCasual,
      budget: '',
      difference: '',
    },
  };
}

/**
 * Daily (one date) + Till Date (inclusive range) summaries.
 * @param {object} pivotData
 * @param {{
 *   dailyReportDate: string,
 *   tillStartDate: string,
 *   tillEndDate: string,
 *   groupBy?: WorkersCountGroupBy,
 *   rowOrder?: string[],
 * }} opts
 */
export function buildWorkersCountCropSummaryPair(pivotData, opts) {
  const { cells = [] } = pivotData || {};
  const {
    dailyReportDate,
    tillStartDate,
    tillEndDate,
    groupBy = 'crop',
    rowOrder = [],
  } = opts;

  if (!rowOrder.length) {
    const empty = buildRowSummaryPanel(new Map(), [], formatDailyReportTitle(dailyReportDate), groupBy);
    return {
      daily: empty,
      till: buildRowSummaryPanel(new Map(), [], 'Till Date Report', groupBy),
    };
  }

  const dailyDates = pivotDatesOnDay(pivotData, dailyReportDate);
  const tillDates = pivotDatesInRange(pivotData, tillStartDate, tillEndDate);

  const dailyByRow = rollupActivityAggToByCrop(
    aggregatePivotCells(cells, dailyDates, groupBy),
  );
  const tillByRow = rollupActivityAggToByCrop(
    aggregatePivotCells(cells, tillDates, groupBy),
  );

  return {
    daily: buildRowSummaryPanel(
      dailyByRow,
      rowOrder,
      formatDailyReportTitle(dailyReportDate),
      groupBy,
    ),
    till: buildRowSummaryPanel(tillByRow, rowOrder, 'Till Date Report', groupBy),
  };
}

/** Side-by-side daily + till blocks for Excel Summary sheet. */
export function cropSummaryPairToAoa(pair) {
  const gap = 2;
  const leftW = pair.daily.headers.length;
  const rightStart = leftW + gap;

  const maxRows = Math.max(
    pair.daily.rows.length,
    pair.till.rows.length,
  );
  const rowCount = 2 + maxRows + 1;
  /** @type {string[][]} */
  const aoa = Array.from({ length: rowCount }, () => []);

  const place = (row, col, val) => {
    while (aoa[row].length <= col) aoa[row].push('');
    aoa[row][col] = val;
  };

  place(0, 0, pair.daily.title);
  place(0, rightStart, pair.till.title);

  pair.daily.headers.forEach((h, i) => place(1, i, h));
  pair.till.headers.forEach((h, i) => place(1, rightStart + i, h));

  for (let i = 0; i < maxRows; i += 1) {
    const r = pair.daily.rows[i];
    const t = pair.till.rows[i];
    if (r) {
      place(2 + i, 0, r.crop);
      place(2 + i, 1, r.eag);
      place(2 + i, 2, r.casual);
      place(2 + i, 3, r.budget);
      place(2 + i, 4, r.difference);
    }
    if (t) {
      place(2 + i, rightStart, t.crop);
      place(2 + i, rightStart + 1, t.eag);
      place(2 + i, rightStart + 2, t.casual);
      place(2 + i, rightStart + 3, t.budget);
      place(2 + i, rightStart + 4, t.difference);
    }
  }

  const footRow = 2 + maxRows;
  const df = pair.daily.footer;
  const tf = pair.till.footer;
  place(footRow, 0, df.label);
  place(footRow, 1, df.eag);
  place(footRow, 2, df.casual);
  place(footRow, rightStart, tf.label);
  place(footRow, rightStart + 1, tf.eag);
  place(footRow, rightStart + 2, tf.casual);

  return aoa;
}

/**
 * @param {object} pivotData
 * @param {WorkersCountMetric} metric
 * @param {{
 *   startDate?: string,
 *   endDate?: string,
 *   dailyReportDate?: string,
 *   groupBy?: WorkersCountGroupBy,
 *   rowOrder?: string[],
 *   debugLog?: boolean,
 * }} [opts]
 */
export function buildWorkersCountSummaryGrid(pivotData, metric, opts = {}) {
  const { dates = [], cells = [] } = pivotData || {};
  const {
    startDate,
    endDate,
    dailyReportDate,
    groupBy = 'crop',
    rowOrder = [],
  } = opts;

  const activityColumns = resolvePivotActivityColumns(pivotData);
  const standardColumns = activityColumns.filter((a) => a.key !== WORKERS_COUNT_OTHER_ACTIVITY.key);
  const knownKeys = knownPivotActivityKeySet(pivotData);

  const labelCol = rowLabelHeader(groupBy);
  const emptyGrid = {
    metric,
    title: WORKERS_COUNT_SUMMARY_METRICS.find((m) => m.id === metric)?.title ?? metric,
    headers: [labelCol, ...activityColumns.map((a) => a.label), 'Total'],
    rows: [],
    footer: { label: 'Total', cells: activityColumns.map(() => 0), rowTotal: 0 },
  };

  if (!rowOrder.length) return emptyGrid;

  let filterDates;
  if (startDate || endDate) {
    filterDates = pivotDatesInRange(
      pivotData,
      startDate || '0000-01-01',
      endDate || '9999-12-31',
    );
  } else if (dailyReportDate) {
    filterDates = pivotDatesOnDay(pivotData, dailyReportDate);
  } else {
    const normalized = dates.map((d) => normalizePivotDate(d));
    filterDates = normalized.length > 0 ? normalized : undefined;
  }
  const aggregated = aggregatePivotCells(cells, filterDates, groupBy);

  const headers = [labelCol, ...activityColumns.map((a) => a.label), 'Total'];

  /** @type {Array<{ crop: string, cells: number[], rowTotal: number }>} */
  const rows = [];

  for (const label of rowOrder) {
    const values = standardColumns.map(({ key }) => {
      const bucket = aggregated.get(`${label}|${key}`) || { casual: 0, eag: 0 };
      return valueForMetric(bucket, metric);
    });

    let otherTotal = 0;
    for (const [aggKey, bucket] of aggregated) {
      const pipeIdx = aggKey.indexOf('|');
      if (pipeIdx === -1) continue;
      const rowLabel = aggKey.slice(0, pipeIdx);
      const activity = aggKey.slice(pipeIdx + 1);
      if (rowLabel !== label || knownKeys.has(activity)) continue;
      otherTotal += valueForMetric(bucket, metric);
    }
    values.push(otherTotal);

    const rowTotal = values.reduce((s, n) => s + n, 0);
    rows.push({ crop: label, cells: values, rowTotal });
  }

  const footerCells = activityColumns.map((_, colIdx) =>
    rows.reduce((s, row) => s + row.cells[colIdx], 0),
  );
  const footerRowTotal = rows.reduce((s, row) => s + row.rowTotal, 0);

  const metricMeta = WORKERS_COUNT_SUMMARY_METRICS.find((m) => m.id === metric);

  return {
    metric,
    title: metricMeta?.title ?? metric,
    headers,
    rows,
    footer: {
      label: 'Total',
      cells: footerCells,
      rowTotal: footerRowTotal,
    },
  };
}

/** @param {ReturnType<typeof buildWorkersCountSummaryGrid>} grid */
export function summaryGridToAoa(grid) {
  const aoa = [
    [grid.title],
    grid.headers,
    ...grid.rows.map((r) => [r.crop, ...r.cells, r.rowTotal]),
    [grid.footer.label, ...grid.footer.cells, grid.footer.rowTotal],
  ];
  return aoa;
}

export function buildAllSummaryGrids(pivotData, opts = {}) {
  return WORKERS_COUNT_SUMMARY_METRICS.map((m) =>
    buildWorkersCountSummaryGrid(pivotData, m.id, opts),
  );
}

export { buildWorkersCountRowOrder };
