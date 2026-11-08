jest.mock('../../db/client', () => {
  const query = jest.fn();
  return { dbPool: { query, connect: jest.fn(async () => ({ query, release: jest.fn() })) } };
});
jest.mock('../formRegistry.service', () => ({
  resolveForm: jest.fn(async () => ({ form_id: 'f-1', form_key: 'harvest.entry', title_en: 'Harvest Entry', title_ar: 'إدخال الحصاد', ui_route: '/harvest/entry' })),
  listForms: jest.fn(async () => []),
  getRecord: jest.fn(),
}));
jest.mock('../arcgisLink.service', () => ({ featureForms: jest.fn() }));

import { dbPool } from '../../db/client';
import { runTool, TOOL_DEFS, ToolContext, TurnState } from '../ai/tools';
import { systemPrompt } from '../ai/agent.service';

const query = dbPool.query as jest.Mock;
const ctx = (over: Partial<ToolContext> = {}): ToolContext => ({ orgId: 'org', userId: 'u', role: 'worker', siteIds: ['s1'], lang: 'ar', ...over });
const state = (): TurnState => ({ results: new Map(), artifacts: [], sources: new Map() });

beforeEach(() => {
  query.mockReset();
  query.mockImplementation(async (sql: string) => {
    if (/FROM form_registry_tables/.test(sql)) return { rows: [{ table_name: 'harvests' }] };
    if (/information_schema\.columns/.test(sql)) return { rows: [{ column_name: 'id', data_type: 'uuid' }, { column_name: 'total_quantity', data_type: 'numeric' }, { column_name: 'notes', data_type: 'text' }, { column_name: 'organization_id', data_type: 'uuid' }] };
    if (/COUNT\(\*\)::int AS n/.test(sql)) return { rows: [{ n: 2 }] };
    if (/^SELECT r\.record_id/.test(sql.trim())) return { rows: [{ record_id: 'a', record_date: new Date('2026-10-20'), total_quantity: '5' }] };
    if (/AS "field"/.test(sql)) return { rows: [{ field: 'GH-01', sum_total_quantity: '120.00' }] };
    return { rows: [] };
  });
});

test('every tool is read only (no write tool is offered)', () => {
  expect(TOOL_DEFS.map((t) => t.name).sort()).toEqual(
    ['aggregate_records', 'app_guide', 'describe_form', 'find_locations', 'get_record', 'gis_feature_forms', 'list_forms', 'query_records', 'show_result'],
  );
});

test('queries run in a READ ONLY transaction with a timeout and are limited to the user\'s sites', async () => {
  await runTool('aggregate_records', { form: 'harvest.entry', metrics: [{ fn: 'sum', column: 'total_quantity' }], group_by: ['field'] }, ctx(), state());
  const sqls = query.mock.calls.map((c) => String(c[0]));
  expect(sqls).toContain('BEGIN READ ONLY');
  expect(sqls.some((s) => /statement_timeout/.test(s))).toBe(true);
  const main = query.mock.calls.find((c) => /GROUP BY/.test(String(c[0])))!;
  expect(String(main[0])).toMatch(/r\.organization_id = \$3 AND r\.site_id = ANY\(\$4::uuid\[\]\)/);
  expect(main[1]).toEqual(['f-1', 'harvests', 'org', ['s1']]);
});

test('the CEO is not limited to a site list', async () => {
  await runTool('aggregate_records', { form: 'harvest.entry', metrics: [{ fn: 'count' }] }, ctx({ role: 'ceo', siteIds: null }), state());
  const main = query.mock.calls.find((c) => /COUNT\(\*\)\)::numeric/.test(String(c[0])))!;
  expect(String(main[0])).not.toMatch(/site_id = ANY/);
});

test('unknown or injected field names are refused, values are parameters', async () => {
  await expect(runTool('query_records', { form: 'harvest.entry', filters: [{ field: 'notes; DROP TABLE x', value: 1 }] }, ctx(), state())).rejects.toThrow(/Unknown field/);
  await expect(runTool('aggregate_records', { form: 'harvest.entry', metrics: [{ fn: 'sum', column: 'organization_id' }] }, ctx(), state())).rejects.toThrow(/Unknown field/);
  await runTool('query_records', { form: 'harvest.entry', filters: [{ field: 'notes', op: 'contains', value: "x' OR 1=1 --" }] }, ctx(), state());
  const main = query.mock.calls.find((c) => /^SELECT r\.record_id/.test(String(c[0]).trim()))!;
  expect(String(main[0])).not.toContain('OR 1=1');
  expect(main[1]).toContain("%x' OR 1=1 --%");
});

test('show_result attaches the full table with a chart and records the source form', async () => {
  const st = state();
  const r = await runTool('aggregate_records', { form: 'harvest.entry', metrics: [{ fn: 'sum', column: 'total_quantity' }], group_by: ['field'] }, ctx(), st);
  await runTool('show_result', { result_id: r.result_id, title: 'Harvest', chart: { type: 'bar', x: 'field', y: ['sum_total_quantity', 'nope'] } }, ctx(), st);
  expect(st.artifacts[0]).toMatchObject({ title: 'Harvest', rows: [{ field: 'GH-01', sum_total_quantity: 120 }], chart: { type: 'bar', x: 'field', y: ['sum_total_quantity'] } });
  expect([...st.sources.keys()]).toEqual(['f-1']);
});

test('the system prompt keeps the assistant on the database and read only', () => {
  const p = systemPrompt({ userId: 'u', role: 'worker', orgId: 'o' }, 'ar', 2);
  expect(p).toMatch(/Never invent numbers/);
  expect(p).toMatch(/read only/i);
  expect(p).toMatch(/Arabic/);
  expect(p).toMatch(/2 site/);
});
