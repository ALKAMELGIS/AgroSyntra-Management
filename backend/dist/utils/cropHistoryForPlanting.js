"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCropHistoryForPlanting = createCropHistoryForPlanting;
exports.rotationStartDate = rotationStartDate;
const fieldCropSync_1 = require("./fieldCropSync");
const seasons_service_1 = require("../services/seasons.service");
/**
 * Open crop_history is field-level. Many planting rows (bays) share one rotation.
 * Reuse an open field+crop+season row instead of inserting another Current.
 */
async function createCropHistoryForPlanting(fieldId, cropId, varietyId, startDate, client) {
    const seasonId = await (0, seasons_service_1.seasonIdForWritableField)(fieldId, startDate, client);
    const existing = await client.query(`SELECT id FROM crop_history
      WHERE field_id = $1::uuid
        AND crop_id = $2::uuid
        AND end_date IS NULL
        AND season_id IS NOT DISTINCT FROM $3::uuid
      ORDER BY start_date DESC
      LIMIT 1`, [fieldId, cropId, seasonId]);
    if (existing.rows[0]?.id) {
        const id = String(existing.rows[0].id);
        await client.query(`UPDATE crop_history SET start_date = LEAST(start_date, $2::date)
        WHERE id = $1::uuid`, [id, startDate]);
        await (0, fieldCropSync_1.syncFieldCrop)(fieldId, client);
        return id;
    }
    await (0, fieldCropSync_1.autoClosePrevious)(fieldId, startDate, undefined, client);
    const inserted = await client.query(`INSERT INTO crop_history (field_id, crop_id, variety_id, start_date, season_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`, [fieldId, cropId, varietyId, startDate, seasonId]);
    if (inserted.rows.length === 0)
        return null;
    await (0, fieldCropSync_1.syncFieldCrop)(fieldId, client);
    return String(inserted.rows[0].id);
}
function rotationStartDate(transplantDate, seedingDate) {
    return transplantDate || seedingDate || null;
}
