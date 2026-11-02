/**
 * Weather temperature per day for the irrigation water chart.
 * A site can have several weather_logs rows on one day (one per field), so a day's
 * temperature is the highest max and the lowest min across those rows.
 */
import { toIsoDate } from './dashboardUtils';

function finiteOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Map(isoDate → { maxTemp, minTemp }) from weather log rows ({ date, maxTemp, minTemp }). */
export function buildDailyTempIndex(logs) {
  const index = new Map();
  (logs || []).forEach((log) => {
    const date = toIsoDate(log?.date);
    if (!date) return;
    const max = finiteOrNull(log.maxTemp);
    const min = finiteOrNull(log.minTemp);
    if (max == null && min == null) return;
    const day = index.get(date) || { maxTemp: null, minTemp: null };
    if (max != null) day.maxTemp = day.maxTemp == null ? max : Math.max(day.maxTemp, max);
    if (min != null) day.minTemp = day.minTemp == null ? min : Math.min(day.minTemp, min);
    index.set(date, day);
  });
  return index;
}

/** Adds maxTemp / minTemp (null when that day has no weather entry) to points keyed by isoDate. */
export function attachTemps(points, index) {
  return (points || []).map((p) => {
    const day = index.get(p.isoDate);
    return { ...p, maxTemp: day?.maxTemp ?? null, minTemp: day?.minTemp ?? null };
  });
}

function formatTemp(value) {
  return `${Number(value).toFixed(0)}°C`;
}

/** "41°C max / 29°C min", "41°C max", "29°C min", or '' when the day has no temperature. */
export function formatTempRange({ maxTemp, minTemp } = {}) {
  const parts = [];
  if (maxTemp != null) parts.push(`${formatTemp(maxTemp)} max`);
  if (minTemp != null) parts.push(`${formatTemp(minTemp)} min`);
  return parts.join(' / ');
}
