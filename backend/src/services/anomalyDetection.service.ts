import { dbPool } from '../db/client';

interface AnomalyResult {
  field_id: string;
  metric: string;
  value: number;
  mean: number;
  stddev: number;
  zScore: number;
  isAnomaly: boolean;
}

/**
 * Detect statistical anomalies in EC/pH readings for a given field.
 * An anomaly is a reading >2 standard deviations from the field's 30-day rolling mean.
 */
export async function detectAnomalies(
  fieldId: string,
  metrics: Record<string, number>
): Promise<AnomalyResult[]> {
  const results: AnomalyResult[] = [];

  // Get 30-day rolling stats for this field from ecph_valve_readings
  const statsResult = await dbPool.query(
    `SELECT
       AVG(ec) as mean_ec, STDDEV_POP(ec) as std_ec,
       AVG(ph) as mean_ph, STDDEV_POP(ph) as std_ph,
       AVG(percent_drain) as mean_drain, STDDEV_POP(percent_drain) as std_drain
     FROM ecph_valve_readings vr
     JOIN ecph_entries e ON e.id = vr.ecph_entry_id
     WHERE e.field_id = $1
       AND e.date >= CURRENT_DATE - INTERVAL '30 days'`,
    [fieldId]
  );

  if (statsResult.rows.length === 0) return results;
  const stats = statsResult.rows[0];

  const checks: Array<{ metric: string; value: number | undefined; mean: number; std: number }> = [
    { metric: 'ec', value: metrics.ec, mean: parseFloat(stats.mean_ec), std: parseFloat(stats.std_ec) },
    { metric: 'ph', value: metrics.ph, mean: parseFloat(stats.mean_ph), std: parseFloat(stats.std_ph) },
    { metric: 'percent_drain', value: metrics.percent_drain, mean: parseFloat(stats.mean_drain), std: parseFloat(stats.std_drain) },
  ];

  for (const check of checks) {
    if (check.value === undefined || check.value === null) continue;
    if (!check.std || isNaN(check.std) || check.std === 0) continue;
    if (isNaN(check.mean)) continue;

    const zScore = Math.abs((check.value - check.mean) / check.std);
    const isAnomaly = zScore > 2;

    results.push({
      field_id: fieldId,
      metric: check.metric,
      value: check.value,
      mean: check.mean,
      stddev: check.std,
      zScore,
      isAnomaly,
    });
  }

  return results;
}

/**
 * Run anomaly detection after an EC/pH entry and create alerts for anomalies.
 */
export async function checkForAnomalies(
  fieldId: string,
  entityId: string,
  metrics: Record<string, number>
): Promise<void> {
  try {
    const anomalies = await detectAnomalies(fieldId, metrics);
    const triggered = anomalies.filter((a) => a.isAnomaly);

    for (const anomaly of triggered) {
      // Create an alert event for the anomaly
      await dbPool.query(
        `INSERT INTO alert_events (entity_type, entity_id, field_id, severity, title, message, value)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          'ecph_reading',
          entityId,
          fieldId,
          'warning',
          `Anomaly Detected: ${anomaly.metric.toUpperCase()}`,
          `${anomaly.metric.toUpperCase()} reading of ${anomaly.value.toFixed(2)} is ${anomaly.zScore.toFixed(1)} standard deviations from the 30-day average of ${anomaly.mean.toFixed(2)} (±${anomaly.stddev.toFixed(2)})`,
          anomaly.value,
        ]
      );
    }
  } catch (error) {
    console.error('Anomaly detection error:', error);
  }
}
