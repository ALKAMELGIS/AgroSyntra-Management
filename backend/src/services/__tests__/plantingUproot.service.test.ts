jest.mock('../../db/client', () => ({
  dbPool: { query: jest.fn() },
}));

import {
  conflictingSegments,
  fieldSegmentUniverseBySite,
  listActiveOccupancy,
  occupiedSegments,
  uprootPlanting,
  type PlantingTable,
} from '../plantingUproot.service';

interface Call {
  sql: string;
  params: unknown[];
}

interface FakeState {
  /** Active rows returned for the uproot scan, per table. */
  active?: Array<{ id: string; segment: string | null }>;
  /** Segments recorded anywhere on the field, for ALL expansion. */
  storedSegments?: string[];
  valveNumbers?: number[];
  /** Segments still active after the uproot runs. */
  remaining?: string[];
  /** Open crop_history row, if any. */
  openRotation?: { crop_id: string; variety_id: string | null } | null;
}

/**
 * A fake pool that answers by SQL shape and records every call, so tests can
 * assert on the statements uproot actually issues.
 */
function makeDb(state: FakeState) {
  const calls: Call[] = [];
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    const text = sql.replace(/\s+/g, ' ').trim();

    if (text.includes('information_schema.columns')) {
      return {
        rows: [
          { column_name: 'organization_id' },
          { column_name: 'seeding_date' },
          { column_name: 'field_id' },
          { column_name: 'segment' },
          { column_name: 'crop_id' },
          { column_name: 'status' },
          { column_name: 'uprooted_at' },
          { column_name: 'uprooted_by' },
          { column_name: 'uproot_reason' },
        ],
      };
    }
    if (text.startsWith('SELECT id, segment FROM')) {
      return { rows: state.active ?? [] };
    }
    if (text.startsWith('SELECT number FROM valves')) {
      return { rows: (state.valveNumbers ?? []).map((number) => ({ number })) };
    }
    if (text.startsWith('SELECT crop_id, variety_id FROM crop_history')) {
      return { rows: state.openRotation ? [state.openRotation] : [] };
    }
    if (text.startsWith('SELECT segment FROM') && text.includes("status = 'active'")) {
      return { rows: (state.remaining ?? []).map((segment) => ({ segment })) };
    }
    if (text.startsWith('SELECT segment FROM')) {
      return { rows: (state.storedSegments ?? []).map((segment) => ({ segment })) };
    }
    return { rows: [] };
  });

  return { db: { query } as never, calls, query };
}

function find(calls: Call[], predicate: (sql: string) => boolean): Call | undefined {
  return calls.find((call) => predicate(call.sql.replace(/\s+/g, ' ')));
}

function findAll(calls: Call[], predicate: (sql: string) => boolean): Call[] {
  return calls.filter((call) => predicate(call.sql.replace(/\s+/g, ' ')));
}

const baseInput = {
  table: 'open_field_planting' as PlantingTable,
  fieldId: 'field-1',
  uprootDate: '2025-11-30',
  userId: 'user-1',
};

