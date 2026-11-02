import {
  normalizeBayChip,
  normalizeValveChip,
  findPlantingRecordForChip,
  resolveVarietyForLocation,
  cropNameFromField,
  getLocationOptionsForField,
  parseSegmentIdToLocation,
  resolveVarietyFromSegmentId,
} from '../utils/plantingSegment';

describe('plantingSegment', () => {
  it('normalizes bay and valve chips', () => {
    expect(normalizeBayChip('b1')).toBe('B1');
    expect(normalizeBayChip('bay 2')).toBe('B2');
    expect(normalizeValveChip('1')).toBe('V1');
    expect(normalizeValveChip('v3')).toBe('V3');
  });

  it('matches planting record segment to valve chip', () => {
    const records = [
      { field_id: 'f1', segment: 'V1,V2', variety_name: 'Cherry' },
    ];
    const match = findPlantingRecordForChip('f1', 'V2', 'valve', records);
    expect(match?.variety_name).toBe('Cherry');
  });

  it('resolves crop from field', () => {
    expect(cropNameFromField({ current_crop: 'Tomato' })).toBe('Tomato');
    expect(cropNameFromField({ crop_name: 'Pepper' })).toBe('Pepper');
  });

  it('builds bay and valve dropdown options from planting records', () => {
    const records = [
      { field_id: 'f1', segment: 'V1,V2', variety_name: 'A' },
      { field_id: 'f1', segment: 'bay-3', variety_name: 'B' },
    ];
    const { bays, valves } = getLocationOptionsForField('f1', records);
    expect(valves).toEqual(expect.arrayContaining(['V1', 'V2']));
    expect(bays).toContain('B3');
  });

  it('parses PPP segment id into bay and valve lists', () => {
    const { bayCodes, valveCodes } = parseSegmentIdToLocation('V1, B2');
    expect(valveCodes).toContain('V1');
    expect(bayCodes).toContain('B2');
  });

  it('resolves variety from segment id string (labeled)', () => {
    const records = [{ field_id: 'f1', segment: 'V2', variety_name: 'Cherry' }];
    const result = resolveVarietyFromSegmentId('f1', 'V2', records, {});
    expect(result.variety).toBe('V2: Cherry');
  });

  it('resolves labeled variety for a single valve', () => {
    const field = { id: 'f1', varietyName: 'Default' };
    const records = [
      { field_id: 'f1', segment: 'V1', variety_name: 'Segment A' },
    ];
    const result = resolveVarietyForLocation({
      fieldId: 'f1',
      bayCodes: [],
      valveCodes: ['V1'],
      plantingRecords: records,
      field,
    });
    expect(result.variety).toBe('V1: Segment A');
    expect(result.varietyHelper).toContain('V1');
  });

  it('resolves labeled varieties for multiple bays and a valve', () => {
    const field = { id: 'f1', varietyName: 'Default' };
    const records = [
      { field_id: 'f1', segment: 'B5', variety_name: 'Beef Master' },
      { field_id: 'f1', segment: 'B6', variety_name: 'Roma' },
      { field_id: 'f1', segment: 'V1', variety_name: 'Elpida F1' },
    ];
    const result = resolveVarietyForLocation({
      fieldId: 'f1',
      bayCodes: ['B5', 'B6'],
      valveCodes: ['V1'],
      plantingRecords: records,
      field,
    });
    expect(result.variety).toBe('B5: Beef Master; B6: Roma; V1: Elpida F1');
    expect(result.varietyHelper).toBe('From segments B5, B6, V1');
    expect(result.varietyWarning).toBe('');
  });
});
