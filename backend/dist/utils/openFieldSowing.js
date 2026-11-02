"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isOpenFieldTypeName = isOpenFieldTypeName;
exports.fieldTypeName = fieldTypeName;
exports.coerceOpenFieldPlantingDates = coerceOpenFieldPlantingDates;
const client_1 = require("../db/client");
function isOpenFieldTypeName(name) {
    if (!name)
        return false;
    const normalized = name.toLowerCase().replace(/\s+/g, ' ').trim();
    return normalized === 'open field' || normalized === 'farm plots';
}
async function fieldTypeName(fieldId, db = client_1.dbPool) {
    const res = await db.query(`SELECT ft.name
       FROM fields f
       LEFT JOIN field_types ft ON ft.id = f.field_type_id
      WHERE f.id = $1::uuid`, [fieldId]);
    return res.rows[0]?.name ?? null;
}
/**
 * Open field is sowing only: occupancy, crop history and harvest all start on
 * the seeding date, so transplant_date is filled to match.
 */
async function coerceOpenFieldPlantingDates(data, existing, db = client_1.dbPool) {
    const fieldId = data.fieldId !== undefined ? data.fieldId : existing?.field_id ?? null;
    const seedingDate = data.seedingDate !== undefined
        ? data.seedingDate
        : toDateOnly(existing?.seeding_date);
    if (!fieldId || !seedingDate)
        return data;
    const typeName = await fieldTypeName(String(fieldId), db);
    if (!isOpenFieldTypeName(typeName))
        return data;
    const day = toDateOnly(seedingDate);
    return { ...data, seedingDate: day, transplantDate: day };
}
function toDateOnly(value) {
    if (value == null || value === '')
        return '';
    if (typeof value === 'string') {
        const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
        return match ? match[1] : value;
    }
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}
