import {
  ALL_SEGMENTS,
  AmbiguousSegmentSplitError,
  canonicalizeSegmentToken,
  parseSegmentTokens,
  serializeSegmentTokens,
  splitSegmentTokens,
} from '../plantingSegmentTokens';

describe('canonicalizeSegmentToken', () => {
  it('normalizes bay spellings to B{n}', () => {
    for (const raw of ['B1', 'b1', 'bay 1', 'Bay-1', 'BAY   1', 'b01']) {
      expect(canonicalizeSegmentToken(raw)).toBe('B1');
    }
    expect(canonicalizeSegmentToken('Bay 10')).toBe('B10');
  });

  it('normalizes valve spellings to V{n}', () => {
    for (const raw of ['V2', 'v2', 'valve 2', 'Valve-2', 'v02']) {
      expect(canonicalizeSegmentToken(raw)).toBe('V2');
    }
  });

  it('normalizes spots, numbered and bare', () => {
    expect(canonicalizeSegmentToken('S')).toBe('S');
    expect(canonicalizeSegmentToken('spot')).toBe('S');
    expect(canonicalizeSegmentToken('Spot 3')).toBe('S3');
  });

  it('normalizes whole-field spellings to the ALL sentinel', () => {
    for (const raw of ['ALL', 'all', 'All Segments', '*']) {
      expect(canonicalizeSegmentToken(raw)).toBe(ALL_SEGMENTS);
    }
  });

  it('keeps a bare number bare rather than guessing valve or bay', () => {
    expect(canonicalizeSegmentToken('10')).toBe('10');
    expect(canonicalizeSegmentToken('10')).not.toBe('V10');
    expect(canonicalizeSegmentToken('10')).not.toBe('B10');
  });

  it('preserves unrecognized text instead of dropping it', () => {
    expect(canonicalizeSegmentToken('North block')).toBe('North block');
    expect(canonicalizeSegmentToken('  South   plot ')).toBe('South plot');
    expect(canonicalizeSegmentToken('V')).toBe('V');
    expect(canonicalizeSegmentToken('South')).toBe('South');
  });

  it('collapses open-field range spellings without inventing valves', () => {
    expect(canonicalizeSegmentToken('6 TO 10')).toBe('6-10');
    expect(canonicalizeSegmentToken('6 To 10')).toBe('6-10');
    expect(canonicalizeSegmentToken('2 To 5')).toBe('2-5');
    expect(canonicalizeSegmentToken('4-B1')).toBe('4-B1');
    expect(canonicalizeSegmentToken('6')).toBe('6');
  });

  it('returns empty for blank input and never invents a segment', () => {
    expect(canonicalizeSegmentToken('')).toBe('');
    expect(canonicalizeSegmentToken('   ')).toBe('');
    expect(canonicalizeSegmentToken(null)).toBe('');
    expect(canonicalizeSegmentToken(undefined)).toBe('');
  });
});

describe('parseSegmentTokens', () => {
  it('splits on commas and ampersands', () => {
    expect(parseSegmentTokens('V1,V2,V3')).toEqual(['V1', 'V2', 'V3']);
    expect(parseSegmentTokens('V1 & V2')).toEqual(['V1', 'V2']);
    expect(parseSegmentTokens('Bay 1, bay-2 & B3')).toEqual(['B1', 'B2', 'B3']);
  });

  it('preserves first-appearance order and deduplicates', () => {
    expect(parseSegmentTokens('V3, V1, v3, valve 1')).toEqual(['V3', 'V1']);
  });

  it('collapses a row mentioning ALL to the sentinel alone', () => {
    expect(parseSegmentTokens('ALL, V1')).toEqual([ALL_SEGMENTS]);
    expect(parseSegmentTokens('V1, all segments')).toEqual([ALL_SEGMENTS]);
  });

  it('returns no tokens for blank segments and invents nothing', () => {
    expect(parseSegmentTokens('')).toEqual([]);
    expect(parseSegmentTokens(null)).toEqual([]);
    expect(parseSegmentTokens(' , , ')).toEqual([]);
  });

  it('keeps mixed recognized and free-text segments', () => {
    expect(parseSegmentTokens('V1, North block, B2')).toEqual(['V1', 'North block', 'B2']);
  });
});

