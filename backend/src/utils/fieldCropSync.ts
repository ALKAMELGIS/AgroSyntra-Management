/**
 * Keeping fields.current_crop_id in step with crop_history.
 *
 * This logic used to be copy-pasted into four route modules (crop history,
 * planting records, open field planting, and the plantation workbook), all of
 * which shared the same bug: when a field had no open rotation left, they left
 * current_crop_id pointing at the crop that had just been cleared. Uproot makes
 * that visible, because uprooting the last segment of a field is exactly the
 * case where there is nothing open to sync from.
 */

import { dbPool } from '../db/client';

/** A pool or a checked-out client, so callers can run inside a transaction. */
export type CropSyncDb = { query: typeof dbPool.query };

/**
 * Point a field at its latest open rotation, or clear it when none is left.
 *
 * The single UPDATE covers both cases deliberately: a field whose last rotation
 * has closed is bare ground, and saying so is the whole point.
 */
export async function syncFieldCrop(fieldId: string, client?: CropSyncDb): Promise<void> {
  const db = client || dbPool;
  const latest = await db.query(
    `SELECT crop_id, variety_id FROM crop_history
     WHERE field_id = $1 AND end_date IS NULL
     ORDER BY start_date DESC LIMIT 1`,
    [fieldId],
  );
  const row = latest.rows[0];
  await db.query(
    `UPDATE fields SET current_crop_id = $1, variety_id = $2, updated_at = NOW() WHERE id = $3`,
    [row?.crop_id ?? null, row?.variety_id ?? null, fieldId],
  );
}

/** Close any rotation still open on a field before a new one starts. */
export async function autoClosePrevious(
  fieldId: string,
  newStartDate: string,
  excludeId?: string,
  client?: CropSyncDb,
): Promise<void> {
  const db = client || dbPool;
  let query = `UPDATE crop_history SET end_date = ($1::date - interval '1 day')::date
     WHERE field_id = $2 AND end_date IS NULL AND start_date < $1::date`;
  const params: unknown[] = [newStartDate, fieldId];
  if (excludeId) {
    query += ` AND id != $3`;
    params.push(excludeId);
  }
  await db.query(query, params);
}

/**
 * Close the rotation covering an uproot and re-sync the field.
 *
 * `end_date` is the uproot date itself rather than the day before, because the
 * crop did occupy the land up to and including the day it was pulled.
 */
export async function closeCropHistoryForUproot(
  fieldId: string,
  uprootDate: string,
  client?: CropSyncDb,
): Promise<void> {
  const db = client || dbPool;
  await db.query(
    `UPDATE crop_history SET end_date = $1::date
      WHERE field_id = $2 AND end_date IS NULL AND start_date <= $1::date`,
    [uprootDate, fieldId],
  );
  await syncFieldCrop(fieldId, client);
}
