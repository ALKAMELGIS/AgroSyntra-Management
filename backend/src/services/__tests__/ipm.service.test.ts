jest.mock('../../db/client', () => ({
  dbPool: { query: jest.fn() },
}));

import { dbPool } from '../../db/client';
import { countPesticideApplicationsCreatedToday, listPesticideApplications, optionalSqlDate, resolveApplicationDate, resolveApplicationMethod } from '../ipm.service';

const mockQuery = dbPool.query as jest.Mock;
const ORG = '00000000-0000-0000-0000-000000000001';

describe('listPesticideApplications calendarDateWindow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses PHI overlap window when calendarDateWindow is true', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [] });

    await listPesticideApplications({
      organizationId: ORG,
      siteId: 'site-1',
      status: 'approved',
      startDate: '2026-06-01',
      endDate: '2026-06-30',
      calendarDateWindow: true,
      limit: 500,
    });

    const countSql = mockQuery.mock.calls[0][0] as string;
    expect(countSql).toContain('COALESCE(pa.phi_end_date, pa.application_date)');
    expect(countSql).toContain('pa.application_date <=');
    expect(countSql).not.toMatch(/application_date >= \$\d+.*application_date <= \$\d+/);
  });

  it('uses application_date range when calendarDateWindow is false', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'a1' }] });

    await listPesticideApplications({
      organizationId: ORG,
      siteId: 'site-1',
      startDate: '2026-06-01',
      endDate: '2026-06-30',
      limit: 50,
    });

    const countSql = mockQuery.mock.calls[0][0] as string;
    expect(countSql).toContain('pa.application_date >=');
    expect(countSql).toContain('pa.application_date <=');
    expect(countSql).not.toContain('COALESCE(pa.phi_end_date');
  });

  it('ANDs variety and justification filters', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [] });

    await listPesticideApplications({
      organizationId: ORG,
      variety: 'Marletta',
      justification: 'thrips',
      limit: 50,
    });

    const countSql = mockQuery.mock.calls[2][0] as string;
    const countParams = mockQuery.mock.calls[2][1] as string[];
    expect(countSql).toContain('pa.variety ILIKE');
    expect(countSql).toContain('pa.justification ILIKE');
    expect(countParams).toContain('%Marletta%');
    expect(countParams).toContain('%thrips%');
  });
});

describe('countPesticideApplicationsCreatedToday', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('counts created_at in Asia/Dubai today for a site', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '12' }] });

    const count = await countPesticideApplicationsCreatedToday({
      organizationId: ORG,
      siteId: '11111111-1111-1111-1111-111111111111',
    });

    expect(count).toBe(12);
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("timezone('Asia/Dubai', pa.created_at)");
    expect(sql).toContain('fa.site_id');
    expect(sql).not.toContain('template_id');
  });

  it('scopes Spray/Drench to template_id', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '3' }] });
    const templateId = '22222222-2222-2222-2222-222222222222';

    await countPesticideApplicationsCreatedToday({
      organizationId: ORG,
      siteId: '11111111-1111-1111-1111-111111111111',
      templateId,
    });

    const sql = mockQuery.mock.calls[0][0] as string;
    const params = mockQuery.mock.calls[0][1] as string[];
    expect(sql).toContain('pa.template_id');
    expect(params).toContain(templateId);
  });
});

describe('optionalSqlDate / resolveApplicationDate', () => {
  it('treats whitespace as empty so scouting_date is null', () => {
    expect(optionalSqlDate('  ')).toBeNull();
    expect(optionalSqlDate('\t')).toBeNull();
    expect(optionalSqlDate('')).toBeNull();
    expect(optionalSqlDate(null)).toBeNull();
  });

  it('keeps ISO dates and strips a time suffix', () => {
    expect(optionalSqlDate('2026-03-14')).toBe('2026-03-14');
    expect(optionalSqlDate('2026-03-14T08:00:00.000Z')).toBe('2026-03-14');
  });

  it('uses today when application date is only spaces', () => {
    expect(resolveApplicationDate('  ')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(resolveApplicationDate('2026-09-01')).toBe('2026-09-01');
  });

  it('rejects non-ISO text that would 22007 Postgres', () => {
    expect(optionalSqlDate('14/03/2026')).toBe('2026-03-14');
    expect(optionalSqlDate('N/A')).toBeNull();
    expect(optionalSqlDate('45321')).toBeNull();
    expect(resolveApplicationDate('N/A')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('resolveApplicationMethod', () => {
  it('keeps allowed methods and drops Excel machinery', () => {
    expect(resolveApplicationMethod('Spray', 'Knapsack')).toBe('spray');
    expect(resolveApplicationMethod(undefined, 'drench')).toBe('drench');
    expect(resolveApplicationMethod(undefined, 'Knapsack')).toBeNull();
    expect(resolveApplicationMethod('tractor', 'Boom sprayer')).toBeNull();
  });
});