describe('round trip', () => {
  it('serializing parsed tokens reparses to the same tokens', () => {
    for (const raw of [
      'V1,V2,V3',
      'Bay 1 & bay-2',
      'V1, North block, B2',
      'Spot 3, S, V4',
      '10, V1',
      'ALL',
      '6 TO 10',
      '2 To 5, 4-B1',
    ]) {
      const once = parseSegmentTokens(raw);
      const twice = parseSegmentTokens(serializeSegmentTokens(once));
      expect(twice).toEqual(once);
    }
  });

  it('loses no segment count through a round trip', () => {
    const tokens = parseSegmentTokens('V1, V2, North block, Bay 7, 10');
    expect(tokens).toHaveLength(5);
    expect(parseSegmentTokens(serializeSegmentTokens(tokens))).toHaveLength(5);
  });
});

describe('splitSegmentTokens', () => {
  it('keeps the unselected segment active on a partial uproot', () => {
    expect(splitSegmentTokens('V1,V2,V3', ['V1', 'V2'])).toEqual({
      removed: ['V1', 'V2'],
      remaining: ['V3'],
    });
  });

  it('matches removal requests written in another spelling', () => {
    expect(splitSegmentTokens('V1,V2,V3', ['valve 1', 'v02'])).toEqual({
      removed: ['V1', 'V2'],
      remaining: ['V3'],
    });
  });

  it('removes everything when the request is ALL', () => {
    expect(splitSegmentTokens('V1,V2,V3', ['ALL'])).toEqual({
      removed: ['V1', 'V2', 'V3'],
      remaining: [],
    });
    expect(splitSegmentTokens('V1,V2', ['*'])).toEqual({
      removed: ['V1', 'V2'],
      remaining: [],
    });
  });

  it('removes nothing when the request is empty', () => {
    expect(splitSegmentTokens('V1,V2', [])).toEqual({
      removed: [],
      remaining: ['V1', 'V2'],
    });
  });

  it('ignores requested segments the row does not have', () => {
    expect(splitSegmentTokens('V1,V2', ['V9'])).toEqual({
      removed: [],
      remaining: ['V1', 'V2'],
    });
  });

  it('matches 6 TO 10 against 6 To 10 after range canonicalisation', () => {
    expect(splitSegmentTokens('6 TO 10', ['6 To 10'])).toEqual({
      removed: ['6-10'],
      remaining: [],
    });
  });

  it('splits free-text segments as exactly as recognized ones', () => {
    expect(splitSegmentTokens('V1, North block', ['North block'])).toEqual({
      removed: ['North block'],
      remaining: ['V1'],
    });
  });

  it('expands an ALL row against the field segment list for a partial uproot', () => {
    expect(
      splitSegmentTokens('ALL', ['V1'], { universe: ['V1', 'V2', 'V3'] }),
    ).toEqual({ removed: ['V1'], remaining: ['V2', 'V3'] });
  });

  it('clears an ALL row without needing the field list when uprooting ALL', () => {
    expect(splitSegmentTokens('ALL', ['ALL'])).toEqual({
      removed: [ALL_SEGMENTS],
      remaining: [],
    });
  });

  it('refuses to partially uproot an ALL row without the field segment list', () => {
    expect(() => splitSegmentTokens('ALL', ['V1'])).toThrow(AmbiguousSegmentSplitError);
    expect(() => splitSegmentTokens('ALL', ['V1'])).toThrow(/without the field segment list/);
  });

  it('never leaves a segment in both halves of the split', () => {
    const { removed, remaining } = splitSegmentTokens('V1,V2,V3,B4', ['V2', 'B4']);
    expect(removed.filter((token) => remaining.includes(token))).toEqual([]);
    expect([...removed, ...remaining].sort()).toEqual(['B4', 'V1', 'V2', 'V3']);
  });
});
