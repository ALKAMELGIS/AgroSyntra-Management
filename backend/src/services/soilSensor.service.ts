import { dbPool } from '../db/client';

export async function list(params: {
  fieldId?: string;
  siteId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}) {
  const conditions: string[] = [];
  const vals: any[] = [];
  let idx = 1;

  if (params.fieldId) {
    conditions.push(`ssr.field_id = $${idx}`); vals.push(params.fieldId); idx++;
  }
  if (params.siteId) {
    conditions.push(`fa.site_id = $${idx}`); vals.push(params.siteId); idx++;
  }
  if (params.startDate) {
    conditions.push(`ssr.date >= $${idx}`); vals.push(params.startDate); idx++;
  }
  if (params.endDate) {
    conditions.push(`ssr.date <= $${idx}`); vals.push(params.endDate); idx++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(params.limit || 50, 200);
  const page = Math.max(params.page || 1, 1);
  const offset = (page - 1) * limit;

  const countResult = await dbPool.query(
    `SELECT COUNT(*) FROM soil_sensor_readings ssr
     JOIN fields f ON f.id = ssr.field_id
     LEFT JOIN farm_areas fa ON fa.id = f.farm_area_id
     ${where}`,
    vals,
  );
  const total = parseInt(countResult.rows[0].count, 10);

  vals.push(limit); vals.push(offset);
  const result = await dbPool.query(
    `SELECT ssr.*, f.name AS field_name, fa.name AS farm_area_name
     FROM soil_sensor_readings ssr
     JOIN fields f ON f.id = ssr.field_id
     LEFT JOIN farm_areas fa ON fa.id = f.farm_area_id
     ${where}
     ORDER BY ssr.date DESC, f.name
     LIMIT $${idx} OFFSET $${idx + 1}`,
    vals,
  );

  return {
    items: result.rows,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
}

export async function create(payload: {
  fieldId: string;
  date: string;
  moisturePct?: number | null;
  temperatureC?: number | null;
  ecDsm?: number | null;
  ph?: number | null;
  depthCm?: number | null;
  source?: string;
  notes?: string;
}) {
  const result = await dbPool.query(
    `INSERT INTO soil_sensor_readings
       (field_id, date, moisture_pct, temperature_c, ec_dsm, ph, depth_cm, source, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      payload.fieldId, payload.date,
      payload.moisturePct ?? null, payload.temperatureC ?? null,
      payload.ecDsm ?? null, payload.ph ?? null, payload.depthCm ?? null,
      payload.source || 'manual', payload.notes || null,
    ],
  );
  return result.rows[0];
}

export async function getLatestByField(fieldId: string) {
  const result = await dbPool.query(
    `SELECT * FROM soil_sensor_readings WHERE field_id = $1 ORDER BY date DESC, created_at DESC LIMIT 1`,
    [fieldId],
  );
  return result.rows[0] || null;
}

export async function getLatestBySite(siteId: string, date?: string) {
  const targetDate = date || new Date().toISOString().split('T')[0];

  // Get the most recent reading per field for fields in this site
  const result = await dbPool.query(
    `SELECT DISTINCT ON (ssr.field_id)
       ssr.*, f.name AS field_name, fa.name AS farm_area_name
     FROM soil_sensor_readings ssr
     JOIN fields f ON f.id = ssr.field_id
     JOIN farm_areas fa ON fa.id = f.farm_area_id
     WHERE fa.site_id = $1
       AND ssr.date <= $2
     ORDER BY ssr.field_id, ssr.date DESC, ssr.created_at DESC`,
    [siteId, targetDate],
  );

  return result.rows;
}
