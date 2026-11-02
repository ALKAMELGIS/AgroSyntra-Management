export const GPS_POSITION_LIMIT = 2000;
export const EQUIPMENT_TYPES = ['tractor', 'sprayer', 'harvester', 'drone', 'vehicle', 'other'] as const;
export type EquipmentType = (typeof EQUIPMENT_TYPES)[number];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Asia/Dubai is UTC+4 year-round (no DST). */
const DUBAI_UTC_OFFSET_HOURS = 4;

export function isEquipmentType(value: unknown): value is EquipmentType {
  return typeof value === 'string' && (EQUIPMENT_TYPES as readonly string[]).includes(value);
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function parseIsoDate(value: unknown): string | null {
  if (value == null || value === '') return null;
  const ymd = String(value).slice(0, 10);
  return ISO_DATE.test(ymd) ? ymd : null;
}

export function dubaiTodayYmd(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dubai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const lookup = (type: Intl.DateTimeFormatPartTypes) => (
    parts.find((part) => part.type === type)?.value || ''
  );
  return `${lookup('year')}-${lookup('month')}-${lookup('day')}`;
}

export function dubaiDayBounds(ymd: string): { start: Date; endExclusive: Date } {
  const [year, month, day] = ymd.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, day, -DUBAI_UTC_OFFSET_HOURS, 0, 0, 0));
  const endExclusive = new Date(Date.UTC(year, month - 1, day + 1, -DUBAI_UTC_OFFSET_HOURS, 0, 0, 0));
  return { start, endExclusive };
}

export function dubaiRangeBounds(fromYmd: string, toYmd: string): { start: Date; endExclusive: Date } {
  const start = dubaiDayBounds(fromYmd).start;
  const endExclusive = dubaiDayBounds(toYmd).endExclusive;
  return { start, endExclusive };
}

export function parseLatLng(latitude: unknown, longitude: unknown): { latitude: number; longitude: number } | null {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { latitude: lat, longitude: lng };
}

export function parseOptionalNumber(value: unknown, min: number, max: number): number | undefined {
  if (value == null || value === '') return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new RangeError(`Expected a number between ${min} and ${max}`);
  }
  return n;
}

export function parseOptionalRecordedAt(value: unknown): Date | undefined {
  if (value == null || value === '') return undefined;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) {
    throw new RangeError('recorded_at must be a valid date');
  }
  return d;
}

export function resolveEquipmentLookup(body: {
  equipment_id?: unknown;
  equipmentId?: unknown;
  identifier?: unknown;
}): { id?: string; identifier?: string } {
  const rawId = body.equipment_id ?? body.equipmentId;
  const rawIdent = typeof body.identifier === 'string' ? body.identifier.trim() : '';
  if (isUuid(rawId)) return { id: rawId };
  if (rawIdent) return { identifier: rawIdent };
  if (rawId != null && String(rawId).trim()) return { identifier: String(rawId).trim() };
  return {};
}
