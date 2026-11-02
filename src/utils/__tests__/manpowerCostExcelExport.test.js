import { OPS_EXPORT, buildCompanyWorkbookFromSheets } from '../companyExcelExport';
import { buildManpowerCostSheets, hasManpowerCostData } from '../manpowerCostExcelExport';

const detail = {
  lines: [
    {
      employeeId: 'E001', workerName: 'Ahmed', category: 'Casual', siteName: 'Site A',
      firstDate: '2026-10-01', lastDate: '2026-10-10', hours: 80, rate: 8, rateSource: 'group', cost: 640,
    },
    {
      employeeId: 'E002', workerName: 'Bilal', category: 'Permanent', siteName: 'Site A',
      firstDate: '2026-10-02', lastDate: '2026-10-02', hours: 10, rate: 15, rateSource: 'personal', cost: 150,
    },
    {
      employeeId: 'E003', workerName: 'Chand', category: 'Casual', siteName: 'Site A',
      firstDate: '2026-10-03', lastDate: '2026-10-03', hours: 5, rate: null, rateSource: null, cost: 0,
    },
  ],
  totals: { cost: 790, hours: 95, costedHours: 90, missingRateHours: 5, workers: 3 },
};

const summary = {
  totals: detail.totals,
  byCategory: [{ key: 'Casual', label: 'Casual', hours: 80, cost: 640 }, { key: 'Permanent', label: 'Permanent', hours: 10, cost: 150 }],
  byActivity: [{ key: 'Pruning', label: 'Pruning', hours: 60, cost: 480 }, { key: '', label: '', hours: 30, cost: 310 }],
  bySite: [{ key: 's1', label: 'Site A', hours: 90, cost: 790 }],
  offGroupRate: [{
    employeeId: 'E002', workerName: 'Bilal', category: 'Permanent', siteName: 'Site A',
    personalRates: [15], groupRate: 10, hours: 10, cost: 150, differenceVsGroup: 50,
  }],
  missingRate: [{
    employeeId: 'E003', workerName: 'Chand', category: 'Casual', siteName: 'Site A',
    hours: 5, firstDate: '2026-10-03', lastDate: '2026-10-03',
  }],
};

const period = { startDate: '2026-10-01', endDate: '2026-10-31' };

describe('manpower cost Excel export', () => {
  const sheets = buildManpowerCostSheets({ detail, summary, period, siteName: 'Site A' });
  const sheet = (name) => sheets.find((s) => s.sheetName === name);

  it('registers the company export', () => {
    expect(OPS_EXPORT.manpowerCost.title).toBe('MANPOWER COST REPORT');
  });

  it('builds the sheets in order', () => {
    expect(sheets.map((s) => s.sheetName)).toEqual([
      'Summary', 'Cost', 'Casual vs Permanent', 'By activity', 'By site', 'Not on group rate', 'Missing rate',
    ]);
  });

  it('summary states the period, site and totals', () => {
    const rows = sheet('Summary').rows;
    expect(rows[0]).toEqual({ Item: 'Period', Value: '01/10/2026 – 31/10/2026' });
    expect(rows[1].Value).toBe('Site A');
    expect(rows.find((r) => r.Item === 'Total cost (AED)').Value).toBe(790);
    expect(rows.find((r) => r.Item.startsWith('Hours with no rate')).Value).toBe(5);
  });

  it('cost sheet has one row per line, rate source labels, and a total row', () => {
    const rows = sheet('Cost').rows;
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({
      'Employee ID': 'E001', Category: 'Casual', From: '01/10/2026', To: '10/10/2026',
      Hours: 80, 'Rate / hr (AED)': 8, 'Rate from': 'Group', 'Cost (AED)': 640,
    });
    expect(rows[1]).toMatchObject({ Category: 'Permanent (EAG)', 'Rate from': 'Personal' });
    expect(rows[2]).toMatchObject({ 'Rate from': 'No rate', 'Rate / hr (AED)': '', 'Cost (AED)': '' });
    expect(rows[3]).toMatchObject({ 'Employee ID': 'Total', Hours: 95, 'Cost (AED)': 790 });
  });

  it('labels a blank activity as Unassigned and lists workers off the group rate', () => {
    expect(sheet('By activity').rows.map((r) => r.Activity)).toEqual(['Pruning', 'Unassigned']);
    expect(sheet('Not on group rate').rows[0]).toMatchObject({
      Worker: 'Bilal', 'Personal rate (AED)': '15.00', 'Group rate (AED)': 10, 'Difference vs group (AED)': 50,
    });
  });

  it('leaves out the missing-rate sheet when every hour has a rate', () => {
    const names = buildManpowerCostSheets({ detail, summary: { ...summary, missingRate: [] }, period })
      .map((s) => s.sheetName);
    expect(names).not.toContain('Missing rate');
    expect(buildManpowerCostSheets({ detail, summary, period })[0].rows[1].Value).toBe('All sites');
  });

  it('builds a letterhead workbook with one worksheet per sheet', async () => {
    const workbook = await buildCompanyWorkbookFromSheets(sheets, { ...OPS_EXPORT.manpowerCost, logo: null });
    expect(workbook.worksheets.map((ws) => ws.name)).toEqual(sheets.map((s) => s.sheetName));
    const cost = workbook.getWorksheet('Cost');
    const values = [];
    cost.eachRow((row) => values.push(...row.values.filter((v) => v != null)));
    expect(values).toContain('MANPOWER COST REPORT');
    expect(values).toContain('Ahmed');
    expect(values).toContain(790);
  });

  it('knows when there is nothing to export', () => {
    expect(hasManpowerCostData(detail)).toBe(true);
    expect(hasManpowerCostData({ lines: [] })).toBe(false);
    expect(hasManpowerCostData(null)).toBe(false);
  });
});
