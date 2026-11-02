export type ColumnProfile = 'standard' | 'bl_block';

export type SummaryColumnKind = 'meta' | 'observation' | 'bio' | 'notes';

export interface SummaryColumnDef {
  key: string;
  header: string;
  kind: SummaryColumnKind;
  matchAbbr?: string;
  matchNamePatterns?: string[];
  bioProductPattern?: string;
}

export interface SummaryObservationRow {
  pestName: string;
  category: string;
  total?: number | null;
  average?: number | null;
  count1?: number | null;
  count2?: number | null;
  count3?: number | null;
  count4?: number | null;
  count5?: number | null;
  count6?: number | null;
  count7?: number | null;
  count8?: number | null;
  count9?: number | null;
  count10?: number | null;
}

const DISEASE_COLUMNS: SummaryColumnDef[] = [
  { key: 'e_blight', header: 'E Blight', kind: 'observation', matchAbbr: 'EB' },
  { key: 'l_blight', header: 'L blight', kind: 'observation', matchAbbr: 'LB' },
  { key: 'b_blight', header: 'B Blight', kind: 'observation', matchAbbr: 'BL' },
  { key: 'l_spot', header: 'L Spot', kind: 'observation', matchNamePatterns: ['leaf spot', 'l spot'] },
  { key: 'b_spot', header: 'B Spot', kind: 'observation', matchNamePatterns: ['bacterial spot', 'b spot'] },
  { key: 'sl_spot', header: 'S.L. Spot', kind: 'observation', matchNamePatterns: ['septoria', 's.l.', 'sl spot'] },
  { key: 'botrytis', header: 'Botrytis', kind: 'observation', matchAbbr: 'B', matchNamePatterns: ['botrytis'] },
];

const INSECT_COLUMNS_STANDARD: SummaryColumnDef[] = [
  { key: 'mite', header: 'Mite', kind: 'observation', matchAbbr: 'MA', matchNamePatterns: ['mite adult'] },
  { key: 'mite_l', header: 'Mite L', kind: 'observation', matchAbbr: 'ML', matchNamePatterns: ['mite larva'] },
  { key: 'mite_egg', header: 'Mite Egg', kind: 'observation', matchAbbr: 'ME', matchNamePatterns: ['mite egg'] },
  { key: 'broad_mite', header: 'Broad mite', kind: 'observation', matchNamePatterns: ['broad mite'] },
  { key: 'thrips', header: 'Thrips', kind: 'observation', matchAbbr: 'T' },
  { key: 'whitefly', header: 'Whitefly', kind: 'observation', matchAbbr: 'WA', matchNamePatterns: ['whitefly adult'] },
  { key: 'whitefly_egg', header: 'Whitefly Egg', kind: 'observation', matchAbbr: 'WE', matchNamePatterns: ['whitefly egg'] },
  { key: 'aphids', header: 'Aphids', kind: 'observation', matchAbbr: 'A' },
  { key: 'mealybug', header: 'Mealybug', kind: 'observation', matchNamePatterns: ['mealybug'] },
];

const INSECT_COLUMNS_BL: SummaryColumnDef[] = [
  ...INSECT_COLUMNS_STANDARD.filter((c) => c.key !== 'mealybug'),
  { key: 'worm', header: 'Worm', kind: 'observation', matchAbbr: 'W', matchNamePatterns: ['worm'] },
];

const DEFAULT_BIO_COLUMNS: SummaryColumnDef[] = [
  { key: 'swriski', header: 'Swriski', kind: 'bio', bioProductPattern: 'SWIRSKI' },
  { key: 'spidex', header: 'Spidex', kind: 'bio', bioProductPattern: 'SPIDEX' },
  { key: 'aphipar', header: 'Aphipar', kind: 'bio', bioProductPattern: 'APHIPAR' },
  { key: 'thripor', header: 'Thripor', kind: 'bio', bioProductPattern: 'THRIPOR' },
];

export interface BiologicalControlCatalogEntry {
  id?: string;
  name: string;
  match_pattern?: string | null;
  sort_order?: number | null;
}

function slugifyColumnKey(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'bio';
}

export function buildBioColumnsFromCatalog(
  entries: BiologicalControlCatalogEntry[],
): SummaryColumnDef[] {
  if (!entries.length) return DEFAULT_BIO_COLUMNS;

  return entries.map((entry) => ({
    key: slugifyColumnKey(entry.name),
    header: entry.name,
    kind: 'bio' as const,
    bioProductPattern: (entry.match_pattern || entry.name).toUpperCase(),
  }));
}

