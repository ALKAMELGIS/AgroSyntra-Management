import { attachTemps, buildDailyTempIndex, formatTempRange } from '../pages/dashboard/irrigationWeather';

describe('irrigation chart weather', () => {
  const logs = [
    { date: '2026-07-01T00:00:00.000Z', fieldId: 'f1', maxTemp: '44.2', minTemp: '31' },
    { date: '2026-07-01', fieldId: 'f2', maxTemp: 46, minTemp: 29.6 },
    { date: '2026-07-02', fieldId: null, maxTemp: 38, minTemp: null },
    { date: '2026-07-03', maxTemp: '', minTemp: '' },
  ];

  it('takes the highest max and lowest min across a day\'s rows', () => {
    const index = buildDailyTempIndex(logs);
    expect(index.get('2026-07-01')).toEqual({ maxTemp: 46, minTemp: 29.6 });
    expect(index.get('2026-07-02')).toEqual({ maxTemp: 38, minTemp: null });
    expect(index.has('2026-07-03')).toBe(false);
  });

  it('attaches temperatures by ISO date and leaves days without weather empty', () => {
    const points = attachTemps(
      [{ isoDate: '2026-07-01', water: 120 }, { isoDate: '2026-07-05', water: 80 }],
      buildDailyTempIndex(logs),
    );
    expect(points[0]).toMatchObject({ water: 120, maxTemp: 46, minTemp: 29.6 });
    expect(points[1]).toMatchObject({ water: 80, maxTemp: null, minTemp: null });
  });

  it('formats the hover temperature text', () => {
    expect(formatTempRange({ maxTemp: 46, minTemp: 29.6 })).toBe('46°C max / 30°C min');
    expect(formatTempRange({ maxTemp: 38, minTemp: null })).toBe('38°C max');
    expect(formatTempRange({ maxTemp: null, minTemp: null })).toBe('');
  });
});
