jest.mock('../../db/client', () => ({
  dbPool: { query: jest.fn() },
}));

import { dbPool } from '../../db/client';
import { getIrrigationAdvice } from '../irrigationAdvisor.service';

const mockQuery = dbPool.query as jest.Mock;

describe('IrrigationAdvisor Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const setupMocks = (
    field: any = { crop_name: 'Tomato' },
    weather: any = { avg_max_temp: '35', avg_humidity: '40', total_rainfall: '0' },
    fertigation: any = { avg_water: '100' }
  ) => {
    mockQuery
      .mockResolvedValueOnce({ rows: [field] }) // field query
      .mockResolvedValueOnce({ rows: [weather] }) // weather query
      .mockResolvedValueOnce({ rows: [fertigation] }); // fertigation query
  };

  it('recommends increase when temperature is very high', async () => {
    setupMocks(
      { crop_name: 'Tomato' },
      { avg_max_temp: '42', avg_humidity: '25', total_rainfall: '0' },
      { avg_water: '100' }
    );

    const advice = await getIrrigationAdvice('field-1');
    expect(advice.recommendation).toBe('increase');
    expect(advice.reasoning.some((r) => r.toLowerCase().includes('high temperature') || r.toLowerCase().includes('heat stress'))).toBe(true);
  });

  it('recommends decrease after heavy rainfall', async () => {
    setupMocks(
      { crop_name: 'Tomato' },
      { avg_max_temp: '25', avg_humidity: '60', total_rainfall: '30' },
      { avg_water: '100' }
    );

    const advice = await getIrrigationAdvice('field-1');
    expect(advice.recommendation).toBe('decrease');
    expect(advice.reasoning.some((r) => r.toLowerCase().includes('rainfall') || r.toLowerCase().includes('rain'))).toBe(true);
  });

  it('recommends maintain in moderate conditions', async () => {
    setupMocks(
      { crop_name: 'Lettuce' },
      { avg_max_temp: '25', avg_humidity: '50', total_rainfall: '2' },
      { avg_water: '80' }
    );

    const advice = await getIrrigationAdvice('field-1');
    expect(advice.recommendation).toBe('maintain');
  });

  it('includes all factor data', async () => {
    setupMocks(
      { crop_name: 'Cucumber' },
      { avg_max_temp: '30', avg_humidity: '45', total_rainfall: '5' },
      { avg_water: '120' }
    );

    const advice = await getIrrigationAdvice('field-1');
    expect(advice.factors).toBeDefined();
    expect(advice.factors.temperature).toBe(30);
    expect(advice.factors.humidity).toBe(45);
    expect(advice.factors.recentRainfall).toBe(5);
    expect(advice.factors.lastWaterUsage).toBe(120);
    expect(advice.factors.cropType).toBe('Cucumber');
  });

  it('has confidence between 0 and 100', async () => {
    setupMocks();
    const advice = await getIrrigationAdvice('field-1');
    expect(advice.confidence).toBeGreaterThanOrEqual(0);
    expect(advice.confidence).toBeLessThanOrEqual(100);
  });

  it('calculates suggested water liters', async () => {
    setupMocks(
      { crop_name: 'Tomato' },
      { avg_max_temp: '42', avg_humidity: '20', total_rainfall: '0' },
      { avg_water: '100' }
    );

    const advice = await getIrrigationAdvice('field-1');
    expect(advice.suggestedWaterLiters).toBeDefined();
    expect(advice.suggestedWaterLiters).toBeGreaterThan(100); // should suggest more
  });

  it('handles missing weather data gracefully', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ crop_name: null }] })
      .mockResolvedValueOnce({ rows: [{}] })
      .mockResolvedValueOnce({ rows: [{}] });

    const advice = await getIrrigationAdvice('field-1');
    expect(advice.recommendation).toBeDefined();
    expect(['increase', 'maintain', 'decrease']).toContain(advice.recommendation);
  });

  it('adds low humidity as reason to increase', async () => {
    setupMocks(
      { crop_name: 'Tomato' },
      { avg_max_temp: '30', avg_humidity: '20', total_rainfall: '0' },
      { avg_water: '100' }
    );

    const advice = await getIrrigationAdvice('field-1');
    expect(advice.reasoning.some((r) => r.toLowerCase().includes('humidity'))).toBe(true);
  });
});
