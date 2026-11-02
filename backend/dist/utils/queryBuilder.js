"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSetClause = buildSetClause;
exports.buildUpdateQuery = buildUpdateQuery;
const errors_1 = require("./errors");
/**
 * Dynamically builds an UPDATE query's SET clause from a partial payload.
 *
 * @param fieldMap - Maps payload property names to database column names.
 *                   e.g. { name: 'name', dripperCount: 'dripper_count' }
 * @param payload  - The partial update payload (only defined keys are included).
 * @param startIndex - Parameter index offset (default 1).
 * @returns { updates: string[], values: any[] }
 *
 * @example
 * const { updates, values } = buildSetClause(
 *   { name: 'name', dripperCount: 'dripper_count' },
 *   { name: 'Tomato', dripperCount: 5000 }
 * );
 * // updates = ['name = $1', 'dripper_count = $2']
 * // values  = ['Tomato', 5000]
 */
function buildSetClause(fieldMap, payload, startIndex = 1) {
    const updates = [];
    const values = [];
    for (const [payloadKey, dbColumn] of Object.entries(fieldMap)) {
        if (payload[payloadKey] !== undefined) {
            values.push(payload[payloadKey]);
            updates.push(`${dbColumn} = $${startIndex + values.length - 1}`);
        }
    }
    return { updates, values };
}
/**
 * Builds a full UPDATE ... SET ... WHERE id = $N RETURNING * query.
 *
 * @param table    - Table name
 * @param fieldMap - Maps payload property names to DB column names
 * @param payload  - Partial update payload
 * @param id       - Row ID
 * @param options  - { softDelete: boolean (adds AND deleted_at IS NULL), autoTimestamp: string (column to set to NOW()) }
 * @returns { sql: string, values: any[] }
 */
function buildUpdateQuery(table, fieldMap, payload, id, options = {}) {
    const { softDelete = false, autoTimestamp = 'updated_at' } = options;
    const { updates, values } = buildSetClause(fieldMap, payload);
    if (updates.length === 0) {
        throw new errors_1.AppError('No fields to update', 'VALIDATION_ERROR', 400);
    }
    const timestampClause = autoTimestamp ? `, ${autoTimestamp} = NOW()` : '';
    const softDeleteClause = softDelete ? ' AND deleted_at IS NULL' : '';
    values.push(id);
    const sql = `UPDATE ${table}
    SET ${updates.join(', ')}${timestampClause}
    WHERE id = $${values.length}${softDeleteClause}
    RETURNING *`;
    return { sql, values };
}
