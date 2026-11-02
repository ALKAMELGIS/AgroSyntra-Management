import { dbPool } from '../db/client';

export interface Shift {
  id: string;
  user_id: string;
  field_id: string;
  shift_type: string;
  start_time: string;
  end_time: string;
  date: string;
  notes: string;
  created_by: string;
  user_name?: string;
  user_email?: string;
  field_name?: string;
}

export async function listShifts(filters: {
  user_id?: string;
  field_id?: string;
  start_date?: string;
  end_date?: string;
  limit?: number;
  offset?: number;
}): Promise<Shift[]> {
  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (filters.user_id) { conditions.push(`s.user_id = $${idx++}`); params.push(filters.user_id); }
  if (filters.field_id) { conditions.push(`s.field_id = $${idx++}`); params.push(filters.field_id); }
  if (filters.start_date) { conditions.push(`s.date >= $${idx++}`); params.push(filters.start_date); }
  if (filters.end_date) { conditions.push(`s.date <= $${idx++}`); params.push(filters.end_date); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(filters.limit || 500, 1000);
  const offset = filters.offset || 0;

  params.push(limit);
  const limitParam = idx++;
  params.push(offset);
  const offsetParam = idx++;

  const result = await dbPool.query(
    `SELECT s.*, u.name as user_name, u.email as user_email, f.name as field_name
     FROM shifts s
     LEFT JOIN users u ON u.id = s.user_id
     LEFT JOIN fields f ON f.id = s.field_id
     ${where}
     ORDER BY s.date, s.start_time
     LIMIT $${limitParam} OFFSET $${offsetParam}`,
    params
  );
  return result.rows;
}

export async function createShift(data: Partial<Shift>): Promise<Shift> {
  const result = await dbPool.query(
    `INSERT INTO shifts (user_id, field_id, shift_type, start_time, end_time, date, notes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [data.user_id, data.field_id, data.shift_type, data.start_time, data.end_time, data.date, data.notes, data.created_by]
  );
  return result.rows[0];
}

export async function updateShift(id: string, data: Partial<Shift>): Promise<Shift> {
  const fields: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (data.user_id) { fields.push(`user_id = $${idx++}`); params.push(data.user_id); }
  if (data.field_id) { fields.push(`field_id = $${idx++}`); params.push(data.field_id); }
  if (data.shift_type) { fields.push(`shift_type = $${idx++}`); params.push(data.shift_type); }
  if (data.start_time) { fields.push(`start_time = $${idx++}`); params.push(data.start_time); }
  if (data.end_time) { fields.push(`end_time = $${idx++}`); params.push(data.end_time); }
  if (data.date) { fields.push(`date = $${idx++}`); params.push(data.date); }
  if (data.notes !== undefined) { fields.push(`notes = $${idx++}`); params.push(data.notes); }
  fields.push(`updated_at = NOW()`);

  params.push(id);
  const result = await dbPool.query(
    `UPDATE shifts SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    params
  );
  return result.rows[0];
}

export async function deleteShift(id: string): Promise<void> {
  await dbPool.query('DELETE FROM shifts WHERE id = $1', [id]);
}
