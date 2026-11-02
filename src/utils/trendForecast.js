/**
 * Simple linear regression for trend forecasting.
 *
 * Usage:
 *   const { slope, intercept, predict, trend } = linearRegression(data, 'x', 'y');
 *   const forecasted = predict(nextX);
 */
export function linearRegression(data, xKey = 'x', yKey = 'y') {
  const n = data.length;
  if (n < 2) return { slope: 0, intercept: 0, predict: () => 0, trend: 'stable', r2: 0 };

  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, sumYY = 0;

  data.forEach((d, i) => {
    const x = typeof d[xKey] === 'number' ? d[xKey] : i;
    const y = typeof d[yKey] === 'number' ? d[yKey] : parseFloat(d[yKey]) || 0;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
    sumYY += y * y;
  });

  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n, predict: () => sumY / n, trend: 'stable', r2: 0 };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  // R-squared
  const ssRes = data.reduce((sum, d, i) => {
    const x = typeof d[xKey] === 'number' ? d[xKey] : i;
    const y = typeof d[yKey] === 'number' ? d[yKey] : parseFloat(d[yKey]) || 0;
    const predicted = slope * x + intercept;
    return sum + (y - predicted) ** 2;
  }, 0);
  const mean = sumY / n;
  const ssTot = data.reduce((sum, d) => {
    const y = typeof d[yKey] === 'number' ? d[yKey] : parseFloat(d[yKey]) || 0;
    return sum + (y - mean) ** 2;
  }, 0);
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  const predict = (x) => slope * x + intercept;

  // Trend classification
  const percentChange = mean !== 0 ? (slope / mean) * 100 : 0;
  let trend = 'stable';
  if (percentChange > 5) trend = 'up';
  else if (percentChange < -5) trend = 'down';

  return { slope, intercept, predict, trend, r2, percentChange };
}

/**
 * Generate forecast data points.
 * Returns the N points that follow the data, along with the regression they
 * came from. The original data is not included in the result.
 */
export function generateForecast(data, xKey, yKey, futurePoints = 4) {
  const regression = linearRegression(data, xKey, yKey);
  const lastX = data.length > 0 ? (typeof data[data.length - 1][xKey] === 'number' ? data[data.length - 1][xKey] : data.length - 1) : 0;

  const forecast = [];
  for (let i = 1; i <= futurePoints; i++) {
    const x = lastX + i;
    forecast.push({
      [xKey]: x,
      [yKey]: Math.max(0, regression.predict(x)),
      isForecast: true,
    });
  }

  return { forecast, regression };
}

/**
 * Compare a value against a target and return status.
 */
export function compareToTarget(actual, target) {
  if (!target || target === 0) return { status: 'no-target', ratio: 0 };
  const ratio = actual / target;
  if (ratio >= 1.0) return { status: 'ahead', ratio, label: 'Ahead' };
  if (ratio >= 0.85) return { status: 'on-track', ratio, label: 'On Track' };
  return { status: 'behind', ratio, label: 'Behind' };
}
