/** Helpers for the Manpower Cost page (rates are effective-dated; see backend utils/manpowerCost.ts). */

export const WORKER_CATEGORIES = ['Casual', 'Permanent'];

export function todayIso(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** First of the current month → today. */
export function defaultPeriod(now = new Date()) {
  const end = todayIso(now);
  return { startDate: `${end.slice(0, 8)}01`, endDate: end };
}

const aed = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hrs = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

export function formatAed(value) {
  if (value == null || !Number.isFinite(Number(value))) return '-';
  return aed.format(Number(value));
}

export function formatHours(value) {
  if (value == null || !Number.isFinite(Number(value))) return '-';
  return hrs.format(Number(value));
}

/** Latest row with effectiveFrom <= date (rows from GET /manpower-cost/rates). */
export function rateInForce(rows, date) {
  let best = null;
  for (const row of rows || []) {
    if (row.effectiveFrom > date) continue;
    if (!best || row.effectiveFrom > best.effectiveFrom
      || (row.effectiveFrom === best.effectiveFrom && String(row.createdAt) > String(best.createdAt))) {
      best = row;
    }
  }
  return best;
}

export function groupRateRows(groupRates, siteId, category) {
  return (groupRates || []).filter((r) => r.siteId === siteId && r.category === category);
}

export function workerRateRows(workerRates, workerId) {
  return (workerRates || []).filter((r) => r.workerId === workerId);
}

/** Next rate that starts after `date` (a change already scheduled). */
export function nextScheduledRate(rows, date) {
  return (rows || [])
    .filter((r) => r.effectiveFrom > date)
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))[0] || null;
}

/**
 * Workers who have a personal rate in force on `date` (a null rate = back on group rate, so excluded).
 * Returns [{ workerId, employeeId, workerName, workerCategory, row }].
 */
export function workersOnPersonalRate(workerRates, date) {
  const byWorker = new Map();
  for (const row of workerRates || []) {
    if (!byWorker.has(row.workerId)) byWorker.set(row.workerId, []);
    byWorker.get(row.workerId).push(row);
  }
  const out = [];
  for (const [workerId, rows] of byWorker) {
    const current = rateInForce(rows, date);
    const upcoming = nextScheduledRate(rows, date);
    if ((current && current.ratePerHour != null) || (upcoming && upcoming.ratePerHour != null)) {
      const ref = current || upcoming;
      out.push({
        workerId,
        employeeId: ref.employeeId,
        workerName: ref.workerName,
        workerCategory: ref.workerCategory,
        current,
        upcoming,
        history: [...rows].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)),
      });
    }
  }
  return out.sort((a, b) => String(a.workerName).localeCompare(String(b.workerName)));
}
