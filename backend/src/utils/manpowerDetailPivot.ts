/** Labels and layout for manpower "detail summary" / workers count pivot (matches farm Excel). */

export const FIELD_ACTIVITIES = [
  'Bed Making/Mulching',
  'Clipping',
  'Harvesting',
  'Hook Making',
  'Lowering',
  'Planting',
  'Pruning',
  'Trellising',
  'Uprooting/Cleaning',
  'Weeding',
] as const;

export const GENERAL_ACTIVITIES = [
  'Crate Washing',
  'IPM',
  'Irrigation',
  'Maintenance',
  'Nursary',
  'Operator',
  'Supervisor',
  'Office',
] as const;

export const ALL_PIVOT_ACTIVITIES = [...FIELD_ACTIVITIES, ...GENERAL_ACTIVITIES] as const;

/** Workers count grid columns (17); keep in sync with manpowerDetailPivotConstants.js */
export const WORKERS_COUNT_GRID_COLUMNS = [
  { key: 'Supervisor', label: 'Supervisor' },
  { key: 'Operator', label: 'Operator' },
  { key: 'Irrigation', label: 'Irrigation' },
  { key: 'IPM', label: 'IPM' },
  { key: 'Maintenance', label: 'Maintenance' },
  { key: 'Nursary', label: 'Nursery' },
  { key: 'Crate Washing', label: 'Crate Washing' },
  { key: 'Hook Making', label: 'Hook Making' },
  { key: 'Uprooting/Cleaning', label: 'Uprooting/Cleaning' },
  { key: 'Bed Making/Mulching', label: 'Bed Making/Mulching' },
  { key: 'Planting', label: 'Planting' },
  { key: 'Clipping', label: 'Clipping' },
  { key: 'Trellising', label: 'Trellising' },
  { key: 'Pruning', label: 'Pruning' },
  { key: 'Lowering', label: 'Lowering' },
  { key: 'Weeding', label: 'Weeding' },
  { key: 'Harvesting', label: 'Harvesting' },
] as const;

export const VALID_PIVOT_COLUMN_KEYS = WORKERS_COUNT_GRID_COLUMNS.map((c) => c.key);

export type PivotColumnKey = (typeof VALID_PIVOT_COLUMN_KEYS)[number];

/** Preferred column order for crop blocks; extra crops from data append before General. */
export const PREFERRED_CROP_ORDER = [
  'Blackberry',
  'Chilli',
  'Eggplant',
  'Fig',
  'Melon (R&D)',
  'No Crop',
  'Snack Cucumber',
  'Tomato Cherry',
  'Tomato Plum',
  'Tomato Table',
  'Zucchini Green',
  'Zucchini Yellow',
  'Broccoli',
  'Cauliflower',
  'Iceberg lettuce',
  'Red cabbage',
  'Tomato Beef',
  'Tomato Bunch',
  'Sweetcorn',
  'White Cabbage',
  'General',
] as const;

const ACTIVITY_ALIASES: Record<string, string> = {
  nursery: 'Nursary',
  'nursary': 'Nursary',
  'bed making': 'Bed Making/Mulching',
  'bed making/mulching': 'Bed Making/Mulching',
  'mulching': 'Bed Making/Mulching',
  'uprooting': 'Uprooting/Cleaning',
  'uprooting/cleaning': 'Uprooting/Cleaning',
  'cleaning': 'Uprooting/Cleaning',
  'hook making': 'Hook Making',
  'crate washing': 'Crate Washing',
};

function normalizeKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function buildActivityPivotColumnMap(
  catalogRows: Array<{ name: string; pivot_column: string | null }>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of catalogRows) {
    if (row.pivot_column) {
      map.set(normalizeKey(row.name), row.pivot_column);
    }
  }
  return map;
}

export function normalizeActivity(
  raw: string | null | undefined,
  columnMap?: ReadonlyMap<string, string>,
): string {
  const t = (raw || '').trim();
  if (!t) return '(blank)';
  const key = normalizeKey(t);
  if (columnMap) {
    const fromCatalog = columnMap.get(key);
    if (fromCatalog) return fromCatalog;
  }
  const alias = ACTIVITY_ALIASES[key];
  if (alias) return alias;
  for (const a of ALL_PIVOT_ACTIVITIES) {
    if (normalizeKey(a) === key) return a;
  }
  for (const a of ALL_PIVOT_ACTIVITIES) {
    if (key.includes(normalizeKey(a)) || normalizeKey(a).includes(key)) return a;
  }
  return t;
}

export function isGeneralActivity(activity: string): boolean {
  return (GENERAL_ACTIVITIES as readonly string[]).includes(activity);
}

