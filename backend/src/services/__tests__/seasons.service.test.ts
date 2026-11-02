jest.mock('../../db/client', () => ({
  dbPool: { query: jest.fn() },
}));

jest.mock('../../utils/fieldCropSync', () => ({
  syncFieldCrop: jest.fn().mockResolvedValue(undefined),
}));

import { syncFieldCrop } from '../../utils/fieldCropSync';
import {
  assertSeedingNotOccupied,
  occupiedSegments,
} from '../plantingUproot.service';
import {
  assertCanManageSeasons,
  closeSeason,
  coveringSeasonForSite,
  createSeason,
  defaultSeasonWindow,
  nextCycleNumber,
  nextSeasonDraft,
  preparePlantingInsert,
  seasonRangesOverlap,
  assertDateWritableForSite,
  assertSeasonEndDate,
  reopenSeason,
  requestSeasonReopen,
  reviewSeasonReopen,
  startOpenSeason,
  todayYmd,
  toYmd,
  updateSeason,
  deleteSeason,
  SEASON_CLOSED_REASON,
} from '../seasons.service';

function makeDb(handlers: Array<(sql: string, params: unknown[]) => unknown>) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  let i = 0;
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    const handler = handlers[i];
    i += 1;
    if (!handler) return { rows: [] };
    return handler(sql, params);
  });
  return { db: { query } as never, calls, query };
}

describe('todayYmd and assertSeasonEndDate', () => {
  it('uses Asia/Dubai, so late UTC evening is still the next farm day', () => {
    expect(todayYmd(new Date('2026-09-16T22:00:00.000Z'))).toBe('2026-09-17');
    expect(todayYmd(new Date('2026-09-16T19:00:00.000Z'))).toBe('2026-09-16');
  });

  it('reads a DATE-like Date as UTC calendar day', () => {
    expect(toYmd(new Date(Date.UTC(2026, 6, 31)))).toBe('2026-07-31');
    expect(toYmd('2026-07-31T00:00:00.000Z')).toBe('2026-07-31');
  });

  it('accepts an end date on start..today and rejects the rest', () => {
    expect(assertSeasonEndDate('2026-07-31', '2025-09-01', '2026-09-17')).toBe('2026-07-31');
    expect(() => assertSeasonEndDate('2025-08-31', '2025-09-01', '2026-09-17'))
      .toThrow(/on or after start_date/);
    expect(() => assertSeasonEndDate('2026-09-18', '2025-09-01', '2026-09-17'))
      .toThrow(/after today/);
    expect(() => assertSeasonEndDate('17/09/2026', '2025-09-01', '2026-09-17'))
      .toThrow(/YYYY-MM-DD/);
  });
});

describe('seasonRangesOverlap', () => {
  it('treats touching inclusive ranges as overlapping', () => {
    expect(seasonRangesOverlap(
      { startDate: '2025-09-01', plannedEndDate: '2026-07-31' },
      { startDate: '2026-07-31', plannedEndDate: '2027-07-31' },
    )).toBe(true);
  });

  it('allows a season that starts the day after another ends', () => {
    expect(seasonRangesOverlap(
      { startDate: '2025-09-01', plannedEndDate: '2026-07-31', endDate: '2026-07-31' },
      { startDate: '2026-08-01', plannedEndDate: '2027-07-31' },
    )).toBe(false);
  });
});

describe('defaultSeasonWindow', () => {
  it('starts 1 Sep of this year from August onwards', () => {
    expect(defaultSeasonWindow(new Date(Date.UTC(2026, 7, 15)))).toEqual({
      startDate: '2026-09-01',
      plannedEndDate: '2027-07-31',
      name: '2026-2027',
    });
  });

  it('still belongs to last September before August', () => {
    expect(defaultSeasonWindow(new Date(Date.UTC(2026, 6, 1)))).toEqual({
      startDate: '2025-09-01',
      plannedEndDate: '2026-07-31',
      name: '2025-2026',
    });
  });
});

