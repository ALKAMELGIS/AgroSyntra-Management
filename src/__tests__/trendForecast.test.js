import { linearRegression, generateForecast, compareToTarget } from '../utils/trendForecast';

describe('linearRegression', () => {
  it('calculates slope and intercept for a simple line', () => {
    const data = [
      { x: 1, y: 2 },
      { x: 2, y: 4 },
      { x: 3, y: 6 },
      { x: 4, y: 8 },
    ];
    const result = linearRegression(data);
    expect(result.slope).toBeCloseTo(2, 5);
    expect(result.intercept).toBeCloseTo(0, 5);
    expect(result.r2).toBeCloseTo(1, 5);
  });

  it('handles single data point', () => {
    const data = [{ x: 5, y: 10 }];
    const result = linearRegression(data);
    expect(result.slope).toBe(0);
  });

  it('handles empty data', () => {
    const result = linearRegression([]);
    expect(result.slope).toBe(0);
    expect(result.intercept).toBe(0);
    expect(result.r2).toBe(0);
  });
});

describe('generateForecast', () => {
  it('generates future predicted points', () => {
    const data = [
      { x: 1, y: 10 },
      { x: 2, y: 20 },
      { x: 3, y: 30 },
    ];
    const { forecast, regression } = generateForecast(data, 'x', 'y', 2);

    // Only the predicted points come back, carrying on from the last x.
    expect(forecast).toHaveLength(2);
    expect(forecast[0]).toMatchObject({ x: 4, isForecast: true });
    expect(forecast[0].y).toBeCloseTo(40, 0);
    expect(forecast[1].x).toBe(5);
    expect(forecast[1].y).toBeCloseTo(50, 0);
    expect(regression.slope).toBeCloseTo(10, 5);
  });
});

describe('compareToTarget', () => {
  it('returns ahead when actual exceeds target', () => {
    expect(compareToTarget(110, 100).status).toBe('ahead');
  });

  it('returns on-track when actual is within 5% of target', () => {
    expect(compareToTarget(98, 100).status).toBe('on-track');
  });

  it('returns behind when actual is well below target', () => {
    expect(compareToTarget(80, 100).status).toBe('behind');
  });
});
