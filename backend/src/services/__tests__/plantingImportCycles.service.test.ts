import {
  assertImportUprootWindow,
  inheritImportSegments,
} from '../plantingImportCycles.service';

describe('assertImportUprootWindow', () => {
  it('allows a date on or after the previous plant and before the next', () => {
    expect(() => assertImportUprootWindow({
      segments: ['2-5'],
      uprootDate: '2025-10-20',
      afterDate: '2025-10-20',
      beforeDate: '2026-02-04',
    })).not.toThrow();
  });

  it('rejects a date on the next plant day', () => {
    try {
      assertImportUprootWindow({
        segments: ['2-5'],
        uprootDate: '2026-02-04',
        afterDate: '2025-10-20',
        beforeDate: '2026-02-04',
      });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toMatchObject({ code: 'UPROOT_DATE_INVALID', status: 400 });
    }
  });
});

describe('inheritImportSegments', () => {
  it('fills blank companions from the first segment that day', () => {
    const next = inheritImportSegments([
      { occupancyDate: '2025-10-20', segment: '2 To 5' },
      { occupancyDate: '2025-10-20', segment: '' },
      { occupancyDate: '2025-10-20', segment: '4-B1' },
    ]);
    expect(next[1].segment).toBe('2 To 5');
    expect(next[2].segment).toBe('4-B1');
  });
});