describe('createSeason', () => {
  it('rejects a second open season on the same site', async () => {
    const { db } = makeDb([
      () => ({
        rows: [{
          id: 's-open',
          site_id: 'site-1',
          name: '2025-2026',
          start_date: '2025-09-01',
          planned_end_date: '2026-07-31',
          end_date: null,
          status: 'open',
        }],
      }),
      () => ({
        rows: [{
          id: 's-open',
          name: '2025-2026',
        }],
      }),
    ]);

    await expect(createSeason({
      organizationId: 'org-1',
      siteId: 'site-1',
      name: '2026-2027',
      startDate: '2026-08-01',
      plannedEndDate: '2027-07-31',
    }, db)).rejects.toMatchObject({ code: 'SEASON_ALREADY_OPEN', status: 409 });
  });

  it('rejects overlapping date ranges even when the existing season is closed', async () => {
    const { db } = makeDb([
      () => ({
        rows: [{
          id: 's-closed',
          site_id: 'site-1',
          name: '2025-2026',
          start_date: '2025-09-01',
          planned_end_date: '2026-07-31',
          end_date: '2026-07-31',
          status: 'closed',
        }],
      }),
    ]);

    await expect(createSeason({
      organizationId: 'org-1',
      siteId: 'site-1',
      name: 'overlap',
      startDate: '2026-06-01',
      plannedEndDate: '2027-07-31',
    }, db)).rejects.toMatchObject({ code: 'SEASON_OVERLAP', status: 409 });
  });

  it('inserts a closed past season with end_date and no closer', async () => {
    const { db, calls } = makeDb([
      () => ({
        rows: [{
          id: 's-open',
          site_id: 'site-1',
          name: '2026-2027',
          start_date: '2026-09-01',
          planned_end_date: '2027-07-31',
          end_date: null,
          status: 'open',
        }],
      }),
      () => ({
        rows: [{
          id: 's-hist',
          site_id: 'site-1',
          name: '2025-2026',
          start_date: '2025-09-01',
          planned_end_date: '2026-07-31',
          end_date: '2026-07-31',
          status: 'closed',
          closed_at: null,
          closed_by: null,
        }],
      }),
    ]);

    const row = await createSeason({
      organizationId: 'org-1',
      siteId: 'site-1',
      name: '2025-2026',
      startDate: '2025-09-01',
      plannedEndDate: '2026-07-31',
      status: 'closed',
    }, db);

    expect(row.status).toBe('closed');
    expect(row.end_date).toBe('2026-07-31');
    expect(row.closed_by).toBeNull();
    expect(row.closed_at).toBeNull();
    expect(calls[1].sql).toContain('end_date');
    expect(calls[1].sql).not.toContain('closed_by');
    expect(calls[1].params).toEqual([
      'org-1',
      'site-1',
      '2025-2026',
      '2025-09-01',
      '2026-07-31',
      'closed',
      '2026-07-31',
    ]);
  });
});

describe('assertCanManageSeasons', () => {
  it('403s ceo and agronomist', async () => {
    const { db } = makeDb([]);
    await expect(assertCanManageSeasons('u1', 'ceo', 'site-1', 'org-1', db))
      .rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
    await expect(assertCanManageSeasons('u1', 'agronomist', 'site-1', 'org-1', db))
      .rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
  });

  it('403s an operation manager with no assignment row', async () => {
    const { db } = makeDb([() => ({ rows: [] })]);
    await expect(assertCanManageSeasons('om-1', 'operation_manager', 'site-1', 'org-1', db))
      .rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
  });

  it('lets an assigned operation manager through', async () => {
    const { db } = makeDb([() => ({ rows: [{ '?column?': 1 }] })]);
    await expect(assertCanManageSeasons('om-1', 'operation_manager', 'site-1', 'org-1', db))
      .resolves.toBeUndefined();
  });

  it('lets a farm manager through for a site in their zone or assigned to them', async () => {
    const { db, calls } = makeDb([() => ({ rows: [{ can_manage: true }] })]);
    await expect(assertCanManageSeasons('fm-1', 'farm_manager', 'site-1', 'org-1', db))
      .resolves.toBeUndefined();
    expect(calls[0].sql).toContain('user_zone_assignments');
    expect(calls[0].sql).toContain('user_site_assignments');
    expect(calls[0].params).toEqual(['site-1', 'org-1', 'fm-1']);
  });

  it('403s a farm manager for an org site outside their zones and assignments', async () => {
    const { db } = makeDb([() => ({ rows: [{ can_manage: false }] })]);
    await expect(assertCanManageSeasons('fm-1', 'farm_manager', 'site-1', 'org-1', db))
      .rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
  });

  it('404s a farm manager for a site outside the org', async () => {
    const { db } = makeDb([() => ({ rows: [] })]);
    await expect(assertCanManageSeasons('fm-1', 'farm_manager', 'site-2', 'org-1', db))
      .rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });
});

