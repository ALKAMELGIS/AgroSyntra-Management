import {
  createObsRow,
  cloneObsRow,
  buildObservationRows,
  initialInsectRows,
  defaultSamplingMethod,
  INSECT_ROW_TEMPLATES,
  sumSampleCounts,
  avgSampleCounts,
  hasAnySampleInput,
  SCOUTING_SAMPLE_COUNT,
} from '../utils/scoutingObsRows';

describe('scoutingObsRows', () => {
  it('defaults MA to leaf and others to plant', () => {
    expect(defaultSamplingMethod('MA')).toBe('leaf');
    expect(defaultSamplingMethod('WA')).toBe('plant');
  });

  it('starts with one base row per pest', () => {
    const rows = initialInsectRows();
    expect(rows).toHaveLength(INSECT_ROW_TEMPLATES.length);
    expect(rows.every((r) => r.isBase)).toBe(true);
    expect(rows.every((r) => !hasAnySampleInput(r))).toBe(true);
  });

  it('clones row for manual add with new rowId', () => {
    const base = createObsRow({ abbr: 'A', label: 'Aphids (A)', category: 'insect', isBase: true });
    const extra = cloneObsRow(base);
    expect(extra.abbr).toBe('A');
    expect(extra.isBase).toBe(false);
    expect(extra.rowId).not.toBe(base.rowId);
  });

  it('builds multiple rows per pest from saved observations', () => {
    const saved = [
      {
        category: 'insect',
        pest_name: 'Aphids (A)',
        sampling_unit: 'B5',
        sampling_method: 'plant',
        count_1: 1,
      },
      {
        category: 'insect',
        pest_name: 'Aphids (A)',
        sampling_unit: 'B7',
        sampling_method: 'plant',
        count_1: 2,
      },
    ];
    const rows = buildObservationRows(INSECT_ROW_TEMPLATES, saved, 'insect');
    const aphidRows = rows.filter((r) => r.abbr === 'A');
    expect(aphidRows).toHaveLength(2);
    expect(aphidRows[0].samplingUnit).toBe('B5');
    expect(aphidRows[1].samplingUnit).toBe('B7');
  });

  it('migrates legacy sampling_unit leaf/fruit/plant to count basis', () => {
    const saved = [
      {
        category: 'insect',
        pest_name: 'Whitefly adult (WA)',
        sampling_unit: 'leaf / fruit / plant',
        sampling_method: '',
        count_1: 1,
      },
    ];
    const rows = buildObservationRows(INSECT_ROW_TEMPLATES, saved, 'insect');
    const wa = rows.find((r) => r.abbr === 'WA');
    expect(wa.samplingMethod).toBe('leaf');
    expect(wa.samplingUnit).toBe('');
  });

  it('computes total and average across 10 samples (empty counts as 0, avg = total / 10)', () => {
    const row = createObsRow({ abbr: 'T', label: 'Thrips (T)', category: 'insect', isBase: true });
    row.count1 = 2;
    row.count2 = 4;
    expect(hasAnySampleInput(row)).toBe(true);
    expect(sumSampleCounts(row)).toBe(6);
    expect(avgSampleCounts(row)).toBe(0.6);
    expect(SCOUTING_SAMPLE_COUNT).toBe(10);
  });

  it('loads count_6 through count_10 from saved observations', () => {
    const saved = [
      {
        category: 'insect',
        pest_name: 'Thrips (T)',
        count_1: 1,
        count_6: 6,
        count_10: 10,
      },
    ];
    const rows = buildObservationRows(INSECT_ROW_TEMPLATES, saved, 'insect');
    const thrips = rows.find((r) => r.abbr === 'T');
    expect(thrips.count6).toBe(6);
    expect(thrips.count10).toBe(10);
    expect(sumSampleCounts(thrips)).toBe(17);
    expect(avgSampleCounts(thrips)).toBe(1.7);
  });
});
