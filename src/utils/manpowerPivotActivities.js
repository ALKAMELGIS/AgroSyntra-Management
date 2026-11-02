import { WORKERS_COUNT_SUMMARY_ACTIVITIES } from './manpowerDetailPivotConstants';

/** @typedef {{ key: string, label: string }} PivotActivityColumn */

export const WORKERS_COUNT_OTHER_ACTIVITY = { key: '__other__', label: 'Other' };

/** @param {object} pivotData */
export function resolvePivotActivities(pivotData) {
  if (pivotData?.activities?.length) {
    return pivotData.activities.map((a) => ({ key: a.key, label: a.label || a.key }));
  }
  return WORKERS_COUNT_SUMMARY_ACTIVITIES;
}

/** Grid columns including Other bucket for unmapped activities. */
export function resolvePivotActivityColumns(pivotData) {
  return [...resolvePivotActivities(pivotData), WORKERS_COUNT_OTHER_ACTIVITY];
}

/** @param {object} pivotData */
export function knownPivotActivityKeySet(pivotData) {
  return new Set(resolvePivotActivities(pivotData).map((a) => a.key));
}

export const PIVOT_COLUMN_OPTIONS = [
  { value: '', label: 'Unmapped (Other)' },
  ...WORKERS_COUNT_SUMMARY_ACTIVITIES.map((a) => ({ value: a.key, label: a.label })),
];