describe('startOpenSeason', () => {
  it('409s when the site already has an open season', async () => {
    const { db } = makeDb([
      () => ({
        rows: [{
          id: 's-open',
          site_id: 'site-1',
          name: '2025-2026',
          start_date: '2025-09-01',
          planned_end_date: '2026-07-31',
          end_date: null,
          status: 'open',
        }],
      }),
      () => ({
        rows: [{ id: 's-open', name: '2025-2026' }],
      }),
    ]);
    await expect(startOpenSeason({
      organizationId: 'org-1',
      siteId: 'site-1',
      startDate: '2026-08-01',
      plannedEndDate: '2027-07-31',
      name: '2026-2027',
    }, db)).rejects.toMatchObject({ code: 'SEASON_ALREADY_OPEN', status: 409 });
  });
});

describe('nextCycleNumber', () => {
  it('asks for max+1 per field, segment, crop and season', async () => {
    const { db, calls } = makeDb([
      () => ({ rows: [{ n: 3 }] }),
    ]);

    await expect(nextCycleNumber(
      'open_field_planting',
      'field-1',
      'V1,V2',
      'crop-1',
      'season-1',
      db,
    )).resolves.toBe(3);

    expect(calls[0].sql).toContain('COALESCE(MAX(cycle_number), 0) + 1');
    expect(calls[0].sql).toContain('UNION ALL');
    expect(calls[0].params).toEqual(['field-1', 'season-1', 'crop-1', 'V1,V2']);
  });
});

describe('preparePlantingInsert', () => {
  it('409s when the requested segments are already growing this season', async () => {
    const query = jest.fn(async (sql: string) => {
      const text = sql.replace(/\s+/g, ' ');
      if (text.includes('FROM fields')) {
        return { rows: [{ site_id: 'site-1', organization_id: 'org-1' }] };
      }
      if (text.includes("status = 'open'")) {
        return { rows: [{ id: 'season-1', status: 'open' }] };
      }
      if (text.includes('SELECT segment FROM')) {
        return { rows: [{ segment: 'V1,V2' }] };
      }
      return { rows: [] };
    });

    await expect(preparePlantingInsert(
      'open_field_planting',
      {
        fieldId: 'field-1',
        segment: 'V2',
        cropId: 'crop-1',
        occupancyDate: '2026-01-15',
      },
      { query } as never,
    )).rejects.toMatchObject({ code: 'SEGMENTS_OCCUPIED', status: 409 });
  });

  it('skips occupancy for same-day companions when asked', async () => {
    const query = jest.fn(async (sql: string) => {
      const text = sql.replace(/\s+/g, ' ');
      if (text.includes('FROM fields')) {
        return { rows: [{ site_id: 'site-1', organization_id: 'org-1' }] };
      }
      if (text.includes("status = 'open'")) {
        return { rows: [{ id: 'season-1', status: 'open' }] };
      }
      if (text.includes('COALESCE(MAX(cycle_number)')) {
        return { rows: [{ n: 1 }] };
      }
      return { rows: [] };
    });

    await expect(preparePlantingInsert(
      'open_field_planting',
      {
        fieldId: 'field-1',
        segment: '4-B1',
        cropId: 'crop-1',
        occupancyDate: '2025-10-20',
        skipOccupancy: true,
      },
      { query } as never,
    )).resolves.toEqual({ seasonId: 'season-1', cycleNumber: 1 });
    expect(query.mock.calls.some(([sql]) => String(sql).includes('SELECT segment FROM'))).toBe(false);
  });

  it('skips occupancy and cycle when there is no field', async () => {
    const query = jest.fn();
    await expect(preparePlantingInsert(
      'open_field_planting',
      { fieldId: null, occupancyDate: '2026-01-15' },
      { query } as never,
    )).resolves.toEqual({ seasonId: null, cycleNumber: 1 });
    expect(query).not.toHaveBeenCalled();
  });

  it('stamps the covering historical season, not the open one', async () => {
    const query = jest.fn(async (sql: string) => {
      const text = sql.replace(/\s+/g, ' ');
      if (text.includes('FROM fields')) {
        return { rows: [{ site_id: 'site-1', organization_id: 'org-1' }] };
      }
      if (text.includes('closed_by IS NOT NULL')) {
        return { rows: [] };
      }
      if (text.includes('SELECT * FROM seasons') && text.includes('start_date <= $2::date')) {
        return {
          rows: [{
            id: 's-hist',
            site_id: 'site-1',
            status: 'closed',
            closed_by: null,
            reopened_at: '2026-09-01',
          }],
        };
      }
      if (text.includes('SELECT segment FROM')) {
        return { rows: [] };
      }
      if (text.includes('COALESCE(MAX(cycle_number)')) {
        return { rows: [{ n: 1 }] };
      }
      return { rows: [] };
    });

    await expect(preparePlantingInsert(
      'open_field_planting',
      {
        fieldId: 'field-1',
        segment: 'V1',
        cropId: 'crop-1',
        occupancyDate: '2025-10-01',
      },
      { query } as never,
    )).resolves.toEqual({ seasonId: 's-hist', cycleNumber: 1 });

    expect(query.mock.calls.some(([sql]) => String(sql).includes("status = 'open'"))).toBe(false);
  });

  it('409s when there is no open year and no covering unlocked season', async () => {
    const query = jest.fn(async (sql: string) => {
      const text = sql.replace(/\s+/g, ' ');
      if (text.includes('FROM fields')) {
        return { rows: [{ site_id: 'site-1', organization_id: 'org-1' }] };
      }
      return { rows: [] };
    });
    await expect(preparePlantingInsert(
      'open_field_planting',
      { fieldId: 'field-1', occupancyDate: '2026-09-01' },
      { query } as never,
    )).rejects.toMatchObject({ code: 'SEASON_NONE_OPEN', status: 409 });
  });

  it('403s a locked historical covering year', async () => {
    const query = jest.fn(async (sql: string) => {
      const text = sql.replace(/\s+/g, ' ');
      if (text.includes('FROM fields')) {
        return { rows: [{ site_id: 'site-1', organization_id: 'org-1' }] };
      }
      if (text.includes('reopened_at IS NULL')) {
        return { rows: [{ name: '2025-2026' }] };
      }
      return { rows: [] };
    });
    await expect(preparePlantingInsert(
      'open_field_planting',
      { fieldId: 'field-1', occupancyDate: '2025-10-01' },
      { query } as never,
    )).rejects.toMatchObject({ code: 'SEASON_CLOSED', status: 403 });
  });
});

