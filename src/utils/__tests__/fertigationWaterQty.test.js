import { waterQtyPerValve } from '../fertigationWaterQty';

describe('waterQtyPerValve', () => {
  it('divides daily water by frequency and valves', () => {
    expect(waterQtyPerValve({ dailyWater: 48, frequency: 4, valvesCount: 4 })).toBe(3);
    expect(waterQtyPerValve({ dailyWater: 12.5, frequency: 5, valvesCount: 2 })).toBe(1.25);
  });

  it('returns blank when any piece is missing', () => {
    expect(waterQtyPerValve({ dailyWater: 48, frequency: 4 })).toBe('');
    expect(waterQtyPerValve({ dailyWater: 0, frequency: 4, valvesCount: 4 })).toBe('');
  });
});
