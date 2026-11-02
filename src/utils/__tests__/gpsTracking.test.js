import {
  downsampleTrail,
  dubaiTodayYmd,
  isRecentPing,
  trailCoordsFromPositions,
} from '../gpsTracking';

describe('gpsTracking frontend helpers', () => {
  it('uses Asia/Dubai for today', () => {
    expect(dubaiTodayYmd(new Date('2026-09-19T21:30:00.000Z'))).toBe('2026-09-20');
  });

  it('marks a ping stale after 15 minutes', () => {
    const now = Date.parse('2026-09-20T10:00:00.000Z');
    expect(isRecentPing('2026-09-20T09:50:00.000Z', now)).toBe(true);
    expect(isRecentPing('2026-09-20T09:40:00.000Z', now)).toBe(false);
    expect(isRecentPing(null, now)).toBe(false);
  });

  it('keeps first and last points when downsampling a long trail', () => {
    const coords = Array.from({ length: 800 }, (_, i) => [24 + i * 0.001, 54 + i * 0.001]);
    const sampled = downsampleTrail(coords, 20);
    expect(sampled[0]).toEqual(coords[0]);
    expect(sampled[sampled.length - 1]).toEqual(coords[coords.length - 1]);
    expect(sampled.length).toBeLessThanOrEqual(20);
  });

  it('builds trail coords and drops empty zeros', () => {
    expect(trailCoordsFromPositions([
      { latitude: 24.5, longitude: 54.4 },
      { latitude: 0, longitude: 0 },
      { latitude: 'x', longitude: 54 },
    ])).toEqual([[24.5, 54.4]]);
  });
});