describe('coveringSeasonForSite', () => {
  it('asks for the window that contains the occupancy date', async () => {
    const { db, calls } = makeDb([
      () => ({ rows: [{ id: 's-hist' }] }),
    ]);
    await expect(coveringSeasonForSite('site-1', '2025-10-01', db)).resolves.toEqual({ id: 's-hist' });
    expect(calls[0].sql).toContain('start_date <= $2::date');
    expect(calls[0].params).toEqual(['site-1', '2025-10-01']);
  });
});

describe('occupiedSegments season scope', () => {
  it('filters to the current season when one is supplied', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    await occupiedSegments(
      'open_field_planting',
      'field-1',
      '2026-01-15',
      { query } as never,
      'season-1',
    );
    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain('season_id = $3::uuid');
    expect(query.mock.calls[0][1]).toEqual(['field-1', '2026-01-15', 'season-1']);
  });
});

describe('assertSeedingNotOccupied', () => {
  it('lets a same-day replant through when nothing active remains', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    await expect(assertSeedingNotOccupied(
      'open_field_planting',
      'field-1',
      'V1',
      '2026-01-15',
      'season-1',
      { query } as never,
    )).resolves.toBeUndefined();
  });
});

describe('nextSeasonDraft', () => {
  it('starts the next season the day after close and increments the name', () => {
    expect(nextSeasonDraft({ name: '2025-2026' }, '2026-07-31')).toEqual({
      name: '2026-2027',
      startDate: '2026-08-01',
      plannedEndDate: '2027-07-31',
    });
  });
});