/** Excel Crop 0 / blank / dash means the worker was not on a crop. */
export function isMeaningfulVariety(variety: string | null | undefined): boolean {
  if (variety == null || variety === '') return false;
  const text = String(variety).trim();
  if (!text) return false;
  const key = text.toLowerCase();
  return text !== '0' && text !== '-' && key !== 'n/a';
}

export function normalizeCrop(
  variety: string | null | undefined,
  activity: string,
): string {
  if (isGeneralActivity(activity)) return 'General';
  if (!isMeaningfulVariety(variety)) return 'No Crop';
  const v = String(variety).trim();
  const key = normalizeKey(v);
  for (const c of PREFERRED_CROP_ORDER) {
    if (c === 'General') continue;
    if (normalizeKey(c) === key) return c;
  }
  return v;
}

export function normalizeVariety(
  variety: string | null | undefined,
  activity: string,
): string {
  if (isGeneralActivity(activity)) return 'General';
  const v = (variety || '').trim();
  return v || 'No Variety';
}

export function resolveRecordCrop(row: {
  variety: string | null | undefined;
  activity: string | null | undefined;
  field_crop_name?: string | null;
  variety_crop_name?: string | null;
}, columnMap?: ReadonlyMap<string, string>): string {
  const activity = normalizeActivity(row.activity, columnMap);
  if (isGeneralActivity(activity)) return 'General';
  if (!isMeaningfulVariety(row.variety)) return 'No Crop';
  const fieldCrop = (row.field_crop_name || '').trim();
  if (fieldCrop) return fieldCrop;
  const varietyCrop = (row.variety_crop_name || '').trim();
  if (varietyCrop) return varietyCrop;
  return normalizeCrop(row.variety, activity);
}

export function sortCropsForPivot(cropsFromData: string[]): string[] {
  const set = new Set(cropsFromData.filter(Boolean));
  const hasGeneral = set.has('General');
  set.delete('General');
  const ordered: string[] = [];
  for (const c of PREFERRED_CROP_ORDER) {
    if (c === 'General') continue;
    if (set.has(c)) {
      ordered.push(c);
      set.delete(c);
    }
  }
  const rest = [...set].sort((a, b) => a.localeCompare(b));
  const result = [...ordered, ...rest];
  if (hasGeneral) result.push('General');
  return result;
}

export function fieldCropsOrdered(allCrops: string[]): string[] {
  return allCrops.filter((c) => c !== 'General');
}

/** ISO date YYYY-MM-DD → Excel serial (1900 date system). */
export function isoDateToExcelSerial(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  const utc = Date.UTC(y, m - 1, d);
  const epoch = Date.UTC(1899, 11, 30);
  return Math.floor((utc - epoch) / 86400000);
}

export function excelSerialToIso(serial: number): string {
  const epoch = Date.UTC(1899, 11, 30);
  const ms = epoch + serial * 86400000;
  const dt = new Date(ms);
  const y = dt.getUTCFullYear();
  const mo = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

/** Normalize DB/API record_date to YYYY-MM-DD for pivot keys. */
export function normalizeRecordDate(
  recordDate: string | Date | null | undefined,
): string {
  if (recordDate == null || recordDate === '') return '';
  if (recordDate instanceof Date && !Number.isNaN(recordDate.getTime())) {
    return recordDate.toISOString().split('T')[0];
  }
  const s = String(recordDate).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parsed = Date.parse(s);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString().split('T')[0];
  }
  return s.split('T')[0];
}

export type PivotCell = {
  date: string;
  crop: string;
  variety: string;
  activity: string;
  casual: number;
  eag: number;
  casualHours?: number;
  eagHours?: number;
  actual?: number;
  unit?: string;
  missingHours?: number;
  units?: string[];
};

type PivotBucket = {
  casual: Set<string>;
  eag: Set<string>;
  casualHours: number;
  eagHours: number;
  actual: number;
  units: Set<string>;
  missingHours: number;
};

export type PivotAggregateMaps = {
  /** key: date|crop|variety|activity */
  buckets: Map<string, PivotBucket>;
  dates: string[];
  crops: string[];
  missingHoursCount: number;
};

export type RawPivotRow = {
  record_date: string;
  variety: string | null;
  activity: string | null;
  location?: string | null;
  section?: string | null;
  field_crop_name?: string | null;
  variety_crop_name?: string | null;
  worker_id: string;
  worker_category: string;
  worker_name?: string | null;
  employee_id?: string | null;
  hours?: number | string | null;
  hours_missing?: boolean | null;
  actual?: number | string | null;
  unit?: string | null;
  total_hours?: number | string | null;
};

