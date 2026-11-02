import {
  hasCombinedFertilizer,
  indexFertigationByHouseDate,
  waterOnlyRemainder,
} from '../irrigationWaterOnly';

describe('hasCombinedFertilizer', () => {
  test('detects type or qty on the irrigation row', () => {
    expect(hasCombinedFertilizer({ fertilizerType: 'NPK' })).toBe(true);
    expect(hasCombinedFertilizer({ fertilizerQty: 2 })).toBe(true);
    expect(hasCombinedFertilizer({ dailyWater: 10, frequency: 4 })).toBe(false);
  });
});

describe('waterOnlyRemainder', () => {
  const fields = [{ id: 'nh5', name: 'NH 05' }];
  const index = indexFertigationByHouseDate([
    { fieldId: 'nh5', date: '2026-06-27', dailyWater: 12, frequency: 2 },
  ], fields);

  test('subtracts fertigation daily total m3 and frequency', () => {
    const out = waterOnlyRemainder({
      fieldId: 'nh5',
      date: '2026-06-27',
      dailyWater: 52.2,
      frequency: 9,
    }, index, fields);
    expect(out.dailyWater).toBeCloseTo(40.2);
    expect(out.frequency).toBe(7);
  });

  test('matches irrigation location label to field name', () => {
    const out = waterOnlyRemainder({
      locationLabel: 'NH 05',
      date: '2026-06-27',
      dailyWater: 52.2,
      frequency: 9,
    }, index, fields);
    expect(out.dailyWater).toBeCloseTo(40.2);
    expect(out.frequency).toBe(7);
  });

  test('does not go below zero', () => {
    const out = waterOnlyRemainder({
      fieldId: 'nh5',
      date: '2026-06-27',
      dailyWater: 5,
      frequency: 1,
    }, index, fields);
    expect(out.dailyWater).toBe(0);
    expect(out.frequency).toBe(0);
  });

  test('RC-108 fertilizer columns zero the remainder', () => {
    const out = waterOnlyRemainder({
      fieldId: 'nh5',
      date: '2026-06-27',
      dailyWater: 52.2,
      frequency: 9,
      fertilizerType: 'A',
    }, index, fields);
    expect(out).toEqual({ dailyWater: 0, frequency: 0 });
  });
});