describe('closeSeason', () => {
  it('refuses a season that is already closed', async () => {
    const { db } = makeDb([
      () => ({ rows: [{ id: 's1', status: 'closed', name: '2025-2026', site_id: 'site-1' }] }),
    ]);
    await expect(closeSeason({
      seasonId: 's1',
      endDate: '2026-07-31',
      userId: 'user-1',
      organizationId: 'org-1',
    }, db)).rejects.toMatchObject({ code: 'SEASON_ALREADY_CLOSED', status: 409 });
  });

  it('closes without inserting a next season', async () => {
    const openRow = {
      id: 's1',
      status: 'open',
      name: '2025-2026',
      site_id: 'site-1',
      start_date: '2025-09-01',
      planned_end_date: '2026-07-31',
      end_date: null,
    };
    const { db, calls } = makeDb([
      () => ({ rows: [openRow] }),
      () => ({ rows: [openRow] }),
      () => ({ rows: [] }),
      () => ({ rows: [{ id: 's1', status: 'closed', name: '2025-2026', end_date: '2026-07-31' }], rowCount: 1 }),
    ]);
    const result = await closeSeason({
      seasonId: 's1',
      endDate: '2026-07-31',
      userId: 'user-1',
      organizationId: 'org-1',
      today: '2026-09-17',
    }, db);
    expect(result.closed.status).toBe('closed');
    expect(calls.some((c) => c.sql.includes('INSERT INTO seasons'))).toBe(false);
  });

  it('refuses an end date after today', async () => {
    const { db } = makeDb([
      () => ({ rows: [{
        id: 's1',
        status: 'open',
        name: '2025-2026',
        site_id: 'site-1',
        start_date: '2025-09-01',
        planned_end_date: '2026-07-31',
      }] }),
    ]);
    await expect(closeSeason({
      seasonId: 's1',
      endDate: '2026-09-18',
      userId: 'user-1',
      organizationId: 'org-1',
      today: '2026-09-17',
    }, db)).rejects.toMatchObject({ code: 'VALIDATION_ERROR', status: 400 });
  });

  it('refuses an end date that overlaps the next year', async () => {
    const openRow = {
      id: 's1',
      status: 'open',
      name: '2025-2026',
      site_id: 'site-1',
      start_date: '2025-09-01',
      planned_end_date: '2026-07-31',
      end_date: null,
    };
    const nextRow = {
      id: 's2',
      status: 'closed',
      name: '2026-2027',
      site_id: 'site-1',
      start_date: '2026-08-01',
      planned_end_date: '2027-07-31',
      end_date: '2027-07-31',
    };
    const { db } = makeDb([
      () => ({ rows: [openRow] }),
      () => ({ rows: [openRow, nextRow] }),
    ]);
    await expect(closeSeason({
      seasonId: 's1',
      endDate: '2026-09-17',
      userId: 'user-1',
      organizationId: 'org-1',
      today: '2026-09-17',
    }, db)).rejects.toMatchObject({ code: 'SEASON_OVERLAP', status: 409 });
  });
});

describe('updateSeason', () => {
  const closedRow = {
    id: 's1',
    status: 'closed',
    name: '2025-2027',
    site_id: 'site-1',
    start_date: '2025-09-01',
    planned_end_date: '2027-07-31',
    end_date: '2026-09-17',
  };

  it('renames a closed year and updates end_date', async () => {
    const { db, calls } = makeDb([
      () => ({ rows: [closedRow] }),
      () => ({ rows: [closedRow] }),
      () => ({ rows: [{ ...closedRow, name: '2025-2026', end_date: '2026-07-31' }] }),
    ]);
    const row = await updateSeason('s1', {
      name: '2025-2026',
      endDate: '2026-07-31',
      today: '2026-09-17',
    }, db);
    expect(row.name).toBe('2025-2026');
    expect(row.end_date).toBe('2026-07-31');
    const update = calls.find((c) => c.sql.includes('UPDATE seasons'));
    expect(update?.params[4]).toBe('2026-07-31');
  });

  it('refuses end_date on an open season', async () => {
    const { db } = makeDb([
      () => ({ rows: [{ ...closedRow, status: 'open', end_date: null }] }),
    ]);
    await expect(updateSeason('s1', {
      endDate: '2026-07-31',
      today: '2026-09-17',
    }, db)).rejects.toMatchObject({ code: 'VALIDATION_ERROR', status: 400 });
  });

  it('refuses start_date on a closed season', async () => {
    const { db } = makeDb([
      () => ({ rows: [closedRow] }),
    ]);
    await expect(updateSeason('s1', {
      startDate: '2025-10-01',
      today: '2026-09-17',
    }, db)).rejects.toMatchObject({ code: 'VALIDATION_ERROR', status: 400 });
  });
});

describe('assertDateWritableForSite', () => {
  it('403s when the date sits inside an ended season', async () => {
    const { db, calls } = makeDb([
      () => ({ rows: [{ name: '2025-2026' }] }),
    ]);
    await expect(assertDateWritableForSite('site-1', '2026-06-01', db))
      .rejects.toMatchObject({ code: 'SEASON_CLOSED', status: 403 });
    expect(calls[0].sql).toContain('reopened_at IS NULL');
  });

  it('403s a locked historical year', async () => {
    const { db } = makeDb([
      () => ({ rows: [{ name: '2025-2026' }] }),
    ]);
    await expect(assertDateWritableForSite('site-1', '2025-10-01', db))
      .rejects.toMatchObject({ code: 'SEASON_CLOSED', status: 403 });
  });

  it('allows an unlocked historical year', async () => {
    const { db } = makeDb([
      () => ({ rows: [] }),
    ]);
    await expect(assertDateWritableForSite('site-1', '2025-10-01', db)).resolves.toBeUndefined();
  });
});

