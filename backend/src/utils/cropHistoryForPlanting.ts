import { autoClosePrevious, syncFieldCrop, type CropSyncDb } from './fieldCropSync';
import { seasonIdForWritableField } from '../services/seasons.service';

/**
 * One History row per field + crop + start date. Bulk Excel used to insert
 * one row per variety; ON CONFLICT keeps the named variety and Current.
 */
export const CROP_HISTORY_UPSERT_SQL = `INSERT INTO crop_history (field_id, crop_id, variety_id, start_date, end_date, season_id)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (field_id, crop_id, start_date) DO UPDATE SET
  variety_id = COALESCE(crop_history.variety_id, EXCLUDED.variety_id),
  season_id = COALESCE(crop_history.season_id, EXCLUDED.season_id),
  end_date = CASE
    WHEN crop_history.end_date IS NULL OR EXCLUDED.end_date IS NULL THEN NULL
    ELSE GREATEST(crop_history.end_date, EXCLUDED.end_date)
  END
RETURNING *`;

/**
 * Open crop_history is field-level. Many planting rows (bays) share one rotation.
 * Reuse an open field+crop+season row instead of inserting another Current.
 */
export async function createCropHistoryForPlanting(
  fieldId: string,
  cropId: string,
  varietyId: string | null,
  startDate: string,
  client: CropSyncDb,
): Promise<string | null> {
  const seasonId = await seasonIdForWritableField(fieldId, startDate, client);
  const existing = await client.query(
    `SELECT id FROM crop_history
      WHERE field_id = $1::uuid
        AND crop_id = $2::uuid
        AND end_date IS NULL
        AND season_id IS NOT DISTINCT FROM $3::uuid
      ORDER BY start_date DESC
      LIMIT 1`,
    [fieldId, cropId, seasonId],
  );
  if (existing.rows[0]?.id) {
    const id = String(existing.rows[0].id);
    await client.query(
      `UPDATE crop_history SET variety_id = COALESCE(variety_id, $2::uuid)
        WHERE id = $1::uuid`,
      [id, varietyId],
    );
    await client.query(
      `UPDATE crop_history SET start_date = LEAST(start_date, $2::date)
        WHERE id = $1::uuid
          AND NOT EXISTS (
            SELECT 1 FROM crop_history other
             WHERE other.field_id = crop_history.field_id
               AND other.crop_id = crop_history.crop_id
               AND other.start_date = LEAST(crop_history.start_date, $2::date)
               AND other.id <> $1::uuid
          )`,
      [id, startDate],
    );
    await syncFieldCrop(fieldId, client);
    return id;
  }

  await autoClosePrevious(fieldId, startDate, undefined, client);
  const inserted = await client.query(
    CROP_HISTORY_UPSERT_SQL,
    [fieldId, cropId, varietyId, startDate, null, seasonId],
  );
  if (inserted.rows.length === 0) return null;
  await syncFieldCrop(fieldId, client);
  return String(inserted.rows[0].id);
}

export function rotationStartDate(
  transplantDate?: string | null,
  seedingDate?: string | null,
): string | null {
  return transplantDate || seedingDate || null;
}
