"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ValveRepository = void 0;
const client_1 = require("../db/client");
function mapValve(row) {
    return {
        id: row.id,
        fieldId: row.field_id,
        number: row.number,
        name: row.name ?? undefined,
        createdAt: row.created_at,
    };
}
class ValveRepository {
    async listByField(fieldId) {
        const result = await client_1.dbPool.query(`SELECT * FROM valves WHERE field_id = $1 ORDER BY number ASC`, [fieldId]);
        return result.rows.map(mapValve);
    }
    async replaceForField(fieldId, valves) {
        const client = await client_1.dbPool.connect();
        try {
            await client.query('BEGIN');
            await client.query('DELETE FROM valves WHERE field_id = $1', [fieldId]);
            for (const valve of valves) {
                await client.query(`INSERT INTO valves (field_id, number, name)
           VALUES ($1, $2, $3)`, [fieldId, valve.number, valve.name ?? null]);
            }
            await client.query(`UPDATE fields SET valve_count = $1 WHERE id = $2`, [valves.length, fieldId]);
            await client.query('COMMIT');
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
}
exports.ValveRepository = ValveRepository;