const closedSeason = {
  id: 's-closed',
  organization_id: 'org-1',
  site_id: 'site-1',
  name: '2025-2026',
  status: 'closed' as const,
};

function reopenQuery(sql: string, params: unknown[]) {
  const text = sql.replace(/\s+/g, ' ');
  if (text.includes('SELECT * FROM seasons WHERE id =')) {
    return { rows: [closedSeason] };
  }
  if (text.includes("status = 'open' LIMIT 1")) {
    return { rows: [{ id: 's-next', name: '2026-2027', status: 'open', site_id: 'site-1' }] };
  }
  if (text.includes('FROM planting_records WHERE season_id') && text.includes('COUNT')) {
    return { rows: [{ n: 0 }] };
  }
  if (text.startsWith('DELETE FROM seasons')) {
    return { rows: [], rowCount: 1 };
  }
  if (text.includes('UPDATE open_field_planting')) {
    expect(params[1]).toBe(SEASON_CLOSED_REASON);
    expect(text).toContain('uproot_reason');
    expect(text).toContain('migrated_to_planting_record_id IS NULL');
    return { rows: [{ id: 'ofp-1' }], rowCount: 1 };
  }
  if (text.includes('UPDATE planting_records')) {
    expect(params[1]).toBe(SEASON_CLOSED_REASON);
    expect(text).toContain('uproot_reason');
    return { rows: [{ id: 'pr-1' }], rowCount: 1 };
  }
  if (text.includes('UPDATE crop_history')) {
    expect(text).toContain('crop_history_id');
    expect(text).not.toContain('end_date = $');
    return { rows: [{ id: 'ch-1' }], rowCount: 1 };
  }
  if (text.includes('FROM fields f')) {
    return { rows: [{ id: 'field-1' }] };
  }
  if (text.includes('FROM crop_history') && text.includes('end_date IS NULL')) {
    return { rows: [{ crop_id: 'crop-1', variety_id: null }] };
  }
  if (text.includes('UPDATE fields SET current_crop_id')) {
    return { rows: [], rowCount: 1 };
  }
  if (text.includes("SET status = 'open'")) {
    return { rows: [{ ...closedSeason, status: 'open' }] };
  }
  return { rows: [] };
}

describe('reopenSeason', () => {
  it('409s when another year is already open, even if empty', async () => {
    const query = jest.fn(async (sql: string, params: unknown[] = []) => reopenQuery(sql, params));
    await expect(reopenSeason({ seasonId: 's-closed', userId: 'auditor-1' }, { query } as never))
      .rejects.toMatchObject({ code: 'SEASON_SUCCESSOR_IN_USE', status: 409 });
    expect(query.mock.calls.some(([sql]) => String(sql).includes('DELETE FROM seasons'))).toBe(false);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('UPDATE planting_records'))).toBe(false);
  });

  it('undoes only Season closed uproots when no other year is open', async () => {
    const query = jest.fn(async (sql: string, params: unknown[] = []) => {
      const text = sql.replace(/\s+/g, ' ');
      if (text.includes("status = 'open' LIMIT 1")) {
        return { rows: [] };
      }
      return reopenQuery(sql, params);
    });
    const result = await reopenSeason({ seasonId: 's-closed', userId: 'auditor-1' }, { query } as never);
    expect(result.discardedNextSeasonId).toBeNull();
    expect(result.plantingsRestored).toBe(2);
    expect(result.cropHistoryReopened).toBe(1);
    expect(result.season.status).toBe('open');
    expect(query.mock.calls.some(([sql]) => String(sql).includes('DELETE FROM seasons'))).toBe(false);
  });

  it('409s when the next season is already open', async () => {
    const query = jest.fn(async (sql: string) => {
      const text = sql.replace(/\s+/g, ' ');
      if (text.includes('SELECT * FROM seasons WHERE id =')) {
        return { rows: [closedSeason] };
      }
      if (text.includes("status = 'open' LIMIT 1")) {
        return { rows: [{ id: 's-next', name: '2026-2027', status: 'open' }] };
      }
      return { rows: [] };
    });

    await expect(reopenSeason({ seasonId: 's-closed', userId: 'auditor-1' }, { query } as never))
      .rejects.toMatchObject({ code: 'SEASON_SUCCESSOR_IN_USE', status: 409 });
    expect(query.mock.calls.some(([sql]) => String(sql).includes('DELETE FROM seasons'))).toBe(false);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('UPDATE planting_records'))).toBe(false);
  });
});

