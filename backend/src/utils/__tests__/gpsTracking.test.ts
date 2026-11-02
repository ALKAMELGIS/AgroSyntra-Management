import {
  dubaiDayBounds,
  dubaiRangeBounds,
  dubaiTodayYmd,
  isEquipmentType,
  isUuid,
  parseIsoDate,
  parseLatLng,
  parseOptionalNumber,
  parseOptionalRecordedAt,
  resolveEquipmentLookup,
} from '../gpsTracking';

describe('gpsTracking', () => {
  it('treats a Dubai calendar day as UTC+4 midnight bounds', () => {
    const { start, endExclusive } = dubaiDayBounds('2026-09-20');
    expect(start.toISOString()).toBe('2026-09-19T20:00:00.000Z');
    expect(endExclusive.toISOString()).toBe('2026-09-20T20:00:00.000Z');
  });

  it('keeps an inclusive from/to range as Dubai days', () => {
    const { start, endExclusive } = dubaiRangeBounds('2026-09-19', '2026-09-20');
    expect(start.toISOString()).toBe('2026-09-18T20:00:00.000Z');
    expect(endExclusive.toISOString()).toBe('2026-09-20T20:00:00.000Z');
  });

  it('reports today in Asia/Dubai, not UTC', () => {
    const lateUtc = new Date('2026-09-19T21:30:00.000Z');
    expect(dubaiTodayYmd(lateUtc)).toBe('2026-09-20');
  });

  it('rejects out-of-range coordinates', () => {
    expect(parseLatLng(24.4, 54.3)).toEqual({ latitude: 24.4, longitude: 54.3 });
    expect(parseLatLng(91, 54)).toBeNull();
    expect(parseLatLng('x', 54)).toBeNull();
  });

  it('resolves IMEI-style identifiers when equipment_id is not a UUID', () => {
    expect(resolveEquipmentLookup({ equipment_id: '358765432109876' })).toEqual({
      identifier: '358765432109876',
    });
    expect(resolveEquipmentLookup({
      equipment_id: '2f1c7b5a-4d3e-4a21-9c8b-0a1b2c3d4e5f',
    })).toEqual({ id: '2f1c7b5a-4d3e-4a21-9c8b-0a1b2c3d4e5f' });
    expect(resolveEquipmentLookup({ identifier: ' TRACTOR-1 ' })).toEqual({ identifier: 'TRACTOR-1' });
  });

  it('validates types, dates, and optional numeric fields', () => {
    expect(isEquipmentType('tractor')).toBe(true);
    expect(isEquipmentType('boat')).toBe(false);
    expect(isUuid('2f1c7b5a-4d3e-4a21-9c8b-0a1b2c3d4e5f')).toBe(true);
    expect(parseIsoDate('2026-09-20T00:00:00Z')).toBe('2026-09-20');
    expect(parseIsoDate('nope')).toBeNull();
    expect(parseOptionalNumber('', 0, 360)).toBeUndefined();
    expect(parseOptionalNumber(90, 0, 360)).toBe(90);
    expect(() => parseOptionalNumber(400, 0, 360)).toThrow(/between/);
    expect(parseOptionalRecordedAt('2026-09-20T08:00:00.000Z')?.toISOString()).toBe('2026-09-20T08:00:00.000Z');
    expect(() => parseOptionalRecordedAt('not-a-date')).toThrow(/recorded_at/);
  });
});
