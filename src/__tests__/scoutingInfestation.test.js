import {
  computePestInfestationPct,
  computeInfestationByPest,
  pestGroupKey,
} from '../utils/scoutingInfestation';

const hasSample = (row) => row.average != null;
const avgOf = (row) => row.average;

describe('scoutingInfestation', () => {
  it('computes Capsicum nethouse example: 30000 × 0.10 / 340 = 8.82%', () => {
    expect(computePestInfestationPct(30000, 0.1, 340)).toBe(8.82);
  });

  it('returns null when inputs invalid', () => {
    expect(computePestInfestationPct(0, 0.1, 340)).toBeNull();
    expect(computePestInfestationPct(30000, 0.1, 0)).toBeNull();
  });

  it('sums segment averages per pest abbr', () => {
    const rows = [
      { abbr: 'T', average: 0.05 },
      { abbr: 'T', average: 0.05 },
    ];
    const map = computeInfestationByPest(rows, 30000, 340, hasSample, avgOf);
    expect(map[pestGroupKey(rows[0])]).toBe(8.82);
  });

  it('scales with tomato plant count', () => {
    expect(computePestInfestationPct(24000, 0.1, 340)).toBe(7.06);
  });

  it('returns no infestation when rows have no sample input', () => {
    const rows = [
      { abbr: 'MA', count1: '', count2: '', average: null },
      { abbr: 'T', count1: '', count2: '' },
    ];
    const hasSample = (row) => row.count1 !== '' && row.count1 != null;
    const avgOf = () => 0;
    expect(computeInfestationByPest(rows, 30000, 340, hasSample, avgOf)).toEqual({});
  });
});
