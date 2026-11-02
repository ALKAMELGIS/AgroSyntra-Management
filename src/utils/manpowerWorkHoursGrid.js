import {
  WORKERS_COUNT_SUMMARY_METRICS,
} from './manpowerDetailPivotConstants';
import {
  knownPivotActivityKeySet,
  resolvePivotActivityColumns,
  WORKERS_COUNT_OTHER_ACTIVITY,
} from './manpowerPivotActivities';
import { normalizePivotDate } from './manpowerWorkersCountSummaryGrid';
import { buildWorkersCountRowOrder, rowLabelHeader } from './manpowerSiteRowOrder';

/** @param {object} pivotData */
export { resolvePivotActivities } from './manpowerPivotActivities';

/** @typedef {'eag' | 'casual' | 'total'} WorkHoursMetric */

/**
 * Grid column an activity belongs to. Anything the backend does not expose as a
 * column falls into Other so hours are never dropped from the report.
 * @param {string} activity
 * @param {Set<string>|null} knownKeys
 */
function columnKeyForActivity(activity, knownKeys) {
  if (!knownKeys) return activity;
  return knownKeys.has(activity) ? activity : WORKERS_COUNT_OTHER_ACTIVITY.key;
}

/**
 * @param {Array<object>} cells
 * @param {string[]|null|undefined} dates
 * @param {'crop'|'variety'} groupBy
 * @param {Set<string>|null} [knownKeys] when given, unmapped activities bucket into Other
 */
export function aggregateWorkHoursCells(cells, dates, groupBy = 'crop', knownKeys = null) {
  const dateSet = dates == null
    ? null
    : new Set(dates.map((d) => normalizePivotDate(d)));
  /** @type {Map<string, { workers: number, hours: number, actual: number, units: Set<string> }>} */
  const map = new Map();

  for (const c of cells || []) {
    const date = normalizePivotDate(c.date);
    if (dateSet && !dateSet.has(date)) continue;
    const rowKey = groupBy === 'variety'
      ? (c.variety || c.crop || 'No Variety')
      : (c.crop || 'No Crop');
    const key = `${rowKey}|${columnKeyForActivity(c.activity, knownKeys)}`;
    if (!map.has(key)) {
      map.set(key, { workers: 0, hours: 0, actual: 0, units: new Set() });
    }
    const bucket = map.get(key);
    const workers = metricWorkers(c, 'total');
    const hours = metricHours(c, 'total');
    bucket.workers += workers;
    bucket.hours += hours;
    if (c.actual) {
      bucket.actual += Number(c.actual) || 0;
      for (const u of c.units || (c.unit ? [c.unit] : [])) {
        if (u) bucket.units.add(u);
      }
    }
  }
  return map;
}

/** @param {WorkHoursMetric} metric */
function metricWorkers(cell, metric) {
  if (metric === 'eag') return Number(cell.eag) || 0;
  if (metric === 'casual') return Number(cell.casual) || 0;
  return (Number(cell.eag) || 0) + (Number(cell.casual) || 0);
}

/** @param {WorkHoursMetric} metric */
function metricHours(cell, metric) {
  if (metric === 'eag') return Number(cell.eagHours) || 0;
  if (metric === 'casual') return Number(cell.casualHours) || 0;
  return (Number(cell.eagHours) || 0) + (Number(cell.casualHours) || 0);
}

function fmtNum(n) {
  if (!n) return '';
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/**
 * @param {object} pivotData
 * @param {WorkHoursMetric} metric
 * @param {{
 *   groupBy?: 'crop'|'variety',
 *   rowOrder?: string[],
 *   activityKeys?: string[],
 * }} opts
 */
export function buildWorkHoursSummaryGrid(pivotData, metric, opts = {}) {
  const {
    groupBy = 'crop',
    rowOrder = [],
    activityKeys = resolvePivotActivityColumns(pivotData).map((a) => a.key),
  } = opts;

  const knownKeys = knownPivotActivityKeySet(pivotData);
  const agg = aggregateWorkHoursCells(pivotData?.cells || [], null, groupBy, knownKeys);
  const labelCol = rowLabelHeader(groupBy);

  const activityCols = resolvePivotActivityColumns(pivotData)
    .filter((a) => activityKeys.includes(a.key));

  /** @type {string[]} */
  const headers = [labelCol];
  for (const act of activityCols) {
    headers.push(`${act.label} W`, `${act.label} Hrs`);
  }
  headers.push('Total W', 'Total Hrs');

  /** @type {Array<{ rowKey: string, workers: string[], hours: string[], rowTotalW: string, rowTotalH: string }>} */
  const rows = [];
  let footW = Array(activityCols.length).fill(0);
  let footH = Array(activityCols.length).fill(0);

  for (const rowKey of rowOrder) {
    const wCells = [];
    const hCells = [];
    let rowW = 0;
    let rowH = 0;
    activityCols.forEach((act, i) => {
      const bucket = agg.get(`${rowKey}|${act.key}`) || { workers: 0, hours: 0 };
      let w = 0;
      let h = 0;
      if (metric === 'total') {
        w = bucket.workers;
        h = bucket.hours;
      } else {
        for (const c of pivotData?.cells || []) {
          const dKey = groupBy === 'variety' ? (c.variety || c.crop) : c.crop;
          if (dKey !== rowKey) continue;
          if (columnKeyForActivity(c.activity, knownKeys) !== act.key) continue;
          w += metricWorkers(c, metric);
          h += metricHours(c, metric);
        }
      }
      wCells.push(fmtNum(w));
      hCells.push(fmtNum(h));
      rowW += w;
      rowH += h;
      footW[i] += w;
      footH[i] += h;
    });
    rows.push({
      rowKey,
      workers: wCells,
      hours: hCells,
      rowTotalW: fmtNum(rowW),
      rowTotalH: fmtNum(rowH),
    });
  }

  const footerWorkers = footW.map(fmtNum);
  const footerHours = footH.map(fmtNum);

  return {
    headers,
    activityCols,
    rows,
    footer: {
      label: 'Total',
      workers: footerWorkers,
      hours: footerHours,
      rowTotalW: fmtNum(footW.reduce((s, n) => s + n, 0)),
      rowTotalH: fmtNum(footH.reduce((s, n) => s + n, 0)),
    },
  };
}

/**
 * @param {object} pivotData
 * @param {string} rowKey
 * @param {string} activity
 * @param {'crop'|'variety'} groupBy
 */
export function productivityForRowActivity(pivotData, rowKey, activity, groupBy = 'crop') {
  let hours = 0;
  let actual = 0;
  const units = new Set();
  let withActual = 0;
  let total = 0;

  for (const c of pivotData?.cells || []) {
    const key = groupBy === 'variety' ? (c.variety || c.crop) : c.crop;
    if (key !== rowKey || c.activity !== activity) continue;
    total += 1;
    hours += (Number(c.eagHours) || 0) + (Number(c.casualHours) || 0);
    if (c.actual) {
      actual += Number(c.actual) || 0;
      withActual += 1;
      for (const u of c.units || (c.unit ? [c.unit] : [])) {
        if (u) units.add(u);
      }
    }
  }

  const mixedUnits = units.size > 1;
  const unit = units.size === 1 ? [...units][0] : '';
  return {
    hours: Math.round(hours * 10) / 10,
    actual,
    unit,
    mixedUnits,
    hoursPerUnit: !mixedUnits && actual > 0 ? Math.round((hours / actual) * 100) / 100 : null,
    coveragePct: total ? Math.round((withActual / total) * 100) : 0,
  };
}

export { WORKERS_COUNT_SUMMARY_METRICS, buildWorkersCountRowOrder };