describe('uprootPlanting', () => {
  beforeEach(() => jest.clearAllMocks());

  it('marks a fully covered row uprooted without splitting it', async () => {
    const { db, calls } = makeDb({
      active: [{ id: 'row-1', segment: 'V1' }],
      remaining: [],
    });

    const summary = await uprootPlanting({ ...baseInput, segments: ['V1'] }, db);

    expect(summary.rowsUprooted).toBe(1);
    expect(summary.rowsSplit).toBe(0);
    expect(summary.segmentsUprooted).toEqual(['V1']);
    expect(find(calls, (sql) => sql.includes('INSERT INTO'))).toBeUndefined();

    const stamp = find(calls, (sql) => sql.includes("status = 'uprooted'"));
    expect(stamp?.params).toEqual(['2025-11-30', 'user-1', null, 'row-1']);
  });

  it('splits a row so the untouched segments keep growing', async () => {
    const { db, calls } = makeDb({
      active: [{ id: 'row-1', segment: 'V1, V2, V3' }],
      remaining: ['V3'],
    });

    const summary = await uprootPlanting({ ...baseInput, segments: ['V1', 'V2'] }, db);

    expect(summary.rowsSplit).toBe(1);
    expect(summary.rowsUprooted).toBe(0);
    expect(summary.segmentsUprooted).toEqual(['V1', 'V2']);
    expect(summary.segmentsRemaining).toEqual(['V3']);
    expect(summary.fieldCleared).toBe(false);

    // The copy carries the freed segments and the uproot stamp.
    const insert = find(calls, (sql) => sql.includes('INSERT INTO'));
    expect(insert?.params[1]).toBe('V1, V2');
    expect(insert?.params[2]).toBe('2025-11-30');

    // The original row keeps what is still in the ground.
    const update = find(calls, (sql) => sql.includes('SET segment = $1'));
    expect(update?.params).toEqual(['V3', 'row-1']);
  });

  it('does not carry created_at or id onto the split copy', async () => {
    const { db, calls } = makeDb({
      active: [{ id: 'row-1', segment: 'B1, B2' }],
      remaining: ['B2'],
    });

    await uprootPlanting({ ...baseInput, segments: ['B1'] }, db);

    const insert = find(calls, (sql) => sql.includes('INSERT INTO'));
    const columnList = insert!.sql.slice(insert!.sql.indexOf('('), insert!.sql.indexOf(')'));
    expect(columnList).not.toMatch(/\bid\b/);
    expect(columnList).not.toContain('created_at');
    expect(columnList).not.toContain('updated_at');
  });

  it('uproots every row and clears the field when ALL is requested', async () => {
    const { db, calls } = makeDb({
      active: [
        { id: 'row-1', segment: 'V1' },
        { id: 'row-2', segment: 'V2' },
      ],
      remaining: [],
    });

    const summary = await uprootPlanting({ ...baseInput, segments: 'ALL' }, db);

    expect(summary.rowsUprooted).toBe(2);
    expect(summary.fieldCleared).toBe(true);
    expect(summary.segmentsNotFound).toEqual([]);

    // A bare field closes its rotation and loses its current crop.
    expect(find(calls, (sql) => sql.includes('UPDATE crop_history SET end_date'))).toBeDefined();
    const clear = find(calls, (sql) => sql.includes('UPDATE fields SET current_crop_id'));
    expect(clear?.params.slice(0, 2)).toEqual([null, null]);
  });

  it('leaves the rotation open while any segment is still growing', async () => {
    const { db, calls } = makeDb({
      active: [{ id: 'row-1', segment: 'V1, V2' }],
      remaining: ['V2'],
      openRotation: { crop_id: 'crop-1', variety_id: 'var-1' },
    });

    const summary = await uprootPlanting({ ...baseInput, segments: ['V1'] }, db);

    expect(summary.fieldCleared).toBe(false);
    expect(find(calls, (sql) => sql.includes('UPDATE crop_history SET end_date'))).toBeUndefined();

    // The field keeps the crop that is still in the remaining segments.
    const sync = find(calls, (sql) => sql.includes('UPDATE fields SET current_crop_id'));
    expect(sync?.params.slice(0, 2)).toEqual(['crop-1', 'var-1']);
  });

  it('reports requested segments that had nothing growing', async () => {
    const { db } = makeDb({
      active: [{ id: 'row-1', segment: 'V1' }],
      remaining: [],
    });

    const summary = await uprootPlanting({ ...baseInput, segments: ['V1', 'V9'] }, db);

    expect(summary.segmentsUprooted).toEqual(['V1']);
    expect(summary.segmentsNotFound).toEqual(['V9']);
  });

  it('expands a row stored as ALL using the segments the field really has', async () => {
    const { db, calls } = makeDb({
      active: [{ id: 'row-1', segment: 'ALL' }],
      storedSegments: ['V1, V2'],
      valveNumbers: [3],
      remaining: ['V2', 'V3'],
    });

    const summary = await uprootPlanting({ ...baseInput, segments: ['V1'] }, db);

    expect(summary.rowsSplit).toBe(1);
    expect(summary.segmentsUprooted).toEqual(['V1']);

    const update = find(calls, (sql) => sql.includes('SET segment = $1'));
    expect(update?.params[0]).toBe('V2, V3');
  });

  it('refuses to guess when a row stored as ALL has no known segments', async () => {
    const { db } = makeDb({
      active: [{ id: 'row-1', segment: 'ALL' }],
      storedSegments: [],
      valveNumbers: [],
    });

    await expect(
      uprootPlanting({ ...baseInput, segments: ['V1'] }, db),
    ).rejects.toThrow(/without the field segment list/i);
  });

  it('derives greenhouse occupancy from the transplant date', async () => {
    const { db, calls } = makeDb({ active: [], remaining: ['V1'] });

    await uprootPlanting(
      { ...baseInput, table: 'planting_records', segments: ['V1'] },
      db,
    );

    const scan = find(calls, (sql) => sql.startsWith('SELECT id, segment FROM'));
    expect(scan?.sql).toContain('COALESCE(transplant_date, seeding_date)');
  });

  it('uses the seeding date for open field occupancy', async () => {
    const { db, calls } = makeDb({ active: [], remaining: [] });

    await uprootPlanting({ ...baseInput, segments: ['V1'] }, db);

    const scan = find(calls, (sql) => sql.startsWith('SELECT id, segment FROM'));
    expect(scan?.sql).not.toContain('transplant_date');
    expect(scan?.sql).toContain('seeding_date <=');
  });

  it('end-season allActive scan does not wait for occupancy start', async () => {
    const { db, calls } = makeDb({ active: [], remaining: [] });

    await uprootPlanting({ ...baseInput, segments: 'ALL', allActive: true }, db);

    const scan = find(calls, (sql) => sql.startsWith('SELECT id, segment FROM'));
    expect(scan?.sql).toContain("status = 'active'");
    expect(scan?.sql).not.toContain('seeding_date <=');
    expect(scan?.params).toEqual(['field-1']);
  });

  it('end-season allActive with an org does not leave a hole at $2', async () => {
    const { db, calls } = makeDb({ active: [], remaining: [] });

    await uprootPlanting({
      ...baseInput,
      segments: 'ALL',
      allActive: true,
      organizationId: 'org-1',
    }, db);

    const scan = find(calls, (sql) => sql.startsWith('SELECT id, segment FROM'));
    expect(scan?.sql).toContain('organization_id = $2::uuid');
    expect(scan?.sql).not.toContain('$3');
    expect(scan?.params).toEqual(['field-1', 'org-1']);
  });

  it('scopes the scan to the organization when one is given', async () => {
    const { db, calls } = makeDb({ active: [], remaining: [] });

    await uprootPlanting(
      { ...baseInput, segments: ['V1'], organizationId: 'org-1' },
      db,
    );

    const scan = find(calls, (sql) => sql.startsWith('SELECT id, segment FROM'));
    expect(scan?.sql).toContain('organization_id = $3');
    expect(scan?.params).toEqual(['field-1', '2025-11-30', 'org-1']);
  });

  it('records the reason so a season closure can be told from a cycle uproot', async () => {
    const { db, calls } = makeDb({
      active: [{ id: 'row-1', segment: 'V1' }],
      remaining: [],
    });

    await uprootPlanting(
      { ...baseInput, segments: 'ALL', reason: 'Season closed' },
      db,
    );

    const stamp = find(calls, (sql) => sql.includes("status = 'uprooted'"));
    expect(stamp?.params[2]).toBe('Season closed');
  });

  it('skips rows that share the field but not the requested segments', async () => {
    const { db, calls } = makeDb({
      active: [
        { id: 'row-1', segment: 'V1' },
        { id: 'row-2', segment: 'V5' },
      ],
      remaining: ['V5'],
    });

    const summary = await uprootPlanting({ ...baseInput, segments: ['V1'] }, db);

    expect(summary.rowsUprooted).toBe(1);
    expect(findAll(calls, (sql) => sql.includes("status = 'uprooted'"))).toHaveLength(1);
  });
});

