/** Rolling window for avg boxes removed per week (deployments are capped at 500 in UI). */
const ROLLING_DAYS = 28;
const WEEKS_IN_WINDOW = 4;

function parseDateOnly(value) {
  if (!value) return null;
  const d = new Date(String(value).split('T')[0]);
  return Number.isNaN(d.getTime()) ? null : d;
}

function compareDeploymentsNewestFirst(a, b) {
  const da = parseDateOnly(a.date_placed);
  const db = parseDateOnly(b.date_placed);
  if (da && db && da.getTime() !== db.getTime()) return db - da;
  const ca = a.created_at ? new Date(a.created_at).getTime() : 0;
  const cb = b.created_at ? new Date(b.created_at).getTime() : 0;
  return cb - ca;
}

/**
 * @param {Array} deployments Site deployment rows from list API
 * @param {{ quantityOnHand?: number, projectedTotal?: number } | null} inventory
 * @param {Date | string} [asOfDate]
 */
export function computeBumbleBeeSummary(deployments, inventory, asOfDate = new Date()) {
  const onHand = inventory?.quantityOnHand ?? 0;
  const projectedTotal = inventory?.projectedTotal ?? onHand;

  const asOf = parseDateOnly(asOfDate) || new Date();
  const windowStart = new Date(asOf);
  windowStart.setDate(windowStart.getDate() - (ROLLING_DAYS - 1));

  let totalRemoved = 0;
  let visitsInWindow = 0;
  (deployments || []).forEach((dep) => {
    const d = parseDateOnly(dep.date_placed);
    if (!d || d < windowStart || d > asOf) return;
    visitsInWindow += 1;
    totalRemoved += Number(dep.boxes_removed) || 0;
  });

  const avgBoxesRemovedPerWeek = visitsInWindow === 0
    ? null
    : Math.round((totalRemoved / WEEKS_IN_WINDOW) * 10) / 10;

  const sorted = [...(deployments || [])].sort(compareDeploymentsNewestFirst);
  const latest = sorted[0] || null;

  let lastDeploy = null;
  if (latest) {
    lastDeploy = {
      date: latest.date_placed,
      fieldName: latest.field_name || '—',
      boxesAdded: Number(latest.boxes_added ?? latest.box_count) || 0,
      boxesRemoved: Number(latest.boxes_removed) || 0,
    };
  }

  return {
    onHand,
    projectedTotal,
    avgBoxesRemovedPerWeek,
    lastDeploy,
  };
}

export function formatLastDeployDate(dateValue) {
  const d = parseDateOnly(dateValue);
  if (!d) return '—';
  return d.toLocaleDateString();
}
