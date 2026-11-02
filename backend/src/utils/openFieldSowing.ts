import { dbPool } from '../db/client';

type Queryable = { query: typeof dbPool.query };

export function isOpenFieldTypeName(name: string | null | undefined): boolean {
  if (!name) return false;
  const normalized = name.toLowerCase().replace(/\s+/g, ' ').trim();
  return normalized === 'open field' || normalized === 'farm plots';
}

export async function fieldTypeName(
  fieldId: string,
  db: Queryable = dbPool,
): Promise<string | null> {
  const res = await db.query(
    `SELECT ft.name
       FROM fields f
       LEFT JOIN field_types ft ON ft.id = f.field_type_id
      WHERE f.id = $1::uuid`,
    [fieldId],
  );
  return (res.rows[0]?.name as string | undefined) ?? null;
}

/**
 * Open field is sowing only: occupancy, crop history and harvest all start on
 * the seeding date, so transplant_date is filled to match.
 */
export async function coerceOpenFieldPlantingDates<T extends {
  fieldId?: string | null;
  seedingDate?: string;
  transplantDate?: string | null;
}>(
  data: T,
  existing: { field_id?: string | null; seeding_date?: string | Date | null } | null,
  db: Queryable = dbPool,
): Promise<T> {
  const fieldId = data.fieldId !== undefined ? data.fieldId : existing?.field_id ?? null;
  const seedingDate = data.seedingDate !== undefined
    ? data.seedingDate
    : toDateOnly(existing?.seeding_date);
  if (!fieldId || !seedingDate) return data;

  const typeName = await fieldTypeName(String(fieldId), db);
  if (!isOpenFieldTypeName(typeName)) return data;

  const day = toDateOnly(seedingDate);
  return { ...data, seedingDate: day, transplantDate: day };
}

function toDateOnly(value: string | Date | null | undefined): string {
  if (value == null || value === '') return '';
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : value;
  }
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, '0');
  const d = String(value.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
