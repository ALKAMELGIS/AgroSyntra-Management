/**
 * Rows the operator edits while filling in an issued work order. He may add another
 * application row (e.g. the issued pesticide ran short), add a mixture (tank mix) to a row,
 * and remove only rows he added. Every function returns a new list.
 */

import { WORK_ORDER_LOCKED_KEYS, alignMixtures, canAddMixture, mixtureInsertIndex } from './mixtureGroups';

const PLAN_KEYS_SHARED_BY_MIXTURE = ['fieldId', 'segment', 'dateOfApplication'];

export function blankOperatorRow(overrides = {}) {
  return {
    fieldId: '', segment: '', productId: '', rate: '', dateOfApplication: '',
    groupId: null, isMixtureChild: false,
    startTime: '', endTime: '', totalProductQty: '', totalWaterQty: '',
    actualQty: '', machineryRef: '', qualityCheck: false, completedByName: '',
    orig: null, addedByOperator: true,
    ...overrides,
  };
}

/** Appends a new application row; its date defaults to the first row's date. */
export function addOperatorRow(rows, { key, fallbackDate = '' }) {
  return [...rows, blankOperatorRow({ key, dateOfApplication: rows[0]?.dateOfApplication || fallbackDate })];
}

/**
 * Adds a mixture to the application row `idx` belongs to (called from its main row or from one
 * of its mixtures), after the mixtures already there. The mixture copies the row's field,
 * segment and date, and its start / end time, machinery and completed by (locked to the main
 * row), and shares its group (the row gets a group if it had none). An application holds at
 * most MAX_PRODUCTS_PER_MIXTURE products.
 */
export function addOperatorMixture(rows, idx, { key, newGroupId }) {
  const parent = rows[idx];
  if (!parent || !canAddMixture(rows, idx)) return rows;
  const groupId = parent.groupId || newGroupId;
  const next = [...rows];
  next[idx] = { ...parent, groupId };
  const locked = Object.fromEntries(WORK_ORDER_LOCKED_KEYS.map((k) => [k, parent[k] ?? '']));
  next.splice(mixtureInsertIndex(next, idx), 0, blankOperatorRow({
    key,
    fieldId: parent.fieldId,
    segment: parent.segment,
    dateOfApplication: parent.dateOfApplication,
    ...locked,
    groupId,
    isMixtureChild: true,
  }));
  return alignOperatorRows(next);
}

/** Mixture rows take the locked values (times, machinery, completed by) from their main row. */
export function alignOperatorRows(rows) {
  return alignMixtures(rows, WORK_ORDER_LOCKED_KEYS).rows;
}

/** Removes a row the operator added, with the mixtures he added under it. Issued rows stay. */
export function removeOperatorRow(rows, idx) {
  const row = rows[idx];
  if (!row?.addedByOperator) return rows;
  return rows.filter((it, i) => i !== idx && !(
    !row.isMixtureChild && row.groupId && it.isMixtureChild && it.groupId === row.groupId && it.addedByOperator
  ));
}

/**
 * Sets one value. Added mixtures follow their row's field, segment and date; every mixture
 * follows its row's start / end time, machinery and completed by, which it cannot change itself.
 */
export function updateOperatorRow(rows, idx, key, value) {
  const current = rows[idx];
  if (current?.isMixtureChild && WORK_ORDER_LOCKED_KEYS.includes(key)) return rows;
  const next = [...rows];
  const row = { ...next[idx], [key]: value };
  next[idx] = row;
  if (PLAN_KEYS_SHARED_BY_MIXTURE.includes(key) && !row.isMixtureChild && row.groupId) {
    next.forEach((it, i) => {
      if (i !== idx && it.isMixtureChild && it.groupId === row.groupId && it.addedByOperator) {
        next[i] = { ...it, [key]: value };
      }
    });
  }
  return WORK_ORDER_LOCKED_KEYS.includes(key) ? alignOperatorRows(next) : next;
}

/**
 * What has to be filled in before the rows can be saved: every row needs a pesticide, and a
 * row the operator added also needs its field. Rows are named as the operator sees them
 * ("Row 2", "Mixture under row 2"). Returns [] when everything is fine.
 */
export function operatorRowProblems(rows) {
  const problems = [];
  let rowNumber = 0;
  (rows || []).forEach((row, index) => {
    if (!row.isMixtureChild) rowNumber += 1;
    const label = row.isMixtureChild ? `Mixture under row ${rowNumber}` : `Row ${rowNumber}`;
    const isNew = !row.id;
    if (isNew && !row.fieldId) problems.push({ index, label, message: `${label}: choose a field` });
    if (!row.productId) problems.push({ index, label, message: `${label}: choose a pesticide` });
  });
  return problems;
}

/** Body rows for operator save / complete: rows with an id are existing, rows without one are new. */
export function operatorRowsPayload(rows) {
  return rows.map(({ key, orig, addedByOperator, ...row }) => row);
}
