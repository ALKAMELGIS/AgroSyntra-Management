import {
  sumInspectionBuckets,
  deployTotalOnField,
  buildInspectionPayloadFromRow,
  buildInspectionPayloadFromDraft,
  inspectionPayloadsEqual,
  diffInspectionChangeRequest,
  summarizeInspectionDiff,
  formatInspectionRecordLabel,
} from '../bumbleBeeInspection';

describe('bumbleBeeInspection', () => {
  it('sums bucket fields', () => {
    expect(sumInspectionBuckets({
      boxes100: 2,
      boxes80: 1,
      boxes60: 0,
      boxes40: 0,
      boxes20: 0,
      boxes0: 0,
    })).toBe(3);
  });

  it('reads deploy total from last row', () => {
    expect(deployTotalOnField({ box_count_total: 12 })).toBe(12);
    expect(deployTotalOnField(null)).toBeNull();
  });

  it('detects inspection payload differences', () => {
    const row = {
      inspection_date: '2026-08-07',
      boxes_100: 5,
      boxes_80: 4,
      boxes_60: 1,
      boxes_40: 0,
      boxes_20: 0,
      boxes_0: 0,
      notes: 'a',
    };
    const fromRow = buildInspectionPayloadFromRow(row);
    const fromDraft = buildInspectionPayloadFromDraft({
      inspectionDate: '2026-08-07',
      boxes100: '5',
      boxes80: '4',
      boxes60: '1',
      boxes40: '0',
      boxes20: '0',
      boxes0: '0',
      notes: 'a',
    });
    expect(inspectionPayloadsEqual(fromRow, fromDraft)).toBe(true);
    expect(inspectionPayloadsEqual(fromRow, { ...fromDraft, notes: 'b' })).toBe(false);
  });

  it('diffs inspection change requests by changed fields only', () => {
    const snapshot = {
      field_name: 'NH 04',
      inspection_date: '2026-08-07',
      boxes_100: 5,
      boxes_80: 4,
      boxes_60: 1,
      boxes_40: 0,
      boxes_20: 0,
      boxes_0: 0,
      notes: 'old',
    };
    const proposed = {
      inspectionDate: '2026-08-07',
      boxes100: 5,
      boxes80: 3,
      boxes60: 2,
      boxes40: 0,
      boxes20: 0,
      boxes0: 0,
      notes: 'new',
    };
    const changes = diffInspectionChangeRequest(snapshot, proposed);
    expect(changes.map((c) => c.key)).toEqual(['boxes80', 'boxes60', 'notes']);
    expect(changes[0]).toMatchObject({ label: '80%', before: 4, after: 3, delta: -1 });
    expect(summarizeInspectionDiff(changes)).toContain('80%: 4 → 3 (-1)');
    expect(formatInspectionRecordLabel(snapshot)).toBe('NH 04 · 2026-08-07');
  });
});
