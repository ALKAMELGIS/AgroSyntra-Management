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
    ['aggregate_records', 'app_guide', 'describe_form', 'equipment_positions', 'find_locations', 'get_record', 'gis_feature_forms', 'list_forms', 'query_records', 'sensor_readings', 'show_result', 'soil_properties'],
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

test('soil sensor readings are read only and limited to the user\'s sites; values stay parameters', async () => {
  await runTool('sensor_readings', { field: "GH' OR 1=1", group_by: ['field', 'bogus'] }, ctx(), state());
  const sqls = query.mock.calls.map((c) => String(c[0]));
  expect(sqls).toContain('BEGIN READ ONLY');
  const main = query.mock.calls.find((c) => /soil_sensor_readings/.test(String(c[0])))!;
  expect(String(main[0])).toMatch(/s\.organization_id = \$1/);
  expect(String(main[0])).toMatch(/l\.site_id = ANY\(\$2::uuid\[\]\)/);
  expect(String(main[0])).not.toContain('OR 1=1');
  expect(String(main[0])).not.toContain('bogus');
  expect(main[1]).toEqual(['org', ['s1'], "%GH' OR 1=1%"]);
  await expect(runTool('sensor_readings', { from: '1/11/2026' }, ctx(), state())).rejects.toThrow(/YYYY-MM-DD/);
});

test('equipment tracking follows the GPS page roles', async () => {
  await expect(runTool('equipment_positions', {}, ctx({ role: 'pest_control_supervisor' }), state())).rejects.toThrow(/cannot view equipment/);
  await runTool('equipment_positions', { equipment: 'JD', date: '2026-11-05' }, ctx({ role: 'operation_manager' }), state());
  const main = query.mock.calls.find((c) => /gps_positions/.test(String(c[0])))!;
  expect(String(main[0])).toMatch(/e\.organization_id = \$1/);
  expect(main[1]).toEqual(['org', '%JD%', '2026-11-05']);
});

test('soil properties: field lookup is limited to the user\'s sites and saved profiles are pivoted by depth', async () => {
  query.mockImplementation(async (sql: string) => {
    if (/FROM bi\.dim_location l/.test(sql)) return { rows: [{ field_id: 'f1', field_name: 'OF-01', site_name: 'Site 1', field_type: (globalThis as any).__ft || 'Open Field' }] };
    if (/FROM field_soil_properties/.test(sql)) return { rows: [
      { dataset: 'ph', depth_cm: 0, value_num: '7.8', value_text: null, unit: 'pH' },
      { dataset: 'ph', depth_cm: 30, value_num: '8.1', value_text: null, unit: 'pH' },
      { dataset: 'texture', depth_cm: 0, value_num: null, value_text: 'Sandy loam', unit: '' },
    ] };
    return { rows: [] };
  });
  const s = state();
  const out = await runTool('soil_properties', { field: 'OF-01', depths: [0, 30] }, ctx(), s);
  const lookup = query.mock.calls.find((c) => /FROM bi\.dim_location l/.test(String(c[0])))!;
  expect(String(lookup[0])).toMatch(/l\.site_id = ANY\(\$3::uuid\[\]\)/);
  expect(lookup[1]).toEqual(['org', '%OF-01%', ['s1']]);
  expect(out.columns).toEqual(['property', 'unit', '0cm', '30cm']);
  expect(out.rows).toEqual([
    { property: 'Soil pH (H2O)', unit: 'pH', '0cm': 7.8, '30cm': 8.1 },
    { property: 'Texture class (USDA)', unit: '', '0cm': 'Sandy loam', '30cm': null },
  ]);
  expect(out.note).toMatch(/lab test/);
  await expect(runTool('soil_properties', {}, ctx(), state())).rejects.toThrow(/field or a latitude/);
  (globalThis as any).__ft = 'Greenhouse';
  const gh = await runTool('soil_properties', { field: 'GH-01' }, ctx(), state());
  expect(gh).toEqual(expect.objectContaining({ not_applicable: true, field_type: 'Greenhouse' }));
  delete (globalThis as any).__ft;
});
