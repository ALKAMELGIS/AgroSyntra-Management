import { dbPool } from '../db/client';
import type { Valve } from '../models/valve.model';

function mapValve(row: any): Valve {
  return {
    id: row.id,
    fieldId: row.field_id,
    number: row.number,
    name: row.name ?? undefined,
    createdAt: row.created_at,
  };
}

export class ValveRepository {
  async listByField(fieldId: string): Promise<Valve[]> {
    const result = await dbPool.query(
      `SELECT * FROM valves WHERE field_id = $1 ORDER BY number ASC`,
      [fieldId]
    );
    return result.rows.map(mapValve);
  }

  async replaceForField(fieldId: string, valves: Array<{ number: number; name?: string }>) {
    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM valves WHERE field_id = $1', [fieldId]);
      for (const valve of valves) {
        await client.query(
          `INSERT INTO valves (field_id, number, name)
           VALUES ($1, $2, $3)`,
          [fieldId, valve.number, valve.name ?? null]
        );
      }
      await client.query(
        `UPDATE fields SET valve_count = $1 WHERE id = $2`,
        [valves.length, fieldId]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
