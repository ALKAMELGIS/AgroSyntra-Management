import { dbPool } from '../db/client';
import { logger } from '../utils/logger';
import { evaluateAlerts } from './alertEngine.service';

export interface AgronomicThreshold {
  id: string;
  cropId: string;
  cropName?: string;
  parameter: string;
  warningMin: number | null;
  warningMax: number | null;
  criticalMin: number | null;
  criticalMax: number | null;
  enabled: boolean;
}

const VALID_PARAMETERS = [
  'temperature', 'humidity', 'ec', 'ec_in', 'ec_out', 'ph', 'ph_in', 'ph_out',
  'soil_moisture', 'wind_speed', 'solar_radiation',
];

export async function listThresholds(cropId?: string): Promise<AgronomicThreshold[]> {
  const params: any[] = [];
  let where = '';
  if (cropId) {
    params.push(cropId);
    where = 'WHERE at.crop_id = $1';
  }
  const result = await dbPool.query(
    `SELECT at.id, at.crop_id, c.name AS crop_name, at.parameter,
            at.warning_min, at.warning_max, at.critical_min, at.critical_max, at.enabled
     FROM agronomic_thresholds at
     JOIN crops c ON c.id = at.crop_id
     ${where}
     ORDER BY c.name, at.parameter`,
    params,
  );
  return result.rows.map(mapRow);
}

export async function upsertThreshold(
  cropId: string, parameter: string,
  warningMin: number | null, warningMax: number | null,
  criticalMin: number | null, criticalMax: number | null,
  enabled: boolean,
): Promise<AgronomicThreshold> {
  if (!VALID_PARAMETERS.includes(parameter)) {
    throw new Error(`Invalid parameter: ${parameter}. Must be one of: ${VALID_PARAMETERS.join(', ')}`);
  }
  const result = await dbPool.query(
    `INSERT INTO agronomic_thresholds (crop_id, parameter, warning_min, warning_max, critical_min, critical_max, enabled)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (crop_id, parameter)
     DO UPDATE SET warning_min = $3, warning_max = $4, critical_min = $5, critical_max = $6, enabled = $7, updated_at = NOW()
     RETURNING *`,
    [cropId, parameter, warningMin, warningMax, criticalMin, criticalMax, enabled],
  );
  return mapRow(result.rows[0]);
}

export async function deleteThreshold(id: string): Promise<void> {
  await dbPool.query('DELETE FROM agronomic_thresholds WHERE id = $1', [id]);
}

export async function checkThresholdsForField(
  fieldId: string,
  readings: Record<string, number>,
): Promise<void> {
  const fieldResult = await dbPool.query(
    'SELECT current_crop_id FROM fields WHERE id = $1 AND deleted_at IS NULL',
    [fieldId],
  );
  const cropId = fieldResult.rows[0]?.current_crop_id;
  if (!cropId) return;

  const thresholds = await dbPool.query(
    'SELECT * FROM agronomic_thresholds WHERE crop_id = $1 AND enabled = true',
    [cropId],
  );

  for (const t of thresholds.rows) {
    const value = readings[t.parameter];
    if (value == null) continue;

    let severity = '';
    let direction = '';

    // Check critical first
    if (t.critical_min != null && value < Number(t.critical_min)) {
      severity = 'critical';
      direction = `below critical minimum (${t.critical_min})`;
    } else if (t.critical_max != null && value > Number(t.critical_max)) {
      severity = 'critical';
      direction = `above critical maximum (${t.critical_max})`;
    } else if (t.warning_min != null && value < Number(t.warning_min)) {
      severity = 'warning';
      direction = `below warning minimum (${t.warning_min})`;
    } else if (t.warning_max != null && value > Number(t.warning_max)) {
      severity = 'warning';
      direction = `above warning maximum (${t.warning_max})`;
    }

    if (severity) {
      try {
        await evaluateAlerts('agronomic', fieldId, fieldId, { [t.parameter]: value });
      } catch {
        await dbPool.query(
          `INSERT INTO alert_events (entity_type, entity_id, field_id, severity, title, message, value)
           VALUES ('agronomic', $1, $1, $2, $3, $4, $5)`,
          [
            fieldId,
            severity,
            `${t.parameter} alert`,
            `${t.parameter} = ${value} is ${direction} for this crop`,
            value,
          ],
        );
      }
      logger.warn({ fieldId, parameter: t.parameter, value, threshold: t, severity }, 'Agronomic threshold exceeded');
    }
  }
}

export function getValidParameters(): string[] {
  return [...VALID_PARAMETERS];
}

function mapRow(r: any): AgronomicThreshold {
  return {
    id: r.id,
    cropId: r.crop_id,
    cropName: r.crop_name,
    parameter: r.parameter,
    warningMin: r.warning_min != null ? Number(r.warning_min) : null,
    warningMax: r.warning_max != null ? Number(r.warning_max) : null,
    criticalMin: r.critical_min != null ? Number(r.critical_min) : null,
    criticalMax: r.critical_max != null ? Number(r.critical_max) : null,
    enabled: r.enabled,
  };
}
