jest.mock('../../db/client', () => ({
  dbPool: { query: jest.fn() },
}));
jest.mock('../scouting.service', () => ({
  getBiologicalControlSummaryCatalog: jest.fn(async () => []),
}));

import { dbPool } from '../../db/client';
import { getScoutingSummary } from '../scoutingSummary.service';

const mockQuery = dbPool.query as jest.Mock;

describe('scouting summary reads approved biological-control values only', () => {
  it('skips cells that hold only a pending value and never reads pending columns', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM fields f')) return { rows: [{ id: 'f1', name: 'NH 1', field_type_name: null }] };
      return { rows: [] };
    });

    await getScoutingSummary({ organizationId: 'org-1', year: 2026 });

    const bioSql = mockQuery.mock.calls
      .map(([sql]) => String(sql))
      .find((sql) => sql.includes('FROM bio_record_field_setup bs'));
    expect(bioSql).toBeDefined();
    expect(bioSql).toMatch(/AND \(e\.per_m2 IS NOT NULL OR e\.units IS NOT NULL\)/);
    expect(bioSql).not.toMatch(/pending_/);
  });
});
