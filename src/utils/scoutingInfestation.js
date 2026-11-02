/**
 * Scouting infestation % per pest:
 * (plant_count × sum of segment averages) ÷ sampling_units
 */

export function computePestInfestationPct(plantCount, sumSegmentAverages, samplingUnits) {
  if (!Number.isFinite(plantCount) || plantCount <= 0) return null;
  if (!Number.isFinite(samplingUnits) || samplingUnits <= 0) return null;
  if (!Number.isFinite(sumSegmentAverages) || sumSegmentAverages < 0) return null;
  return Number(((plantCount * sumSegmentAverages) / samplingUnits).toFixed(2));
}

export function pestGroupKey(row) {
  if (row.pestDiseaseId) return `id:${row.pestDiseaseId}`;
  if (row.abbr) return `abbr:${row.abbr}`;
  return `name:${(row.pestName || row.label || '').trim().toLowerCase()}`;
}

/**
 * @param {Array} rows observation table rows
 * @param {number|null} plantCount crop plant_count (falls back to dripper_count)
 * @param {number|null} samplingUnits field sampling units
 * @param {(row: object) => boolean} hasSampleFn
 * @param {(row: object) => number} avgFn
 * @returns {Record<string, number>} infestation % keyed by pestGroupKey
 */
export function computeInfestationByPest(rows, plantCount, samplingUnits, hasSampleFn, avgFn) {
  if (!plantCount || !samplingUnits) return {};

  const sumAvgByPest = {};
  for (const row of rows) {
    if (!hasSampleFn(row)) continue;
    const key = pestGroupKey(row);
    sumAvgByPest[key] = (sumAvgByPest[key] || 0) + avgFn(row);
  }

  const result = {};
  for (const [key, sumAvg] of Object.entries(sumAvgByPest)) {
    const pct = computePestInfestationPct(plantCount, sumAvg, samplingUnits);
    if (pct != null) result[key] = pct;
  }
  return result;
}

export function formatInfestationPct(pct) {
  if (pct == null || !Number.isFinite(pct)) return '—';
  return `${pct}%`;
}
