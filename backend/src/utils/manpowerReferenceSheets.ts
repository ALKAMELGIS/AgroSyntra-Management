export const REFERENCE_SHEETS = [
  { id: 'preparation', label: 'Preparation' },
  { id: 'harvest', label: 'Harvest' },
  { id: 'crop_maintenance', label: 'Crop maintenance' },
  { id: 'general', label: 'General' },
] as const;

export type BuiltinSheetId = typeof REFERENCE_SHEETS[number]['id'];
export type ReferenceSheetId = string;

function key(name: string | null | undefined): string {
  return String(name || '').trim().toLowerCase();
}

function includesAny(name: string, needles: string[]): boolean {
  const k = key(name);
  return needles.some((n) => k.includes(n));
}

export function slugifySheetName(name: string | null | undefined): string {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80);
}

export function builtinSheetId(value: string | null | undefined): BuiltinSheetId | null {
  const k = key(value);
  if (!k) return null;
  const hit = REFERENCE_SHEETS.find((s) => (
    s.id === k || key(s.label) === k || slugifySheetName(s.label) === k
  ));
  return hit ? hit.id : null;
}

export function resolveRowSheetId(row: { activity?: string; sheet?: string | null }): string {
  const builtin = builtinSheetId(row?.sheet);
  if (builtin) return builtin;
  const stored = String(row?.sheet || '').trim();
  if (stored) return slugifySheetName(stored);
  return referenceSheetForActivity(row?.activity || '');
}

export function normalizeStoredSheet(
  raw: string | null | undefined,
  activity: string,
): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return referenceSheetForActivity(activity);
  const builtin = builtinSheetId(trimmed);
  if (builtin) return builtin;
  return trimmed.slice(0, 80);
}

export function referenceSheetForActivity(name: string): BuiltinSheetId {
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

export function isGeneralReferenceSheet(sheetId: ReferenceSheetId): boolean {
  return sheetId === 'general';
}

export type CatalogActivity = { name: string; default_unit?: string | null };

export type SeedReferenceRow = {
  activity: string;
  crop: string | null;
  unit: string | null;
  sheet: string;
};

export function buildReferenceSeedRows(
  catalog: CatalogActivity[],
  siteCrops: string[],
): SeedReferenceRow[] {
  const rows: SeedReferenceRow[] = [];
  for (const activity of catalog) {
    const unit = activity.default_unit ? String(activity.default_unit).trim() || null : null;
    const sheet = referenceSheetForActivity(activity.name);
    if (isGeneralReferenceSheet(sheet)) {
      rows.push({ activity: activity.name, crop: null, unit, sheet });
      continue;
    }
    for (const crop of siteCrops) {
      rows.push({ activity: activity.name, crop, unit, sheet });
    }
  }
  return rows;
}
