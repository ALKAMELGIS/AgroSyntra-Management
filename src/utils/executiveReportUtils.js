/** Shared helpers for manager executive reports. */

export function toNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function avg(arr) {
  const vals = arr.filter((v) => v != null && Number.isFinite(v));
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}

export function normalizePercentDrain(val) {
  const n = toNum(val);
  if (n <= 0) return null;
  return n <= 1 ? n * 100 : n;
}

export function filterByDateRange(entries, from, to, dateKey = 'date') {
  return entries.filter((e) => {
    const d = (e[dateKey] || '').toString().split('T')[0];
    if (!d) return false;
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
}

export function getPreviousPeriod(from, to) {
  const fromD = new Date(`${from}T00:00:00`);
  const toD = new Date(`${to}T00:00:00`);
  const days = Math.max(1, Math.round((toD - fromD) / 86400000) + 1);
  const prevTo = new Date(fromD);
  prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setDate(prevFrom.getDate() - days + 1);
  return {
    from: prevFrom.toISOString().split('T')[0],
    to: prevTo.toISOString().split('T')[0],
  };
}

export function pctChange(current, previous) {
  if (previous == null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export function formatDelta(pct, invert = false) {
  if (pct == null || !Number.isFinite(pct)) return null;
  const adjusted = invert ? -pct : pct;
  const sign = adjusted >= 0 ? '+' : '';
  return `${sign}${adjusted.toFixed(1)}% vs prev period`;
}

export function topN(entries, limit = 5) {
  return entries.slice(0, limit);
}

export function formatPeriodLabel(from, to) {
  if (!from && !to) return 'All time';
  if (from && to) {
    const fmt = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
    return `${fmt(from)} – ${fmt(to)}`;
  }
  return from || to || '';
}

export function getDefaultDateRange(days = 30) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - (days - 1));
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  };
}

export function ecInRange(val) {
  return val >= 1.5 && val <= 3.0;
}

export function phInRange(val) {
  return val >= 5.5 && val <= 6.5;
}

export function drainInRange(val) {
  return val >= 15 && val <= 30;
}
