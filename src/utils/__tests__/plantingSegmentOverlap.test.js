import {
  canonicalRangeToken,
  occupancyTokensOverlap,
  segmentSetsOverlap,
} from '../plantingSegmentOverlap';

describe('canonicalRangeToken', () => {
  it('collapses 6 TO 10 spellings to 6-10', () => {
    expect(canonicalRangeToken('6 TO 10')).toBe('6-10');
    expect(canonicalRangeToken('6 To 10')).toBe('6-10');
    expect(canonicalRangeToken('6-10')).toBe('6-10');
    expect(canonicalRangeToken('10-6')).toBe('6-10');
  });

  it('does not treat 4-B1 or V6 as a range', () => {
    expect(canonicalRangeToken('4-B1')).toBeNull();
    expect(canonicalRangeToken('V6')).toBeNull();
    expect(canonicalRangeToken('6')).toBeNull();
  });
});

describe('occupancyTokensOverlap', () => {
  it('overlaps the same half and not the other half', () => {
    expect(occupancyTokensOverlap('6-10', '2-5')).toBe(false);
    expect(occupancyTokensOverlap('2-5', '2-5')).toBe(true);
    expect(occupancyTokensOverlap('6-10', '8-12')).toBe(true);
  });

  it('lets a bare 6 overlap 6-10 without inventing V6', () => {
    expect(occupancyTokensOverlap('6', '6-10')).toBe(true);
    expect(occupancyTokensOverlap('V6', '6-10')).toBe(false);
  });
});

describe('segmentSetsOverlap', () => {
  it('treats empty as the whole field', () => {
    expect(segmentSetsOverlap([], ['2-5'])).toBe(true);
    expect(segmentSetsOverlap(['6-10'], ['2-5'])).toBe(false);
    expect(segmentSetsOverlap(['2-5', '4-B1'], ['2-5'])).toBe(true);
  });
});
