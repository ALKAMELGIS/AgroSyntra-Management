"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncFieldCrop = syncFieldCrop;
exports.autoClosePrevious = autoClosePrevious;
exports.closeCropHistoryForUproot = closeCropHistoryForUproot;
const client_1 = require("../db/client");
/**
 * Point a field at its latest open rotation, or clear it when none is left.
 *
 * The single UPDATE covers both cases deliberately: a field whose last rotation
 * has closed is bare ground, and saying so is the whole point.
 */
async function syncFieldCrop(fieldId, client) {
    const db = client || client_1.dbPool;
    const latest = await db.query(`SELECT crop_id, variety_id FROM crop_history
     WHERE field_id = $1 AND end_date IS NULL
     ORDER BY start_date DESC LIMIT 1`, [fieldId]);
    const row = latest.rows[0];
    await db.query(`UPDATE fields SET current_crop_id = $1, variety_id = $2, updated_at = NOW() WHERE id = $3`, [row?.crop_id ?? null, row?.variety_id ?? null, fieldId]);
}
/** Close any rotation still open on a field before a new one starts. */
async function autoClosePrevious(fieldId, newStartDate, excludeId, client) {
    const db = client || client_1.dbPool;
    let query = `UPDATE crop_history SET end_date = ($1::date - interval '1 day')::date
     WHERE field_id = $2 AND end_date IS NULL AND start_date < $1::date`;
    const params = [newStartDate, fieldId];
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
async function closeCropHistoryForUproot(fieldId, uprootDate, client) {
    const db = client || client_1.dbPool;
    await db.query(`UPDATE crop_history SET end_date = $1::date
      WHERE field_id = $2 AND end_date IS NULL AND start_date <= $1::date`, [uprootDate, fieldId]);
    await syncFieldCrop(fieldId, client);
}