export type ResolvedPivotRow = {
  date: string;
  crop: string;
  variety: string;
  activity: string;
  location: string;
  section: string;
  workerId: string;
  workerCategory: string;
  workerName: string;
  employeeId: string;
  hours: number;
  hoursMissing: boolean;
  actual: number;
  unit: string;
  hasActual: boolean;
  totalHours: number;
};

function emptyBucket(): PivotBucket {
  return {
    casual: new Set(),
    eag: new Set(),
    casualHours: 0,
    eagHours: 0,
    actual: 0,
    units: new Set(),
    missingHours: 0,
  };
}

function parseHours(value: number | string | null | undefined): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, n);
}

function parseActual(value: number | string | null | undefined): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n;
}

/** Resolve crop/activity/hours for each raw DB row (shared by pivot grid and drill-down). */
export function resolveAndNormalizeRows(
  rows: RawPivotRow[],
  columnMap?: ReadonlyMap<string, string>,
): ResolvedPivotRow[] {
  const resolved: ResolvedPivotRow[] = [];
  for (const row of rows) {
    const date = normalizeRecordDate(row.record_date);
    if (!date) continue;
    const activity = normalizeActivity(row.activity, columnMap);
    const crop = resolveRecordCrop(row, columnMap);
    const variety = normalizeVariety(row.variety, activity);
    const hoursMissing = Boolean(row.hours_missing);
    const hasActual = row.actual != null && row.actual !== '';
    resolved.push({
      date,
      crop,
      variety,
      activity,
      location: (row.location || '').trim(),
      section: (row.section || '').trim(),
      workerId: row.worker_id,
      workerCategory: (row.worker_category || '').trim(),
      workerName: (row.worker_name || '').trim(),
      employeeId: (row.employee_id || '').trim(),
      hours: hoursMissing ? 0 : parseHours(row.hours),
      hoursMissing,
      actual: parseActual(row.actual),
      unit: (row.unit || '').trim(),
      hasActual,
      totalHours: parseHours(row.total_hours),
    });
  }
  return resolved;
}

export function filterRowsForCell(
  rows: ResolvedPivotRow[],
  opts: {
    crop: string;
    variety?: string;
    activity: string;
    groupBy?: 'crop' | 'variety';
  },
): ResolvedPivotRow[] {
  const groupBy = opts.groupBy || 'crop';
  return rows.filter((row) => {
    if (row.activity !== opts.activity) return false;
    if (groupBy === 'variety') {
      const v = opts.variety || row.variety;
      return row.variety === v;
    }
    return row.crop === opts.crop;
  });
}

export type DrillDownGroupedRow = {
  date: string;
  location: string;
  section: string;
  activity: string;
  crop: string;
  variety: string;
  eagWorkers: number;
  casualWorkers: number;
  hours: number;
  actual: number;
  units: string[];
  workers: Array<{
    name: string;
    employeeId: string;
    category: string;
    hours: number;
  }>;
};

