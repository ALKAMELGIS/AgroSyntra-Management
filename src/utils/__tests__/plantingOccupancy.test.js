import {
  ALL_SEGMENTS,
  classifyAllowedTokens,
  conflictingOccupancyTokens,
  draftOccupancyOverlaps,
  fetchOccupancyMap,
  formatOccupiedSegments,
  formatOccupancyCrops,
  formatOverlapWarning,
  formatUprootNotFoundWarning,
  formatUprootSummary,
  occupancyFieldLines,
  occupancySheetRows,
  occupancyTokensForPicker,
  parseOccupancyTokens,
  PLANTING_OCCUPANCY_SOURCE,
  segmentsPayloadFromSelector,
  todayYmd,
  uniqueFieldIdsFromRows,
} from '../plantingOccupancy';

describe('parseOccupancyTokens', () => {
  it('canonicalizes mixed separators without inventing valves', () => {
    expect(parseOccupancyTokens('V1, valve 2 & Bay 10')).toEqual(['V1', 'V2', 'B10']);
  });

  it('canonicalizes 6 TO 10 without turning 6 into V6', () => {
    expect(parseOccupancyTokens('6 TO 10')).toEqual(['6-10']);
    expect(parseOccupancyTokens('2 To 5, 4-B1')).toEqual(['2-5', '4-B1']);
  });

  it('collapses ALL and preserves unknown text', () => {
    expect(parseOccupancyTokens('ALL')).toEqual([ALL_SEGMENTS]);
    expect(parseOccupancyTokens('Structure A')).toEqual(['Structure A']);
  });
});

describe('segmentsPayloadFromSelector', () => {
  it('sends the ALL sentinel, not a comma string', () => {
    expect(segmentsPayloadFromSelector('ALL')).toBe(ALL_SEGMENTS);
  });

  it('sends a token array for a partial uproot', () => {
    expect(segmentsPayloadFromSelector('V1, V2')).toEqual(['V1', 'V2']);
  });

  it('returns null when empty', () => {
    expect(segmentsPayloadFromSelector('')).toBeNull();
    expect(segmentsPayloadFromSelector('   ')).toBeNull();
  });
});

describe('conflictingOccupancyTokens', () => {
  it('warns when a new seeding overlaps occupied segments', () => {
    expect(conflictingOccupancyTokens('V1, V3', ['V1', 'V2'])).toEqual(['V1']);
  });

  it('treats ALL as overlapping everything that is occupied', () => {
    expect(conflictingOccupancyTokens('ALL', ['V1', 'V2'])).toEqual(['V1', 'V2']);
  });

  it('does not warn when the chosen segments are free', () => {
    expect(conflictingOccupancyTokens('V3', ['V1', 'V2'])).toEqual([]);
  });

  it('treats 6 TO 10 as overlapping 6-10 and not 2-5', () => {
    expect(conflictingOccupancyTokens('6 TO 10', ['6-10'])).toEqual(['6-10']);
    expect(conflictingOccupancyTokens('2 To 5', ['6-10'])).toEqual([]);
  });

  it('does not warn when no segment is chosen yet', () => {
    expect(conflictingOccupancyTokens('', ['V1'])).toEqual([]);
  });
});

describe('draftOccupancyOverlaps', () => {
  const occupancyByField = {
    f1: {
      fieldId: 'f1',
      occupied: ['V1', 'V2'],
      rows: [{ cropName: 'Sweetcorn', varietyName: 'Sugar 75', segmentTokens: ['V1', 'V2'] }],
    },
  };

  it('only checks new seeding rows', () => {
    const hits = draftOccupancyOverlaps([
      { _key: 'saved', _isNew: false, fieldId: 'f1', segment: 'V1' },
      { _key: 'draft', _isNew: true, fieldId: 'f1', segment: 'V1, V3' },
    ], occupancyByField);
    expect(hits).toHaveLength(1);
    expect(hits[0].conflicts).toEqual(['V1']);
    expect(hits[0].cropLabel).toBe('Sweetcorn (Sugar 75)');
  });
});

describe('formatUprootSummary', () => {
  it('uses remaining vs uprooted counts in plain words', () => {
    expect(formatUprootSummary({
      segmentsUprooted: ['V1', 'V2', 'V3'],
      segmentsRemaining: ['V4', 'V5', 'V6'],
      fieldCleared: false,
    })).toBe('3 of 6 segments uprooted; V4, V5, V6 still growing.');
  });

  it('says the field is cleared', () => {
    expect(formatUprootSummary({
      segmentsUprooted: ['V1', 'V2'],
      segmentsRemaining: [],
      fieldCleared: true,
    })).toBe('Field cleared. Uprooted V1, V2.');
  });
});

