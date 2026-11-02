import { dbPool } from '../db/client';

interface YieldPrediction {
  field_id: string;
  crop_name: string | null;
  predicted_yield: number;
  confidence_lower: number;
  confidence_upper: number;
  confidence_pct: number;
  methodology: string;
  factors: {
    historical_avg: number;
    trend_slope: number;
    seasonal_factor: number;
    data_points: number;
  };
  monthly_predictions: Array<{
    month: string;
    predicted: number;
    lower: number;
    upper: number;
  }>;
}

/**
 * Statistical yield prediction using historical harvest data.
 */
export async function predictYield(fieldId: string): Promise<YieldPrediction> {
  // 1. Get historical harvest data for this field
  const harvestResult = await dbPool.query(
    `SELECT h.date, h.total_quantity, c.name as crop_name
     FROM harvests h
     LEFT JOIN fields f ON f.id = h.field_id
     LEFT JOIN crops c ON c.id = f.current_crop_id
     WHERE h.field_id = $1
     ORDER BY h.date ASC`,
    [fieldId]
  );

  const rows = harvestResult.rows;
  const cropName = rows[0]?.crop_name || null;

  if (rows.length < 3) {
    return {
      field_id: fieldId,
      crop_name: cropName,
      predicted_yield: 0,
      confidence_lower: 0,
      confidence_upper: 0,
      confidence_pct: 0,
      methodology: 'Insufficient data (need at least 3 harvests)',
      factors: { historical_avg: 0, trend_slope: 0, seasonal_factor: 1, data_points: rows.length },
      monthly_predictions: [],
    };
  }

  const quantities = rows.map((r: any) => parseFloat(r.total_quantity) || 0);

  // 2. Calculate basic statistics
  const avg = quantities.reduce((a: number, b: number) => a + b, 0) / quantities.length;
  const variance = quantities.reduce((s: number, v: number) => s + (v - avg) ** 2, 0) / quantities.length;
  const stddev = Math.sqrt(variance);

  // 3. Linear regression for trend
  const xs = quantities.map((_: number, i: number) => i);
  const n = xs.length;
  const sumX = xs.reduce((a: number, b: number) => a + b, 0);
  const sumY = quantities.reduce((a: number, b: number) => a + b, 0);
  const sumXY = xs.reduce((s: number, x: number, i: number) => s + x * quantities[i], 0);
  const sumX2 = xs.reduce((s: number, x: number) => s + x * x, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // 4. Seasonal factor (same month pattern)
  const currentMonth = new Date().getMonth();
  const sameMonthHarvests = rows.filter((r: any) => new Date(r.date).getMonth() === currentMonth);
  const seasonalFactor = sameMonthHarvests.length > 0
    ? (sameMonthHarvests.reduce((s: number, r: any) => s + parseFloat(r.total_quantity), 0) / sameMonthHarvests.length) / avg
    : 1;

  // 5. Predict next harvest
  const trendPrediction = slope * n + intercept;
  const predicted = trendPrediction * seasonalFactor;
  const confidence = Math.min(95, 50 + n * 3); // More data = higher confidence
  const margin = stddev * 1.96 * (1 - confidence / 200);

  // 6. Monthly predictions (next 6 months)
  const monthlyPredictions = [];
  for (let i = 1; i <= 6; i++) {
    const monthDate = new Date();
    monthDate.setMonth(monthDate.getMonth() + i);
    const monthStr = monthDate.toISOString().substring(0, 7); // YYYY-MM
    const futureIdx = n + i;
    const monthPredicted = (slope * futureIdx + intercept) * seasonalFactor;
    monthlyPredictions.push({
      month: monthStr,
      predicted: Math.max(0, monthPredicted),
      lower: Math.max(0, monthPredicted - margin),
      upper: monthPredicted + margin,
    });
  }

  return {
    field_id: fieldId,
    crop_name: cropName,
    predicted_yield: Math.max(0, predicted),
    confidence_lower: Math.max(0, predicted - margin),
    confidence_upper: predicted + margin,
    confidence_pct: confidence,
    methodology: `Linear regression with seasonal adjustment (${n} data points)`,
    factors: {
      historical_avg: avg,
      trend_slope: slope,
      seasonal_factor: seasonalFactor,
      data_points: n,
    },
    monthly_predictions: monthlyPredictions,
  };
}
