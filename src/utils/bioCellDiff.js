/**
 * Biological control grid: server cell state, local drafts, and the diff that Save sends.
 *
 * Each cell (product column x week) from the server carries the APPROVED values
 * (per_m2 / units — the only ones ever counted) and, optionally, a PENDING proposal
 * from a scouter or a worker import, plus a rejection note.
 *
 * mode 'manager'  — the pest agronomist edits the approved value.
 * mode 'proposer' — a scouter edits their proposal; the input starts from the pending
 *                   value when there is one, otherwise from the approved value.
 */

export function cellKey(productId, week) {
  return `${productId}_${week}`;
}

export function parseCellKey(key) {
  const idx = String(key).lastIndexOf('_');
  return { productColumnId: key.slice(0, idx), weekNumber: parseInt(key.slice(idx + 1), 10) };
}

/** Blank, zero and non-numeric are "no value" (the grid has always treated 0 as empty). */
export function normalizeCellValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : parseFloat(value);
  if (!Number.isFinite(n) || n === 0) return null;
  return n;
}

export function toServerCell(entry) {
  const pendingAt = entry.pending_at || null;
  return {
    perM2: normalizeCellValue(entry.per_m2),
    units: normalizeCellValue(entry.units),
    hasPending: Boolean(pendingAt),
    pendingPerM2: normalizeCellValue(entry.pending_per_m2),
    pendingUnits: normalizeCellValue(entry.pending_units),
    pendingClear: Boolean(entry.pending_clear),
    pendingBy: entry.pending_by || null,
    pendingByName: entry.pending_by_name || null,
    pendingAt,
    rejectedReason: entry.rejected_reason || null,
    rejectedByName: entry.rejected_by_name || null,
    rejectedAt: entry.rejected_at || null,
  };
}

export function buildServerCellMap(entries) {
  const map = {};
  for (const entry of entries || []) {
    map[cellKey(entry.product_column_id, entry.week_number)] = toServerCell(entry);
  }
  return map;
}

/** The value pair an editor starts from. */
export function editableBase(cell, mode) {
  if (!cell) return { perM2: null, units: null };
  if (mode === 'proposer' && cell.hasPending) {
    return cell.pendingClear
      ? { perM2: null, units: null }
      : { perM2: cell.pendingPerM2, units: cell.pendingUnits };
  }
  return { perM2: cell.perM2, units: cell.units };
}

/** What a draft cell resolves to: typed halves win, untouched halves keep the base. */
export function resolveDraft(cell, draft, mode) {
  const base = editableBase(cell, mode);
  if (!draft) return base;
  return {
    perM2: Object.prototype.hasOwnProperty.call(draft, 'perM2') ? normalizeCellValue(draft.perM2) : base.perM2,
    units: Object.prototype.hasOwnProperty.call(draft, 'units') ? normalizeCellValue(draft.units) : base.units,
  };
}

/** Only the cells whose value really changed, in the shape PUT /bio-records/entries/bulk takes. */
export function diffBioCells(serverCells, drafts, mode) {
  const changed = [];
  for (const [key, draft] of Object.entries(drafts || {})) {
    const cell = serverCells?.[key];
    const base = editableBase(cell, mode);
    const next = resolveDraft(cell, draft, mode);
    if (next.perM2 === base.perM2 && next.units === base.units) continue;
    const { productColumnId, weekNumber } = parseCellKey(key);
    if (!productColumnId || !Number.isFinite(weekNumber)) continue;
    changed.push({ productColumnId, weekNumber, perM2: next.perM2, units: next.units });
  }
  return changed;
}

/**
 * The value that counts toward totals and cost: always the approved value, except
 * that the manager's own unsaved edits show live (they will be saved as approved).
 */
export function countedCellValue(cell, draft, mode) {
  if (mode === 'manager' && draft) return resolveDraft(cell, draft, 'manager');
  return { perM2: cell?.perM2 ?? null, units: cell?.units ?? null };
}

export function pendingCellKeys(serverCells) {
  return Object.entries(serverCells || {})
    .filter(([, cell]) => cell?.hasPending)
    .map(([key]) => key);
}