const META_COLUMNS: SummaryColumnDef[] = [
  { key: 'location', header: 'Location', kind: 'meta' },
  { key: 'crop', header: 'Crop', kind: 'meta' },
  { key: 'scouting_date', header: 'Scouting Date', kind: 'meta' },
];

const NOTES_COLUMN: SummaryColumnDef = { key: 'notes', header: 'Notes', kind: 'notes' };

export function getColumnProfile(fieldName: string): ColumnProfile {
  const normalized = fieldName.trim().toUpperCase();
  if (normalized.startsWith('BL-') || normalized.startsWith('BL ')) {
    return 'bl_block';
  }
  return 'standard';
}

export function getColumnsForProfile(
  profile: ColumnProfile,
  bioColumns: SummaryColumnDef[] = DEFAULT_BIO_COLUMNS,
): SummaryColumnDef[] {
  const insects = profile === 'bl_block' ? INSECT_COLUMNS_BL : INSECT_COLUMNS_STANDARD;
  const bio = profile === 'bl_block' ? [] : bioColumns;
  return [...META_COLUMNS, ...DISEASE_COLUMNS, ...insects, ...bio, NOTES_COLUMN];
}

export function extractAbbrFromPestName(pestName: string): string | null {
  const match = /\(([A-Z]+)\)/.exec(pestName || '');
  return match?.[1] ?? null;
}

function normalizeName(value: string): string {
  return (value || '').trim().toLowerCase();
}

export function observationMatchesColumn(
  obs: SummaryObservationRow,
  column: SummaryColumnDef,
): boolean {
  if (column.kind !== 'observation') return false;

  const abbr = extractAbbrFromPestName(obs.pestName);
  if (column.matchAbbr && abbr === column.matchAbbr) {
    return true;
  }

  const pestNorm = normalizeName(obs.pestName);
  if (column.matchNamePatterns?.some((pattern) => pestNorm.includes(pattern))) {
    return true;
  }

  return false;
}

export function deriveObservationTotal(obs: SummaryObservationRow): number | null {
  if (obs.total != null && Number.isFinite(Number(obs.total))) {
    return Number(obs.total);
  }

  const counts = [
    obs.count1, obs.count2, obs.count3, obs.count4, obs.count5,
    obs.count6, obs.count7, obs.count8, obs.count9, obs.count10,
  ];

  let hasCount = false;
  let sum = 0;
  for (const value of counts) {
    if (value == null || value === ('' as unknown as number)) continue;
    const n = Number(value);
    if (!Number.isFinite(n)) continue;
    hasCount = true;
    sum += n;
  }

  if (hasCount) return sum;
  return null;
}

export function aggregateObservationMetrics(
  observations: SummaryObservationRow[],
  columns: SummaryColumnDef[],
): Record<string, number | null> {
  const metrics: Record<string, number | null> = {};

  for (const column of columns) {
    if (column.kind !== 'observation') continue;
    metrics[column.key] = null;
  }

  for (const obs of observations) {
    for (const column of columns) {
      if (column.kind !== 'observation') continue;
      if (!observationMatchesColumn(obs, column)) continue;

      const total = deriveObservationTotal(obs);
      if (total == null) continue;

      const current = metrics[column.key];
      metrics[column.key] = current == null ? total : current + total;
    }
  }

  return metrics;
}

export function bioProductMatchesPattern(
  productName: string | null | undefined,
  itemCode: string | null | undefined,
  pattern: string,
): boolean {
  const haystack = `${productName || ''} ${itemCode || ''}`.toUpperCase();
  return haystack.includes(pattern.toUpperCase());
}

export function getIsoWeekAndYear(dateInput: string | Date): { week: number; year: number } {
  const date = typeof dateInput === 'string'
    ? new Date(`${dateInput.slice(0, 10)}T12:00:00`)
    : new Date(dateInput);

  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);

  const firstThursday = target.getTime();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCDate(target.getUTCDate() + ((4 - target.getUTCDay()) + 7) % 7);
  }

  const week = 1 + Math.round((firstThursday - target.getTime()) / 604800000);
  const year = new Date(firstThursday).getUTCFullYear();
  return { week, year };
}

export function formatMetricValue(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(Number(value))) return null;
  return Number(Number(value).toFixed(3));
}