/** Group resolved rows by date + location + section (after JS crop/activity filter). */
export function groupRowsForDrillDown(rows: ResolvedPivotRow[]): DrillDownGroupedRow[] {
  const map = new Map<string, {
    date: string;
    location: string;
    section: string;
    activity: string;
    crop: string;
    variety: string;
    eag: Set<string>;
    casual: Set<string>;
    hours: number;
    actual: number;
    units: Set<string>;
    workers: Map<string, { name: string; employeeId: string; category: string; hours: number }>;
  }>();

  for (const row of rows) {
    const key = `${row.date}|${row.location}|${row.section}|${row.activity}|${row.crop}|${row.variety}`;
    if (!map.has(key)) {
      map.set(key, {
        date: row.date,
        location: row.location,
        section: row.section,
        activity: row.activity,
        crop: row.crop,
        variety: row.variety,
        eag: new Set(),
        casual: new Set(),
        hours: 0,
        actual: 0,
        units: new Set(),
        workers: new Map(),
      });
    }
    const g = map.get(key)!;
    if (row.workerCategory === 'Permanent') {
      g.eag.add(row.workerId);
    } else {
      g.casual.add(row.workerId);
    }
    g.hours += row.hours;
    if (row.actual) {
      g.actual += row.actual;
      if (row.unit) g.units.add(row.unit);
    }
    const wKey = row.workerId;
    if (!g.workers.has(wKey)) {
      g.workers.set(wKey, {
        name: row.workerName,
        employeeId: row.employeeId,
        category: row.workerCategory,
        hours: 0,
      });
    }
    g.workers.get(wKey)!.hours += row.hours;
  }

  return [...map.values()]
    .map((g) => ({
      date: g.date,
      location: g.location,
      section: g.section,
      activity: g.activity,
      crop: g.crop,
      variety: g.variety,
      eagWorkers: g.eag.size,
      casualWorkers: g.casual.size,
      hours: Math.round(g.hours * 100) / 100,
      actual: g.actual,
      units: [...g.units].sort(),
      workers: [...g.workers.values()].sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => {
      const d = a.date.localeCompare(b.date);
      if (d !== 0) return d;
      return a.location.localeCompare(b.location);
    });
}

export function buildPivotMapsFromRows(
  rows: RawPivotRow[],
  columnMap?: ReadonlyMap<string, string>,
): PivotAggregateMaps {
  const buckets = new Map<string, PivotBucket>();
  const dateSet = new Set<string>();
  const cropSet = new Set<string>();
  let missingHoursCount = 0;

  for (const row of resolveAndNormalizeRows(rows, columnMap)) {
    dateSet.add(row.date);
    cropSet.add(row.crop);
    if (row.hoursMissing) missingHoursCount += 1;

    const key = `${row.date}|${row.crop}|${row.variety}|${row.activity}`;
    if (!buckets.has(key)) {
      buckets.set(key, emptyBucket());
    }
    const bucket = buckets.get(key)!;
    if (row.workerCategory === 'Permanent') {
      bucket.eag.add(row.workerId);
      bucket.eagHours += row.hours;
    } else {
      bucket.casual.add(row.workerId);
      bucket.casualHours += row.hours;
    }
    if (row.hoursMissing) bucket.missingHours += 1;
    if (row.actual) {
      bucket.actual += row.actual;
      if (row.unit) bucket.units.add(row.unit);
    }
  }

  const dates = [...dateSet].sort();
  const crops = sortCropsForPivot([...cropSet]);
  return { buckets, dates, crops, missingHoursCount };
}

export function pivotMapsToCells(maps: PivotAggregateMaps): PivotCell[] {
  const cells: PivotCell[] = [];
  for (const [key, bucket] of maps.buckets) {
    const [date, crop, variety, activity] = key.split('|');
    cells.push({
      date,
      crop,
      variety,
      activity,
      casual: bucket.casual.size,
      eag: bucket.eag.size,
      casualHours: Math.round(bucket.casualHours * 100) / 100,
      eagHours: Math.round(bucket.eagHours * 100) / 100,
      actual: bucket.actual,
      unit: bucket.units.size === 1 ? [...bucket.units][0] : '',
      units: [...bucket.units].sort(),
      missingHours: bucket.missingHours,
    });
  }
  return cells;
}

export function productivityForCells(
  cells: PivotCell[],
  rowKey: string,
  activity: string,
  groupBy: 'crop' | 'variety' = 'crop',
): {
  hours: number;
  actual: number;
  unit: string;
  hoursPerUnit: number | null;
  mixedUnits: boolean;
  recordsWithActual: number;
  totalRecords: number;
} {
  let hours = 0;
  let actual = 0;
  const units = new Set<string>();
  let recordsWithActual = 0;
  let totalRecords = 0;

  for (const c of cells) {
    const key = groupBy === 'variety' ? (c.variety || c.crop) : c.crop;
    if (key !== rowKey || c.activity !== activity) continue;
    totalRecords += 1;
    hours += (c.casualHours || 0) + (c.eagHours || 0);
    if (c.actual) {
      actual += c.actual;
      recordsWithActual += 1;
      for (const u of c.units || (c.unit ? [c.unit] : [])) {
        if (u) units.add(u);
      }
    }
  }

  const mixedUnits = units.size > 1;
  const unit = units.size === 1 ? [...units][0] : '';
  const hoursPerUnit = !mixedUnits && actual > 0
    ? Math.round((hours / actual) * 100) / 100
    : null;

  return {
    hours: Math.round(hours * 100) / 100,
    actual,
    unit,
    hoursPerUnit,
    mixedUnits,
    recordsWithActual,
    totalRecords,
  };
}

export function getCellCounts(
  maps: PivotAggregateMaps,
  date: string,
  crop: string,
  variety: string,
  activity: string,
): { casual: number; eag: number } {
  const key = `${date}|${crop}|${variety}|${activity}`;
  const b = maps.buckets.get(key);
  if (!b) return { casual: 0, eag: 0 };
  return { casual: b.casual.size, eag: b.eag.size };
}

export function sumCropForDate(
  maps: PivotAggregateMaps,
  date: string,
  crop: string,
  variety: string,
  activities: readonly string[],
): { casual: number; eag: number } {
  let casual = 0;
  let eag = 0;
  for (const activity of activities) {
    const c = getCellCounts(maps, date, crop, variety, activity);
    casual += c.casual;
    eag += c.eag;
  }
  return { casual, eag };
}