describe('occupiedSegments', () => {
  beforeEach(() => jest.clearAllMocks());

  it('only counts active rows, so same-day replant is not blocked', async () => {
    const { db, calls } = makeDb({ remaining: ['V2'] });

    const occupied = await occupiedSegments('open_field_planting', 'field-1', '2026-01-15', db);

    expect(occupied).toEqual(['V2']);
    const scan = find(calls, (sql) => sql.startsWith('SELECT segment FROM'));
    expect(scan?.sql).toContain("status = 'active'");
    expect(scan?.sql).toContain('UNION ALL');
    expect(scan?.sql).toContain('open_field_planting');
    expect(scan?.sql).toContain('planting_records');
    expect(scan?.sql).toContain('migrated_to_planting_record_id IS NULL');
    expect(scan?.sql).not.toContain('season_id');
  });
});

describe('listActiveOccupancy', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns parsed segment tokens alongside the raw segment', async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [
        {
          id: 'row-1',
          segment: 'V1, V2',
          crop_id: 'crop-1',
          crop_name: 'Sweetcorn',
          variety_name: 'Overland',
          occupancy_start: '2025-09-01',
        },
      ],
    });

    const rows = await listActiveOccupancy('open_field_planting', 'field-1', {
      query,
    } as never);

    expect(rows).toEqual([
      {
        id: 'row-1',
        segment: 'V1, V2',
        segmentTokens: ['V1', 'V2'],
        cropId: 'crop-1',
        cropName: 'Sweetcorn',
        varietyName: 'Overland',
        occupancyStart: '2025-09-01',
      },
    ]);
  });

  it('only lists active rows, so uprooted cycles drop out', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });

    await listActiveOccupancy('planting_records', 'field-1', { query } as never);

    const sql = String(query.mock.calls[0][0]).replace(/\s+/g, ' ');
    expect(sql).toContain("p.status = 'active'");
    expect(sql).toContain('COALESCE(transplant_date, seeding_date)');
  });

  it('skips open-field rows that were copied onto planting_records', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });

    await listActiveOccupancy('open_field_planting', 'field-1', { query } as never);

    const sql = String(query.mock.calls[0][0]).replace(/\s+/g, ' ');
    expect(sql).toContain('migrated_to_planting_record_id IS NULL');
  });
});