describe('requestSeasonReopen', () => {
  it('moves a closed season to reopen_pending', async () => {
    const { db, calls } = makeDb([
      () => ({ rows: [closedSeason] }),
      () => ({ rows: [{ id: 'req-1', season_id: 's-closed', status: 'pending', reason: 'Ended too early' }] }),
      () => ({ rows: [], rowCount: 1 }),
    ]);
    const row = await requestSeasonReopen({
      seasonId: 's-closed',
      reason: 'Ended too early',
      userId: 'om-1',
      organizationId: 'org-1',
    }, db);
    expect(row.status).toBe('pending');
    expect(calls[2].sql).toContain("status = 'reopen_pending'");
  });

  it('rejects a second request while one is pending', async () => {
    const { db } = makeDb([
      () => ({ rows: [{ ...closedSeason, status: 'reopen_pending' }] }),
    ]);
    await expect(requestSeasonReopen({
      seasonId: 's-closed',
      reason: 'again',
      userId: 'om-1',
      organizationId: 'org-1',
    }, db)).rejects.toMatchObject({ code: 'REOPEN_ALREADY_PENDING', status: 409 });
  });
});

describe('reviewSeasonReopen', () => {
  it('puts the season back to closed on reject', async () => {
    const { db, calls } = makeDb([
      () => ({ rows: [{ id: 'req-1', season_id: 's-closed', status: 'pending', organization_id: 'org-1' }] }),
      () => ({ rows: [], rowCount: 1 }),
      () => ({ rows: [{ id: 'req-1', season_id: 's-closed', status: 'rejected' }] }),
    ]);
    const result = await reviewSeasonReopen({
      requestId: 'req-1',
      decision: 'rejected',
      userId: 'auditor-1',
      organizationId: 'org-1',
    }, db);
    expect(result.request.status).toBe('rejected');
    expect(result.reopen).toBeUndefined();
    expect(calls[1].sql).toContain("status = 'closed'");
  });

  it('unlocks historical in place while an open year exists', async () => {
    const hist = {
      ...historicalSeason,
      status: 'reopen_pending' as const,
      closed_by: null,
    };
    const { db, calls } = makeDb([
      () => ({ rows: [{ id: 'req-1', season_id: 's-hist', status: 'pending', organization_id: 'org-1' }] }),
      () => ({ rows: [hist] }),
      () => ({ rows: [{ ...hist, status: 'closed', reopened_at: '2026-09-11' }], rowCount: 1 }),
      () => ({ rows: [{ id: 'req-1', season_id: 's-hist', status: 'approved' }] }),
    ]);
    const result = await reviewSeasonReopen({
      requestId: 'req-1',
      decision: 'approved',
      userId: 'auditor-1',
      organizationId: 'org-1',
    }, db);
    expect(result.reopen).toBeUndefined();
    expect(result.request.status).toBe('approved');
    expect(calls.some((c) => c.sql.includes("SET status = 'open'"))).toBe(false);
    expect(calls.some((c) => c.sql.includes('DELETE FROM seasons'))).toBe(false);
    expect(calls[2].sql).toContain('reopened_at');
  });
});

const historicalSeason = {
  id: 's-hist',
  site_id: 'site-1',
  organization_id: 'org-1',
  name: '2025-2026',
  start_date: '2025-09-01',
  planned_end_date: '2026-07-31',
  end_date: '2026-07-31',
  status: 'closed' as const,
  closed_by: null,
};

function dispatchDb(impl: (sql: string, params: unknown[]) => { rows: unknown[]; rowCount?: number }) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    return impl(sql, params);
  });
  return { db: { query } as never, calls, query };
}

