/**
 * Tank-mix (mixture) groups on pesticide rows: rows sharing a `groupId`, the main row first
 * (`isMixtureChild` false) and its mixture rows after it. One application may hold at most
 * MAX_PRODUCTS_PER_MIXTURE products (the main product + 2 mixtures). Mirrors the backend cap.
 */

export const MAX_PRODUCTS_PER_MIXTURE = 3;

/**
 * A mixture is the same tank pass as its main row, so these values are locked on mixture rows:
 * they show the main row's value and follow it when it changes.
 */
export const WORK_ORDER_LOCKED_KEYS = ['startTime', 'endTime', 'machineryRef', 'completedByName'];
export const SHEET_LOCKED_KEYS = ['applicationStartTime', 'applicationEndTime', 'machineryUsed', 'operatorName'];

function mainRowsByGroup(rows) {
  const mains = new Map();
  (rows || []).forEach((row) => {
    if (row?.groupId && !row.isMixtureChild && !mains.has(row.groupId)) mains.set(row.groupId, row);
  });
  return mains;
}

function sameValues(a, b, keys) {
  return keys.every((k) => (a?.[k] ?? '') === (b?.[k] ?? ''));
}

/**
 * Every mixture row takes `keys` from its group's main row. Returns the rows and the indices
 * that changed (unchanged rows keep their identity).
 */
export function alignMixtures(rows, keys) {
  const mains = mainRowsByGroup(rows);
  const changed = [];
  const next = (rows || []).map((row, i) => {
    const main = row?.isMixtureChild ? mains.get(row.groupId) : null;
    if (!main || sameValues(row, main, keys)) return row;
    changed.push(i);
    const copy = { ...row };
    keys.forEach((k) => { copy[k] = main[k] ?? ''; });
    return copy;
  });
  return { rows: next, changed };
}

/** Indices of the mixture rows under the main row at `idx` (empty for a mixture or a lone row). */
export function mixtureMembers(rows, idx) {
  const row = rows?.[idx];
  if (!row?.groupId || row.isMixtureChild) return [];
  return (rows || []).reduce((acc, r, i) => {
    if (i !== idx && r?.isMixtureChild && r.groupId === row.groupId) acc.push(i);
    return acc;
  }, []);
}

export function groupSize(rows, groupId) {
  if (!groupId) return 1;
  return (rows || []).filter((r) => r?.groupId === groupId).length;
}

/** True when another mixture may be added to the application row `idx` belongs to. */
export function canAddMixture(rows, idx) {
  const row = rows?.[idx];
  if (!row) return false;
  return groupSize(rows, row.groupId) < MAX_PRODUCTS_PER_MIXTURE;
}

/** Index after which a new mixture for row `idx`'s group goes (after the group's last mixture). */
export function mixtureInsertIndex(rows, idx) {
  const groupId = rows[idx]?.groupId;
  let at = idx + 1;
  if (!groupId) return at;
  while (at < rows.length && rows[at]?.isMixtureChild && rows[at]?.groupId === groupId) at += 1;
  return at;
}

/**
 * Row numbers as shown on the work order: main rows 1, 2, 3… and mixture rows `mixtureLabel`,
 * so mixtures do not use up a number. `isMixture(row, index)` tells a mixture row apart.
 */
export function rowLabels(rows, isMixture, mixtureLabel = '+') {
  let n = 0;
  return (rows || []).map((row, i) => {
    if (isMixture(row, i)) return mixtureLabel;
    n += 1;
    return String(n);
  });
}

/**
 * Copies the main row at `idx` and its mixtures as a new, unsaved application (new group),
 * placed right after the original application. `makeId()` gives each copy its client id.
 * Returns { rows, newIds }; rows are unchanged when `idx` is not a main row with mixtures.
 */
export function duplicateMixtureGroup(rows, idx, { newGroupId, makeId }) {
  const members = mixtureMembers(rows, idx);
  if (members.length === 0) return { rows, newIds: [] };
  const newIds = [];
  const copies = [idx, ...members].map((i) => {
    const { id, _createdAt, ...rest } = rows[i];
    const copy = { ...rest, _id: makeId(), _saved: false, groupId: newGroupId };
    newIds.push(copy._id);
    return copy;
  });
  const next = [...rows];
  next.splice(mixtureInsertIndex(rows, idx), 0, ...copies);
  return { rows: next, newIds };
}

function createdTime(row) {
  const t = Date.parse(row?._createdAt || row?.createdAt || row?.created_at || '');
  return Number.isNaN(t) ? null : t;
}

/**
 * Puts every group back together: groups keep the position of their first row, the main row
 * comes first and mixtures follow in the order they were created. Saved records load newest
 * first, which otherwise puts a mixture above its main row.
 */
export function orderMixtureGroups(rows) {
  const list = rows || [];
  const members = new Map();
  list.forEach((row, index) => {
    if (!row?.groupId) return;
    if (!members.has(row.groupId)) members.set(row.groupId, []);
    members.get(row.groupId).push({ row, index });
  });

  const placed = new Set();
  const out = [];
  list.forEach((row) => {
    if (!row?.groupId) { out.push(row); return; }
    if (placed.has(row.groupId)) return;
    placed.add(row.groupId);
    const group = members.get(row.groupId);
    const mains = group.filter((m) => !m.row.isMixtureChild);
    const mixes = group.filter((m) => m.row.isMixtureChild).sort((a, b) => {
      const ta = createdTime(a.row);
      const tb = createdTime(b.row);
      if (ta != null && tb != null && ta !== tb) return ta - tb;
      return a.index - b.index;
    });
    [...mains, ...mixes].forEach((m) => out.push(m.row));
  });
  return out;
}