describe('formatUprootNotFoundWarning', () => {
  it('surfaces missing segments as a warning, not an error', () => {
    expect(formatUprootNotFoundWarning({ segmentsNotFound: ['V9'] }))
      .toBe('Nothing was growing on V9.');
    expect(formatUprootNotFoundWarning({ segmentsNotFound: [] })).toBeNull();
  });
});

describe('occupancy panel labels', () => {
  it('groups crop and variety and lists occupied segments', () => {
    expect(formatOccupancyCrops([
      { cropName: 'Sweetcorn', varietyName: 'Sugar 75' },
      { cropName: 'Sweetcorn', varietyName: 'Sugar 75' },
    ])).toBe('Sweetcorn (Sugar 75)');
    expect(formatOccupiedSegments(['V1', 'V2'])).toBe('V1, V2');
    expect(formatOccupiedSegments(['ALL'])).toBe('Entire field');
  });

  it('builds one line per occupied field', () => {
    const lines = occupancyFieldLines({
      f2: { fieldId: 'f2', occupied: ['B1'], rows: [{ cropName: 'Tomato' }] },
      f1: { fieldId: 'f1', occupied: ['V1'], rows: [{ cropName: 'Sweetcorn' }] },
      bare: { fieldId: 'bare', occupied: [], rows: [] },
    }, [
      { id: 'f1', name: 'OF-1' },
      { id: 'f2', name: 'GH-2' },
    ]);
    expect(lines.map((l) => l.fieldName)).toEqual(['GH-2', 'OF-1']);
    expect(lines).toHaveLength(2);
  });

  it('flattens occupancy into one Current-sheet row per planting row', () => {
    const rows = occupancySheetRows({
      f1: {
        fieldId: 'f1',
        occupied: ['B1', 'B2'],
        rows: [
          {
            id: 'p1', cropName: 'Tomato', varietyName: 'Botero',
            segmentTokens: ['B1'], occupancyStart: '2026-09-08T00:00:00.000Z',
          },
          {
            id: 'p2', cropName: 'Tomato', varietyName: 'Botero',
            segmentTokens: ['B2'], occupancyStart: '2026-09-08',
          },
        ],
      },
      empty: { fieldId: 'empty', occupied: [], rows: [] },
    }, [
      { id: 'f1', name: 'NH 01', farmAreaName: 'Block A' },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.segmentsLabel)).toEqual(['B1', 'B2']);
    expect(rows[0].fieldName).toBe('NH 01');
    expect(rows[0].farmAreaName).toBe('Block A');
    expect(rows[0].occupancyStart).toBe('2026-09-08');
  });
});

describe('occupancyTokensForPicker', () => {
  it('offers only occupancy tokens and never invents V1–V4', () => {
    expect(occupancyTokensForPicker({
      occupied: ['V2', 'V3'],
      rows: [],
    })).toEqual(['V2', 'V3']);
    expect(occupancyTokensForPicker({ occupied: ['ALL'], rows: [] })).toEqual([]);
  });
});

describe('classifyAllowedTokens', () => {
  it('splits valves, bays and leftover labels', () => {
    expect(classifyAllowedTokens(['V2', 'B10', 'S', 'Structure'])).toEqual({
      valves: [2],
      bays: [10],
      extras: ['Structure'],
      spots: true,
    });
  });
});

describe('formatOverlapWarning', () => {
  it('tells the operator they can uproot then sow the same day', () => {
    expect(formatOverlapWarning(['V1'], 'Sweetcorn (Sugar 75)')).toMatch(/Same-day uproot then sow/);
  });
});

describe('uniqueFieldIdsFromRows / todayYmd', () => {
  it('dedupes field ids and formats a local date', () => {
    expect(uniqueFieldIdsFromRows([
      { fieldId: 'a' },
      { fieldId: '' },
      { fieldId: 'a' },
      { fieldId: 'b' },
    ])).toEqual(['a', 'b']);
    expect(todayYmd(new Date(2026, 0, 15, 23, 0, 0))).toBe('2026-01-15');
  });
});

describe('fetchOccupancyMap', () => {
  it('calls occupancy per field and swallows a failed field', async () => {
    const requestFn = jest.fn(async (url) => {
      if (url.includes('field-bad')) throw new Error('nope');
      return { fieldId: 'field-ok', occupied: ['V1'], rows: [] };
    });
    const map = await fetchOccupancyMap(
      requestFn,
      PLANTING_OCCUPANCY_SOURCE.OPEN_FIELD,
      ['field-ok', 'field-bad'],
    );
    expect(requestFn).toHaveBeenCalledWith('/open-field-planting/occupancy?field_id=field-ok');
    expect(map['field-ok'].occupied).toEqual(['V1']);
    expect(map['field-bad']).toEqual({ fieldId: 'field-bad', occupied: [], rows: [] });
  });
});