describe('conflictingSegments', () => {
  it('finds nothing on bare ground', () => {
    expect(conflictingSegments(['V1'], [])).toEqual([]);
    expect(conflictingSegments('ALL', [])).toEqual([]);
  });

  it('reports only the overlap', () => {
    expect(conflictingSegments(['V1', 'V2'], ['V2', 'V3'])).toEqual(['V2']);
  });

  it('treats a whole-field request as blocked by any occupancy', () => {
    expect(conflictingSegments('ALL', ['V3'])).toEqual(['V3']);
  });

  it('treats a field occupied as ALL as blocking every segment', () => {
    expect(conflictingSegments(['V1'], ['ALL'])).toEqual(['ALL']);
  });

  it('normalises free text before comparing', () => {
    expect(conflictingSegments(['valve 1'], ['V1'])).toEqual(['V1']);
    expect(conflictingSegments(['Bay-2'], ['B2'])).toEqual(['B2']);
  });

  it('treats 6 TO 10 and 6 To 10 as the same land', () => {
    expect(conflictingSegments(['6 To 10'], ['6-10'])).toEqual(['6-10']);
  });

  it('blocks overlapping ranges and not the other half of the field', () => {
    expect(conflictingSegments(['2 To 5'], ['6-10'])).toEqual([]);
    expect(conflictingSegments(['8-12'], ['6-10'])).toEqual(['6-10']);
  });
});

describe('fieldSegmentUniverseBySite', () => {
  it('loads every field universe in two site-wide queries', async () => {
    const query = jest.fn(async (sql: string) => {
      const text = sql.replace(/\s+/g, ' ');
      if (text.includes('FROM valves')) {
        return { rows: [{ field_id: 'f1', number: 2 }] };
      }
      if (text.includes('segment')) {
        return { rows: [
          { field_id: 'f1', segment: 'B1' },
          { field_id: 'f2', segment: 'V1' },
        ] };
      }
      return { rows: [] };
    });
    const map = await fieldSegmentUniverseBySite('site-1', { query } as never);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls.every(([sql]) => String(sql).includes('site_id'))).toBe(true);
    expect(map.get('f1')).toEqual(expect.arrayContaining(['B1', 'V2']));
    expect(map.get('f2')).toEqual(['V1']);
  });
});