function historicalCascade(sql: string) {
  if (sql.includes('DELETE FROM open_field_planting')) {
    return { rows: [], rowCount: 1 };
  }
  if (sql.includes('DELETE FROM planting_records')) {
    return { rows: [], rowCount: 1 };
  }
  if (sql.includes('DELETE FROM crop_history')) {
    return { rows: [], rowCount: 1 };
  }
  if (sql.includes('DELETE FROM season_reopen_requests')) {
    return { rows: [], rowCount: 0 };
  }
  if (sql.includes('DELETE FROM seasons')) {
    return { rows: [historicalSeason], rowCount: 1 };
  }
  if (sql.includes('SELECT * FROM seasons')) {
    return { rows: [historicalSeason] };
  }
  if (sql.includes('SELECT id, field_id FROM planting_records')) {
    return { rows: [{ id: 'pr-1', field_id: 'f1' }] };
  }
  if (sql.includes('SELECT id, field_id FROM open_field_planting')) {
    return { rows: [{ id: 'ofp-1', field_id: 'f1' }] };
  }
  if (sql.includes('SELECT id, field_id FROM crop_history')) {
    return { rows: [{ id: 'ch-1', field_id: 'f1' }] };
  }
  if (sql.includes('SET migrated_to_planting_record_id = NULL')) {
    return { rows: [], rowCount: 1 };
  }
  if (sql.includes('plantation_opening_records')) {
    return { rows: [], rowCount: 2 };
  }
  return { rows: [], rowCount: 0 };
}

describe('deleteSeason', () => {
  beforeEach(() => {
    (syncFieldCrop as jest.Mock).mockClear();
  });

  it('409s an open season', async () => {
    const { db } = makeDb([
      () => ({ rows: [{ ...historicalSeason, status: 'open', closed_by: null, end_date: null }] }),
    ]);
    await expect(deleteSeason({ seasonId: 's-hist', organizationId: 'org-1' }, db))
      .rejects.toMatchObject({ code: 'SEASON_OPEN', status: 409 });
  });

  it('409s an ended season with closed_by set', async () => {
    const { db } = makeDb([
      () => ({ rows: [{ ...historicalSeason, closed_by: 'user-1' }] }),
    ]);
    await expect(deleteSeason({ seasonId: 's-hist', organizationId: 'org-1' }, db))
      .rejects.toMatchObject({ code: 'SEASON_ENDED', status: 409 });
  });

  it('409s a reopen_pending season', async () => {
    const { db } = makeDb([
      () => ({ rows: [{ ...historicalSeason, status: 'reopen_pending', closed_by: 'user-1' }] }),
    ]);
    await expect(deleteSeason({ seasonId: 's-hist', organizationId: 'org-1' }, db))
      .rejects.toMatchObject({ code: 'SEASON_ENDED', status: 409 });
  });

  it('nulls OF archive FKs before deleting plantings and syncs touched fields', async () => {
    const { db, calls } = dispatchDb(historicalCascade);
    const result = await deleteSeason({ seasonId: 's-hist', organizationId: 'org-1' }, db);

    expect(result.deleted).toEqual({
      plantings: 1,
      openField: 1,
      cropHistory: 1,
      workbookUnlinked: 2,
    });

    const migratedAt = calls.findIndex((c) => c.sql.includes('SET migrated_to_planting_record_id = NULL'));
    const deletePlantingsAt = calls.findIndex((c) => c.sql.includes('DELETE FROM planting_records'));
    const deleteHistoryAt = calls.findIndex((c) => c.sql.includes('DELETE FROM crop_history'));
    const deleteSeasonAt = calls.findIndex((c) => c.sql.includes('DELETE FROM seasons'));
    expect(migratedAt).toBeGreaterThanOrEqual(0);
    expect(migratedAt).toBeLessThan(deletePlantingsAt);
    expect(deletePlantingsAt).toBeLessThan(deleteHistoryAt);
    expect(deleteHistoryAt).toBeLessThan(deleteSeasonAt);
    expect(calls.some((c) => c.sql.includes('plantation_opening_records'))).toBe(true);
    expect(calls.some((c) => c.sql.includes('DELETE FROM season_reopen_requests'))).toBe(true);
    expect(syncFieldCrop).toHaveBeenCalledWith('f1', db);
  });

  it('does not 500 when an OF archive row points at a planting of this season', async () => {
    const { db, calls } = dispatchDb(historicalCascade);
    await expect(deleteSeason({ seasonId: 's-hist' }, db)).resolves.toBeDefined();
    expect(calls.some((c) => (
      c.sql.includes('SET migrated_to_planting_record_id = NULL')
      && Array.isArray(c.params[0])
      && c.params[0].includes('pr-1')
    ))).toBe(true);
  });

  it('deletes the last historical year even when an open year exists', async () => {
    const { db } = dispatchDb(historicalCascade);
    await expect(deleteSeason({ seasonId: 's-hist', organizationId: 'org-1' }, db))
      .resolves.toMatchObject({ season: { id: 's-hist' } });
  });
});
