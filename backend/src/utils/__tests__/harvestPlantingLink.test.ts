import {
  harvestPlantingLinkFromCandidate,
  harvestSegmentsOverlap,
  occupancyContainsDate,
  pickHarvestPlantingCandidate,
  resolveHarvestPlanting,
  toYmd,
  type HarvestPlantingCandidate,
} from '../harvestPlantingLink';

const cycle1: HarvestPlantingCandidate = {
  source: 'open_field',
  id: 'ofp-1',
  segment: 'V1, V2, V3',
  occupancyStart: '2025-09-01',
  uprootedAt: '2026-01-15',
};

const cycle2: HarvestPlantingCandidate = {
  source: 'open_field',
  id: 'ofp-2',
  segment: 'V1, V2, V3',
  occupancyStart: '2026-01-15',
  uprootedAt: null,
};

describe('toYmd', () => {
  it('keeps a date-only string and slices a timestamp', () => {
    expect(toYmd('2026-01-15')).toBe('2026-01-15');
    expect(toYmd('2026-01-15T00:00:00.000Z')).toBe('2026-01-15');
  });
});

describe('harvestSegmentsOverlap', () => {
  it('matches when the harvest segment is one of the planting tokens', () => {
    expect(harvestSegmentsOverlap('V1', 'V1, V2')).toBe(true);
    expect(harvestSegmentsOverlap('V9', 'V1, V2')).toBe(false);
  });

  it('treats ALL or an empty harvest segment as matching', () => {
    expect(harvestSegmentsOverlap('ALL', 'V1')).toBe(true);
    expect(harvestSegmentsOverlap('V1', 'ALL')).toBe(true);
    expect(harvestSegmentsOverlap('', 'V1')).toBe(true);
  });
});

describe('occupancyContainsDate', () => {
  it('includes the uproot date and excludes days after it', () => {
    expect(occupancyContainsDate('2025-09-01', '2026-01-15', '2026-01-15')).toBe(true);
    expect(occupancyContainsDate('2025-09-01', '2026-01-15', '2026-01-16')).toBe(false);
    expect(occupancyContainsDate('2026-01-15', null, '2026-01-15')).toBe(true);
    expect(occupancyContainsDate('2026-01-16', null, '2026-01-15')).toBe(false);
  });
});

describe('pickHarvestPlantingCandidate', () => {
  it('attributes a same-day harvest to the outgoing cycle, not the reseeding', () => {
    const picked = pickHarvestPlantingCandidate([cycle1, cycle2], '2026-01-15', 'V1');
    expect(picked?.id).toBe('ofp-1');
  });

  it('attributes later harvests to the new cycle', () => {
    const picked = pickHarvestPlantingCandidate([cycle1, cycle2], '2026-01-20', 'V1');
    expect(picked?.id).toBe('ofp-2');
  });

  it('attributes earlier harvests to the first cycle', () => {
    const picked = pickHarvestPlantingCandidate([cycle1, cycle2], '2025-11-01', 'V1');
    expect(picked?.id).toBe('ofp-1');
  });

  it('leaves the harvest unlinked when two rows still match', () => {
    const a: HarvestPlantingCandidate = {
      source: 'open_field',
      id: 'a',
      segment: 'ALL',
      occupancyStart: '2025-09-01',
      uprootedAt: null,
    };
    const b: HarvestPlantingCandidate = {
      source: 'planting_record',
      id: 'b',
      segment: 'ALL',
      occupancyStart: '2025-09-01',
      uprootedAt: null,
    };
    expect(pickHarvestPlantingCandidate([a, b], '2025-10-01', 'V1')).toBeNull();
  });

  it('uses the only matching segment when the field is split', () => {
    const v1: HarvestPlantingCandidate = {
      source: 'open_field',
      id: 'left',
      segment: 'V1',
      occupancyStart: '2025-09-01',
      uprootedAt: null,
    };
    const v2: HarvestPlantingCandidate = {
      source: 'open_field',
      id: 'right',
      segment: 'V2',
      occupancyStart: '2025-09-01',
      uprootedAt: null,
    };
    expect(pickHarvestPlantingCandidate([v1, v2], '2025-10-01', 'V2')?.id).toBe('right');
  });

  it('does not guess when the harvest has no segment and two rows occupy the field', () => {
    const v1: HarvestPlantingCandidate = {
      source: 'open_field',
      id: 'left',
      segment: 'V1',
      occupancyStart: '2025-09-01',
      uprootedAt: null,
    };
    const v2: HarvestPlantingCandidate = {
      source: 'open_field',
      id: 'right',
      segment: 'V2',
      occupancyStart: '2025-09-01',
      uprootedAt: null,
    };
    expect(pickHarvestPlantingCandidate([v1, v2], '2025-10-01', '')).toBeNull();
  });
});

describe('harvestPlantingLinkFromCandidate', () => {
  it('sets only the matching table FK', () => {
    expect(harvestPlantingLinkFromCandidate(cycle1)).toEqual({
      openFieldPlantingId: 'ofp-1',
      plantingRecordId: null,
    });
    expect(harvestPlantingLinkFromCandidate({
      ...cycle1,
      source: 'planting_record',
      id: 'pr-1',
    })).toEqual({
      openFieldPlantingId: null,
      plantingRecordId: 'pr-1',
    });
  });
});

describe('resolveHarvestPlanting', () => {
  it('queries both planting tables and applies the same-day rule', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('open_field_planting')) {
        return {
          rows: [
            {
              id: 'ofp-1',
              segment: 'V1',
              occupancy_start: '2025-09-01',
              uprooted_at: '2026-01-15',
            },
            {
              id: 'ofp-2',
              segment: 'V1',
              occupancy_start: '2026-01-15',
              uprooted_at: null,
            },
          ],
        };
      }
      return { rows: [] };
    });

    const link = await resolveHarvestPlanting(
      { fieldId: 'field-1', harvestDate: '2026-01-15', segmentId: 'V1' },
      { query },
    );
    expect(link.openFieldPlantingId).toBe('ofp-1');
    expect(link.plantingRecordId).toBeNull();
    expect(query).toHaveBeenCalledTimes(2);
    expect(String(query.mock.calls[0][0])).toContain('migrated_to_planting_record_id IS NULL');
  });
});
