"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
jest.mock('../../db/client', () => ({
    dbPool: { query: jest.fn() },
}));
const client_1 = require("../../db/client");
const ipm_service_1 = require("../ipm.service");
const mockQuery = client_1.dbPool.query;
const ORG = '00000000-0000-0000-0000-000000000001';
describe('listPesticideApplications calendarDateWindow', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    it('uses PHI overlap window when calendarDateWindow is true', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ count: '0' }] })
            .mockResolvedValueOnce({ rows: [] });
        await (0, ipm_service_1.listPesticideApplications)({
            organizationId: ORG,
            siteId: 'site-1',
            status: 'approved',
            startDate: '2026-06-01',
            endDate: '2026-06-30',
            calendarDateWindow: true,
            limit: 500,
        });
        const countSql = mockQuery.mock.calls[0][0];
        expect(countSql).toContain('COALESCE(pa.phi_end_date, pa.application_date)');
        expect(countSql).toContain('pa.application_date <=');
        expect(countSql).not.toMatch(/application_date >= \$\d+.*application_date <= \$\d+/);
    });
    it('uses application_date range when calendarDateWindow is false', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ count: '1' }] })
            .mockResolvedValueOnce({ rows: [{ id: 'a1' }] });
        await (0, ipm_service_1.listPesticideApplications)({
            organizationId: ORG,
            siteId: 'site-1',
            startDate: '2026-06-01',
            endDate: '2026-06-30',
            limit: 50,
        });
        const countSql = mockQuery.mock.calls[0][0];
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
        await (0, ipm_service_1.listPesticideApplications)({
            organizationId: ORG,
            variety: 'Marletta',
            justification: 'thrips',
            limit: 50,
        });
        const countSql = mockQuery.mock.calls[2][0];
        const countParams = mockQuery.mock.calls[2][1];
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
        const count = await (0, ipm_service_1.countPesticideApplicationsCreatedToday)({
            organizationId: ORG,
            siteId: '11111111-1111-1111-1111-111111111111',
        });
        expect(count).toBe(12);
        const sql = mockQuery.mock.calls[0][0];
        expect(sql).toContain("timezone('Asia/Dubai', pa.created_at)");
        expect(sql).toContain('fa.site_id');
        expect(sql).not.toContain('template_id');
    });
    it('scopes Spray/Drench to template_id', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ count: '3' }] });
        const templateId = '22222222-2222-2222-2222-222222222222';
        await (0, ipm_service_1.countPesticideApplicationsCreatedToday)({
            organizationId: ORG,
            siteId: '11111111-1111-1111-1111-111111111111',
            templateId,
        });
        const sql = mockQuery.mock.calls[0][0];
        const params = mockQuery.mock.calls[0][1];
        expect(sql).toContain('pa.template_id');
        expect(params).toContain(templateId);
    });
});
describe('optionalSqlDate / resolveApplicationDate', () => {
    it('treats whitespace as empty so scouting_date is null', () => {
        expect((0, ipm_service_1.optionalSqlDate)('  ')).toBeNull();
        expect((0, ipm_service_1.optionalSqlDate)('\t')).toBeNull();
        expect((0, ipm_service_1.optionalSqlDate)('')).toBeNull();
        expect((0, ipm_service_1.optionalSqlDate)(null)).toBeNull();
    });
    it('keeps ISO dates and strips a time suffix', () => {
        expect((0, ipm_service_1.optionalSqlDate)('2026-03-14')).toBe('2026-03-14');
        expect((0, ipm_service_1.optionalSqlDate)('2026-03-14T08:00:00.000Z')).toBe('2026-03-14');
    });
    it('uses today when application date is only spaces', () => {
        expect((0, ipm_service_1.resolveApplicationDate)('  ')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect((0, ipm_service_1.resolveApplicationDate)('2026-09-01')).toBe('2026-09-01');
    });
    it('rejects non-ISO text that would 22007 Postgres', () => {
        expect((0, ipm_service_1.optionalSqlDate)('14/03/2026')).toBe('2026-03-14');
        expect((0, ipm_service_1.optionalSqlDate)('N/A')).toBeNull();
        expect((0, ipm_service_1.optionalSqlDate)('45321')).toBeNull();
        expect((0, ipm_service_1.resolveApplicationDate)('N/A')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
});
describe('resolveApplicationMethod', () => {
    it('keeps allowed methods and drops Excel machinery', () => {
        expect((0, ipm_service_1.resolveApplicationMethod)('Spray', 'Knapsack')).toBe('spray');
        expect((0, ipm_service_1.resolveApplicationMethod)(undefined, 'drench')).toBe('drench');
        expect((0, ipm_service_1.resolveApplicationMethod)(undefined, 'Knapsack')).toBeNull();
        expect((0, ipm_service_1.resolveApplicationMethod)('tractor', 'Boom sprayer')).toBeNull();
    });
});
