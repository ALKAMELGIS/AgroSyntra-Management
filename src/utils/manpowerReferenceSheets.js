export const REFERENCE_SHEETS = [
  { id: 'preparation', label: 'Preparation' },
  { id: 'harvest', label: 'Harvest' },
  { id: 'crop_maintenance', label: 'Crop maintenance' },
  { id: 'general', label: 'General' },
];

function key(name) {
  return String(name || '').trim().toLowerCase();
}

function includesAny(name, needles) {
  const k = key(name);
  return needles.some((n) => k.includes(n));
}

/**
 * Map a catalog activity name onto a Reference sheet.
 * Unknown field work lands in crop maintenance so nothing is dropped.
 */
export function referenceSheetForActivity(name) {
  const k = key(name);
  if (!k) return 'crop_maintenance';

  if (includesAny(k, [
    'harvesting',
    'forecasting harvest',
    'product loading',
    'crates cleaning',
    'crates/pallet',
    'pallet arranging',
  ])) {
    return 'harvest';
  }

  if (includesAny(k, [
    'bed preparation',
    'bed making',
    'mulching',
    'planting',
    'hook',
    'uproot',
    'cocopit',
    'sowing',
    'micro drip',
  ])) {
    return 'preparation';
  }

  if (includesAny(k, [
    'weeding',
    'pruning',
    'clipping',
    'trellis',
    'lowering',
    'spray',
    'leaf',
    'plant checking',
    'side shoot',
    'root cleaning',
  ])) {
    return 'crop_maintenance';
  }

  if (includesAny(k, [
    'supervisor',
    'scouting',
    'irrigation',
    'operator',
    'data entry',
    'transportation',
    'maintenance',
    'nursary',
    'nursery',
    'office',
    'ipm',
    'crate washing',
    'toilet',
    'ec & ph',
    'no work',
    'absent',
    'water distribution',
  ])) {
    return 'general';
  }

  return 'crop_maintenance';
}

export const ANY_VARIETY_LABEL = 'Any variety';
export const ANY_CROP_LABEL = 'Any crop';

export function slugifySheetName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80);
}

export function builtinSheetId(value) {
  const k = key(value);
  if (!k) return null;
  const hit = REFERENCE_SHEETS.find((s) => (
    s.id === k || key(s.label) === k || slugifySheetName(s.label) === k
  ));
  return hit ? hit.id : null;
}

export function resolveRowSheetId(row) {
  const builtin = builtinSheetId(row?.sheet);
  if (builtin) return builtin;
  const stored = String(row?.sheet || '').trim();
  if (stored) return slugifySheetName(stored);
  return referenceSheetForActivity(row?.activity);
}

export function resolveRowSheetLabel(row) {
  const id = resolveRowSheetId(row);
  const builtin = REFERENCE_SHEETS.find((s) => s.id === id);
  if (builtin) return builtin.label;
  return String(row?.sheet || '').trim() || id;
}

export function isGeneralReferenceSheet(sheetId) {
  return sheetId === 'general';
}

export function rowMatchesSheet(row, sheetId) {
  return resolveRowSheetId(row) === sheetId;
}

export function visibleReferenceSheets(rows) {
  const custom = [];
  const seen = new Set();
  (rows || []).forEach((row) => {
    const id = resolveRowSheetId(row);
    if (REFERENCE_SHEETS.some((s) => s.id === id) || seen.has(id)) return;
    seen.add(id);
    custom.push({ id, label: resolveRowSheetLabel(row), stored: String(row.sheet || '').trim() });
  });
  custom.sort((a, b) => a.label.localeCompare(b.label));
  return [...REFERENCE_SHEETS, ...custom];
}

export function matchSheetName(name, existingSheets) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return null;
  const builtin = builtinSheetId(trimmed);
  if (builtin) {
    const sheet = REFERENCE_SHEETS.find((s) => s.id === builtin);
    return { id: builtin, label: sheet.label, stored: builtin, isNew: false };
  }
  const slug = slugifySheetName(trimmed);
  if (!slug) return null;
  const existing = (existingSheets || []).find((s) => (
    s.id === slug || key(s.label) === key(trimmed) || slugifySheetName(s.label) === slug
  ));
  if (existing) {
    return {
      id: existing.id,
      label: existing.label,
      stored: existing.stored || existing.id,
      isNew: false,
    };
  }
  return { id: slug, label: trimmed, stored: trimmed, isNew: true };
}
