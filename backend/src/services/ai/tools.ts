import { dbPool } from '../../db/client';
import { AppError } from '../../utils/errors';
import * as forms from '../formRegistry.service';
import { featureForms } from '../arcgisLink.service';
import type { ToolDef } from './llm';
import * as soilGrids from '../soilGrids.service';

/**
 * Read-only tools the assistant uses to answer from the system's own database.
 *
 * Every tool:
 *  - runs inside a READ ONLY transaction with a statement timeout;
 *  - is limited to the user's organisation and, unless the user is the CEO, to
 *    the sites the user may see (same rule as the rest of the app);
 *  - only touches tables registered in form_registry_tables and columns that
 *    really exist in them (identifiers are whitelisted, values are parameters).
 */

export interface ToolContext {
  orgId: string;
  userId: string;
  role: string;
  siteIds: string[] | null; // null = every site of the organisation
  lang: 'ar' | 'en';
}

export interface ResultSet {
  id: string;
  title?: string;
  columns: string[];
  rows: Array<Record<string, any>>;
  total: number;
  form?: { form_id: string; form_key: string; title_en: string; title_ar: string | null };
}

export interface Artifact {
  kind: 'table';
  title: string;
  columns: string[];
  rows: Array<Record<string, any>>;
  total: number;
  chart?: { type: 'bar' | 'line' | 'pie'; x: string; y: string[] } | null;
  form?: ResultSet['form'];
}

export interface TurnState {
  results: Map<string, ResultSet>;
  artifacts: Artifact[];
  sources: Map<string, { form_id: string; form_key: string; title_en: string; title_ar: string | null }>;
}

const IDENT = /^[a-z_][a-z0-9_]{0,62}$/;
const q = (name: string) => {
  if (!IDENT.test(name)) throw new AppError(`Invalid name: ${name}`, 'VALIDATION_ERROR', 400);
  return `"${name}"`;
};

const LOCATION_DIMS: Record<string, string> = {
  zone: 'l.zone_code', site: 'l.site_name', farm_area: 'l.farm_area_name', field: 'l.field_name',
  field_type: 'l.field_type', gis_link_key: 'l.gis_link_key',
};
const TIME_DIMS: Record<string, string> = {
  day: "r.record_date", week: "date_trunc('week', r.record_date)::date", month: "to_char(r.record_date, 'YYYY-MM')", year: "to_char(r.record_date, 'YYYY')",
};
/** Same roles that can open GPS Tracking in the app. */
export const GPS_READER_ROLES = ['ceo', 'farm_manager', 'operation_manager', 'agronomist', 'worker'];
const NUMERIC_TYPES = new Set(['integer', 'bigint', 'smallint', 'numeric', 'real', 'double precision']);
const HIDDEN = new Set(['organization_id', 'password_hash', 'pin_hash', 'token', 'auth_token']);

// ── helpers ────────────────────────────────────────────────────────────────

async function readOnly(fn: (c: any) => Promise<any>): Promise<any> {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout = '10s'");
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

const columnCache = new Map<string, Map<string, string>>();
async function tableColumns(table: string): Promise<Map<string, string>> {
  const hit = columnCache.get(table);
  if (hit) return hit;
  const { rows } = await dbPool.query(
    `SELECT column_name, data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 AND udt_name NOT IN ('geometry', 'geography', 'bytea')
      ORDER BY ordinal_position`,
    [table],
  );
  const m = new Map<string, string>(rows.filter((r: any) => !HIDDEN.has(r.column_name)).map((r: any) => [r.column_name, r.data_type]));
  columnCache.set(table, m);
  return m;
}

async function formTarget(ref: string, ctx: ToolContext) {
  const form = await forms.resolveForm(ref, ctx.orgId);
  const { rows } = await dbPool.query(
    `SELECT table_name FROM form_registry_tables WHERE form_id = $1 AND role = 'records' LIMIT 1`,
    [form.form_id],
  );
  if (!rows.length) throw new AppError(`Form ${form.form_key} has no record table (it is a report view).`, 'VALIDATION_ERROR', 400);
  const table = rows[0].table_name as string;
  return { form, table, columns: await tableColumns(table) };
}

function scope(ctx: ToolContext, params: any[]): string {
  params.push(ctx.orgId);
  let sql = `r.organization_id = $${params.length}`;
  if (ctx.siteIds !== null) {
    params.push(ctx.siteIds);
    sql += ` AND r.site_id = ANY($${params.length}::uuid[])`;
  }
  return sql;
}

type Filter = { field: string; op?: string; value?: any };

function filterSql(filters: Filter[] | undefined, columns: Map<string, string>, params: any[]): string[] {
  const out: string[] = [];
  (filters || []).slice(0, 12).forEach((f) => {
    const key = String(f.field || '').trim();
    let expr: string;
    let isText = true;
    if (LOCATION_DIMS[key]) expr = LOCATION_DIMS[key];
    else if (columns.has(key)) { expr = `t.${q(key)}`; isText = !NUMERIC_TYPES.has(columns.get(key)!); }
    else throw new AppError(`Unknown field "${key}". Use describe_form to see the fields.`, 'VALIDATION_ERROR', 400);
    const op = (f.op || 'eq').toLowerCase();
    const add = (v: any) => { params.push(v); return `$${params.length}`; };
    switch (op) {
      case 'eq': out.push(isText ? `LOWER(${expr}::text) = LOWER(${add(String(f.value))})` : `${expr} = ${add(f.value)}`); break;
      case 'ne': out.push(isText ? `LOWER(${expr}::text) <> LOWER(${add(String(f.value))})` : `${expr} <> ${add(f.value)}`); break;
      case 'contains': out.push(`${expr}::text ILIKE ${add(`%${String(f.value)}%`)}`); break;
      case 'gt': out.push(`${expr} > ${add(f.value)}`); break;
      case 'gte': out.push(`${expr} >= ${add(f.value)}`); break;
      case 'lt': out.push(`${expr} < ${add(f.value)}`); break;
      case 'lte': out.push(`${expr} <= ${add(f.value)}`); break;
      case 'in': out.push(`LOWER(${expr}::text) = ANY(${add((Array.isArray(f.value) ? f.value : [f.value]).map((v: any) => String(v).toLowerCase()))}::text[])`); break;
      case 'is_empty': out.push(`(${expr} IS NULL OR ${expr}::text = '')`); break;
      case 'not_empty': out.push(`(${expr} IS NOT NULL AND ${expr}::text <> '')`); break;
      default: throw new AppError(`Unknown operator "${op}"`, 'VALIDATION_ERROR', 400);
    }
  });
  return out;
}

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
function dateSql(from: any, to: any, params: any[]): string[] {
  const out: string[] = [];
  if (from) { if (!isoDate.test(String(from))) throw new AppError('from must be YYYY-MM-DD', 'VALIDATION_ERROR', 400); params.push(from); out.push(`r.record_date >= $${params.length}::date`); }
  if (to) { if (!isoDate.test(String(to))) throw new AppError('to must be YYYY-MM-DD', 'VALIDATION_ERROR', 400); params.push(to); out.push(`r.record_date <= $${params.length}::date`); }
  return out;
}

const clean = (v: any) => (v instanceof Date ? v.toISOString().slice(0, 10) : v);
function tidy(rows: any[]) {
  return rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, clean(v)])));
}

let resultSeq = 0;
function register(state: TurnState, rs: Omit<ResultSet, 'id'>): ResultSet {
  resultSeq += 1;
  const id = `r${resultSeq}`;
  const full = { ...rs, id };
  state.results.set(id, full);
  if (rs.form) state.sources.set(rs.form.form_id, rs.form);
  return full;
}

/** What the model sees of a result: the first rows only (the user sees all of it via show_result). */
function forModel(rs: ResultSet, maxRows = 40) {
  return {
    result_id: rs.id,
    form: rs.form ? { form_id: rs.form.form_id, form_key: rs.form.form_key } : undefined,
    columns: rs.columns,
    total_rows: rs.total,
    rows: rs.rows.slice(0, maxRows),
    truncated: rs.rows.length > maxRows || rs.total > rs.rows.length,
  };
}

const formInfo = (f: forms.FormRow) => ({ form_id: f.form_id, form_key: f.form_key, title_en: f.title_en, title_ar: f.title_ar });

// ── tools ──────────────────────────────────────────────────────────────────

export const TOOL_DEFS: ToolDef[] = [
  {
    name: 'list_forms',
    description: 'List every form (data-entry sheet) of the system with its FORM_ID, key, category, screen and how many records the user can see. Call this first when unsure which form holds the data.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'describe_form',
    description: 'Fields (columns) of one form with their types, plus the location fields (zone, site, farm_area, field) and time groupings available for filtering and grouping.',
    input_schema: { type: 'object', properties: { form: { type: 'string', description: 'FORM_ID, form key (e.g. harvest.entry) or form path' } }, required: ['form'] },
  },
  {
    name: 'find_locations',
    description: 'Find zones, sites, farm areas and fields by name or code (also ArcGIS ZONE_ID / Farm_Code). Use it to turn names the user mentions into exact values for filters.',
    input_schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  },
  {
    name: 'query_records',
    description: 'Read records of one form with optional date range and filters. Returns a result_id plus the first rows.',
    input_schema: {
      type: 'object',
      properties: {
        form: { type: 'string' },
        from: { type: 'string', description: 'YYYY-MM-DD, on the record date' },
        to: { type: 'string', description: 'YYYY-MM-DD, on the record date' },
        filters: { type: 'array', items: { type: 'object', properties: { field: { type: 'string' }, op: { type: 'string', enum: ['eq', 'ne', 'contains', 'gt', 'gte', 'lt', 'lte', 'in', 'is_empty', 'not_empty'] }, value: {} }, required: ['field'] } },
        columns: { type: 'array', items: { type: 'string' }, description: 'Form fields to return (default: the main ones)' },
        order: { type: 'string', enum: ['newest', 'oldest'] },
        limit: { type: 'integer', minimum: 1, maximum: 1000 },
      },
      required: ['form'],
    },
  },
  {
    name: 'aggregate_records',
    description: 'Totals, averages, counts, min/max of a form, optionally grouped by zone, site, farm_area, field, field_type, day, week, month, year or any form field. Use it for KPIs, comparisons and reports.',
    input_schema: {
      type: 'object',
      properties: {
        form: { type: 'string' },
        metrics: { type: 'array', items: { type: 'object', properties: { fn: { type: 'string', enum: ['sum', 'avg', 'min', 'max', 'count', 'count_distinct'] }, column: { type: 'string' } }, required: ['fn'] }, minItems: 1 },
        group_by: { type: 'array', items: { type: 'string' }, maxItems: 3 },
        from: { type: 'string' },
        to: { type: 'string' },
        filters: { type: 'array', items: { type: 'object', properties: { field: { type: 'string' }, op: { type: 'string' }, value: {} }, required: ['field'] } },
        limit: { type: 'integer', minimum: 1, maximum: 500 },
      },
      required: ['form', 'metrics'],
    },
  },
  {
    name: 'get_record',
    description: 'One record in full: values, lines, photos, attachments, comments, location and linked GIS features.',
    input_schema: { type: 'object', properties: { record_id: { type: 'string' } }, required: ['record_id'] },
  },
  {
    name: 'gis_feature_forms',
    description: 'All forms recorded on the field linked to an ArcGIS feature, by ZONE_ID + Farm_Code or by GlobalID.',
    input_schema: { type: 'object', properties: { zone_id: { type: 'string' }, farm_code: { type: 'string' }, global_id: { type: 'string' } } },
  },
  {
    name: 'show_result',
    description: 'Show a result to the user as a table (with Excel / PDF export), optionally with a chart. Use for any list or report the user asked for; do not repeat the rows in text.',
    input_schema: {
      type: 'object',
      properties: {
        result_id: { type: 'string' },
        title: { type: 'string' },
        chart: { type: 'object', properties: { type: { type: 'string', enum: ['bar', 'line', 'pie'] }, x: { type: 'string' }, y: { type: 'array', items: { type: 'string' } } }, required: ['type', 'x', 'y'] },
      },
      required: ['result_id', 'title'],
    },
  },
  {
    name: 'sensor_readings',
    description: 'Soil sensor readings (moisture %, temperature °C, EC dS/m, pH, depth) per field. Without group_by it returns the readings; with group_by it returns averages, min and max per field / site / zone / day / week / month.',
    input_schema: {
      type: 'object',
      properties: {
        field: { type: 'string', description: 'Field name or code (optional). Use find_locations if unsure.' },
        site: { type: 'string', description: 'Site name (optional)' },
        from: { type: 'string', description: 'YYYY-MM-DD' },
        to: { type: 'string', description: 'YYYY-MM-DD' },
        group_by: { type: 'array', items: { type: 'string', enum: ['field', 'site', 'zone', 'day', 'week', 'month'] }, maxItems: 2 },
        limit: { type: 'integer', minimum: 1, maximum: 1000 },
      },
    },
  },
  {
    name: 'equipment_positions',
    description: 'GPS tracking of equipment: the last known position, speed and time of each machine, or the track of one machine on a day (when equipment and date are given).',
    input_schema: {
      type: 'object',
      properties: {
        equipment: { type: 'string', description: 'Equipment name or identifier (optional)' },
        date: { type: 'string', description: 'YYYY-MM-DD: return the track of that day instead of the last positions' },
      },
    },
  },
  {
    name: 'soil_properties',
    description: 'Only for open fields and pivots (not greenhouses, net houses, glasshouses, tunnels or Cravo). Soil properties from the global OpenLandMap soil maps (250 m): pH, organic carbon, clay, sand, bulk density, water at field capacity and USDA texture class, at standard depths (0, 10, 30, 60, 100 cm). Give a field name/code (uses the saved field profile, or reads the maps at the field) or a latitude/longitude. Modelled values, not lab results.',
    input_schema: {
      type: 'object',
      properties: {
        field: { type: 'string', description: 'Field name or code' },
        lat: { type: 'number' },
        lon: { type: 'number' },
        depths: { type: 'array', items: { type: 'integer', enum: [0, 10, 30, 60, 100] } },
      },
    },
  },
  {
    name: 'app_guide',
    description: 'Screens of the system and where each form is entered, to explain how to do something in the app.',
    input_schema: { type: 'object', properties: { topic: { type: 'string' } } },
  },
];

const SCREENS: Array<[string, string, string]> = [
  ['Home', '/', 'Start page with shortcuts'],
  ['Daily Brief', '/daily-brief', 'Today: PHI, alerts, harvest, weather'],
  ['EC/pH Entry', '/ecph-entry', 'Daily EC/pH readings per valve'],
  ['Fertigation Entry', '/fertigation/entry', 'Water and fertilizer applications'],
  ['Irrigation Entry', '/irrigation/entry', 'Irrigation sheet (RC-108)'],
  ['Harvest Entry', '/harvest/entry', 'Harvest quantities per field and variety'],
  ['Pump Room', '/pump-room', 'Water, electricity and fogger readings'],
  ['Pesticide Applications', '/ipm/pesticide-applications', 'PPP records, work orders, active PHI, costing'],
  ['Scouting Reports', '/ipm/scouting-reports', 'Pest and disease observations'],
  ['Biological Control', '/ipm/biological-control-record', 'Biological agent releases'],
  ['Bumble Bees', '/ipm/bumble-bees', 'Hive deployments and box inspections'],
  ['Weather Log', '/weather-log', 'Daily weather and soil'],
  ['Manpower Record', '/manpower-record', 'Daily work activity and approval'],
  ['Crop Rotation & Planting', '/admin/crop-history', 'Planting, nursery sowing, germination, plantation workbook'],
  ['Zones & Sites', '/manage/countries', 'Zones, sites, and the GIS configuration tab (ArcGIS link)'],
  ['Farm Areas & Crops', '/manage/farm-areas', 'Farm areas and allowed crops'],
  ['Field Types & Names', '/manage/field-types', 'Field types and field names'],
  ['Seasons', '/manage/seasons', 'Open and close seasons'],
  ['Reports', '/report-builder', 'Report builder and exports'],
  ['GIS Map', '/gis-map', 'Map of fields and layers'],
  ['GPS Tracking', '/gps-tracking', 'Equipment positions and tracks'],
  ['Remote Sensing', '/remote-sensing', 'Satellite imagery and NDVI per field'],
  ['Change Requests', '/audit/change-requests', 'Approve edit / delete requests'],
];

export async function runTool(name: string, input: any, ctx: ToolContext, state: TurnState): Promise<any> {
  const args = input || {};
  switch (name) {
    case 'list_forms': {
      const list = await forms.listForms(ctx.orgId, {});
      const params: any[] = [];
      const where = scope(ctx, params);
      const counts = await readOnly((c) => c.query(
        `SELECT r.form_id, COUNT(*)::int AS n, MAX(r.record_date) AS last FROM bi.form_records r WHERE ${where} GROUP BY r.form_id`, params,
      ));
      const byId = new Map(counts.rows.map((r: any) => [r.form_id, r]));
      return list.map((f: any) => ({
        form_id: f.form_id, form_key: f.form_key, title: ctx.lang === 'ar' && f.title_ar ? f.title_ar : f.title_en,
        category: f.category, screen: f.ui_route,
        records: (byId.get(f.form_id) as any)?.n ?? 0, last_record_date: clean((byId.get(f.form_id) as any)?.last ?? null),
      }));
    }

    case 'describe_form': {
      const { form, table, columns } = await formTarget(args.form, ctx);
      state.sources.set(form.form_id, formInfo(form));
      return {
        form: formInfo(form), screen: form.ui_route, table,
        fields: [...columns.entries()].map(([k, type]) => ({ field: k, type })),
        location_fields: Object.keys(LOCATION_DIMS),
        time_groupings: Object.keys(TIME_DIMS),
        note: 'record_date is the form date used by from/to.',
      };
    }

    case 'find_locations': {
      const text = String(args.text || '').trim();
      if (!text) return [];
      const params: any[] = [ctx.orgId, `%${text}%`];
      let siteClause = '';
      if (ctx.siteIds !== null) { params.push(ctx.siteIds); siteClause = ` AND l.site_id = ANY($${params.length}::uuid[])`; }
      const res = await readOnly((c) => c.query(
        `SELECT l.field_id, l.field_name, l.farm_area_name, l.site_name, l.zone_code, l.field_type, l.gis_zone_id, l.gis_farm_code
           FROM bi.dim_location l
          WHERE l.organization_id = $1 AND NOT l.is_deleted${siteClause}
            AND (l.field_name ILIKE $2 OR l.farm_area_name ILIKE $2 OR l.site_name ILIKE $2 OR l.zone_code ILIKE $2
                 OR l.zone_name ILIKE $2 OR l.gis_farm_code ILIKE $2)
          ORDER BY l.zone_code, l.site_name, l.field_name LIMIT 60`,
        params,
      ));
      return res.rows;
    }

    case 'query_records': {
      const { form, table, columns } = await formTarget(args.form, ctx);
      const params: any[] = [form.form_id, table];
      const where = [`r.form_id = $1`, `r.source_table = $2`, scope(ctx, params), ...dateSql(args.from, args.to, params), ...filterSql(args.filters, columns, params)];
      const wanted = (Array.isArray(args.columns) && args.columns.length ? args.columns : [...columns.keys()])
        .filter((c: string) => columns.has(c) && !/^(id|created_by|updated_by|template_id)$/.test(c))
        .slice(0, 20);
      const limit = Math.min(Math.max(Number(args.limit) || 200, 1), 1000);
      const order = args.order === 'oldest' ? 'ASC' : 'DESC';
      const select = [
        'r.record_id', 'r.record_date', 'l.zone_code AS zone', 'l.site_name AS site', 'l.field_name AS field',
        ...wanted.map((c: string) => `t.${q(c)}`),
      ].join(', ');
      const sql = `FROM bi.form_records r JOIN public.${q(table)} t ON t.id = r.record_id
        LEFT JOIN bi.dim_location l ON l.field_id = r.field_id
        WHERE ${where.join(' AND ')}`;
      const out = await readOnly(async (c) => {
        const total = await c.query(`SELECT COUNT(*)::int AS n ${sql}`, params);
        const rows = await c.query(`SELECT ${select} ${sql} ORDER BY r.record_date ${order} NULLS LAST, r.updated_at ${order} LIMIT ${limit}`, params);
        return { total: total.rows[0].n as number, rows: tidy(rows.rows) };
      });
      const rs = register(state, {
        columns: ['record_date', 'zone', 'site', 'field', ...wanted, 'record_id'],
        rows: out.rows, total: out.total, form: formInfo(form),
      });
      return forModel(rs);
    }

    case 'aggregate_records': {
      const { form, table, columns } = await formTarget(args.form, ctx);
      const params: any[] = [form.form_id, table];
      const where = [`r.form_id = $1`, `r.source_table = $2`, scope(ctx, params), ...dateSql(args.from, args.to, params), ...filterSql(args.filters, columns, params)];
      const groups: Array<{ alias: string; expr: string }> = (Array.isArray(args.group_by) ? args.group_by : []).slice(0, 3).map((g: string) => {
        const key = String(g);
        if (LOCATION_DIMS[key]) return { alias: key, expr: LOCATION_DIMS[key] };
        if (TIME_DIMS[key]) return { alias: key, expr: TIME_DIMS[key] };
        if (columns.has(key)) return { alias: key, expr: `t.${q(key)}` };
        throw new AppError(`Cannot group by "${key}"`, 'VALIDATION_ERROR', 400);
      });
      const metrics = (Array.isArray(args.metrics) ? args.metrics : []).slice(0, 6).map((m: any) => {
        const fn = String(m.fn || 'count');
        if (fn === 'count' && !m.column) return { alias: 'records', expr: 'COUNT(*)' };
        const col = String(m.column || '');
        if (!columns.has(col)) throw new AppError(`Unknown field "${col}" for ${fn}`, 'VALIDATION_ERROR', 400);
        const type = columns.get(col)!;
        if (['sum', 'avg'].includes(fn) && !NUMERIC_TYPES.has(type)) {
          return { alias: `${fn}_${col}`, expr: `${fn.toUpperCase()}(NULLIF(regexp_replace(t.${q(col)}::text, '[^0-9.\\-]', '', 'g'), '')::numeric)` };
        }
        const map: Record<string, string> = {
          sum: `SUM(t.${q(col)})`, avg: `AVG(t.${q(col)})`, min: `MIN(t.${q(col)})`, max: `MAX(t.${q(col)})`,
          count: `COUNT(t.${q(col)})`, count_distinct: `COUNT(DISTINCT t.${q(col)})`,
        };
        if (!map[fn]) throw new AppError(`Unknown function "${fn}"`, 'VALIDATION_ERROR', 400);
        return { alias: `${fn}_${col}`, expr: map[fn] };
      });
      if (!metrics.length) throw new AppError('Give at least one metric', 'VALIDATION_ERROR', 400);
      const limit = Math.min(Math.max(Number(args.limit) || 200, 1), 500);
      const select = [...groups.map((g) => `${g.expr} AS ${q(g.alias)}`), ...metrics.map((m: any) => `ROUND((${m.expr})::numeric, 2) AS ${q(m.alias)}`)].join(', ');
      const groupSql = groups.length ? `GROUP BY ${groups.map((_, i) => i + 1).join(', ')}` : '';
      const orderSql = groups.some((g) => TIME_DIMS[g.alias]) ? `ORDER BY ${groups.findIndex((g) => TIME_DIMS[g.alias]) + 1}` : `ORDER BY ${groups.length + 1} DESC NULLS LAST`;
      const rows = await readOnly((c) => c.query(
        `SELECT ${select}
           FROM bi.form_records r JOIN public.${q(table)} t ON t.id = r.record_id
           LEFT JOIN bi.dim_location l ON l.field_id = r.field_id
          WHERE ${where.join(' AND ')} ${groupSql} ${orderSql} LIMIT ${limit}`,
        params,
      ));
      const rs = register(state, {
        columns: [...groups.map((g) => g.alias), ...metrics.map((m: any) => m.alias)],
        rows: tidy(rows.rows).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v]))),
        total: rows.rows.length, form: formInfo(form),
      });
      return forModel(rs, 60);
    }

    case 'get_record': {
      const rec = await forms.getRecord(ctx.orgId, String(args.record_id || ''));
      if (ctx.siteIds !== null && rec.record.site_id && !ctx.siteIds.includes(rec.record.site_id)) {
        throw new AppError('Record not found', 'NOT_FOUND', 404);
      }
      state.sources.set(rec.form.form_id, { form_id: rec.form.form_id, form_key: rec.form.form_key, title_en: rec.form.title_en, title_ar: rec.form.title_ar });
      return rec;
    }

    case 'gis_feature_forms': {
      const data = await featureForms(ctx.orgId, { zoneId: args.zone_id, farmCode: args.farm_code, globalId: args.global_id, recordsPerForm: 5 });
      if (ctx.siteIds !== null) {
        data.fields = data.fields.filter((f: any) => ctx.siteIds!.includes(f.site_id));
        if (!data.fields.length) throw new AppError('No feature or field matches these keys', 'NOT_FOUND', 404);
      }
      data.forms.forEach((f: any) => state.sources.set(f.form_id, { form_id: f.form_id, form_key: f.form_key, title_en: f.title_en, title_ar: f.title_ar }));
      return data;
    }

    case 'show_result': {
      const rs = state.results.get(String(args.result_id || ''));
      if (!rs) throw new AppError(`Unknown result_id ${args.result_id}`, 'VALIDATION_ERROR', 400);
      let chart = null;
      if (args.chart && rs.columns.includes(args.chart.x)) {
        const y = (args.chart.y || []).filter((c: string) => rs.columns.includes(c));
        if (y.length) chart = { type: args.chart.type, x: args.chart.x, y };
      }
      state.artifacts.push({ kind: 'table', title: String(args.title || '').slice(0, 160), columns: rs.columns, rows: rs.rows, total: rs.total, chart, form: rs.form });
      return { shown: true, rows: rs.rows.length };
    }

    case 'sensor_readings': {
      const params: any[] = [ctx.orgId];
      const where = ['s.organization_id = $1', 'NOT l.is_deleted'];
      if (ctx.siteIds !== null) { params.push(ctx.siteIds); where.push(`l.site_id = ANY($${params.length}::uuid[])`); }
      if (args.field) { params.push(`%${String(args.field)}%`); where.push(`(l.field_name ILIKE $${params.length} OR l.gis_farm_code ILIKE $${params.length})`); }
      if (args.site) { params.push(`%${String(args.site)}%`); where.push(`l.site_name ILIKE $${params.length}`); }
      for (const [k, op] of [['from', '>='], ['to', '<=']] as const) {
        if (!args[k]) continue;
        if (!isoDate.test(String(args[k]))) throw new AppError(`${k} must be YYYY-MM-DD`, 'VALIDATION_ERROR', 400);
        params.push(args[k]); where.push(`s.date ${op} $${params.length}::date`);
      }
      const GROUPS: Record<string, string> = {
        field: 'l.field_name', site: 'l.site_name', zone: 'l.zone_code',
        day: 's.date', week: "date_trunc('week', s.date)::date", month: "to_char(s.date, 'YYYY-MM')",
      };
      const groups = (Array.isArray(args.group_by) ? args.group_by : []).filter((g: string) => GROUPS[g]).slice(0, 2);
      const limit = Math.min(Math.max(Number(args.limit) || 300, 1), 1000);
      const from = 'FROM public.soil_sensor_readings s JOIN bi.dim_location l ON l.field_id = s.field_id';
      let columns: string[];
      let sql: string;
      if (groups.length) {
        const sel = groups.map((g: string) => `${GROUPS[g]} AS ${q(g)}`);
        const m = ['moisture_pct', 'temperature_c', 'ec_dsm', 'ph'].flatMap((c) => [
          `ROUND(AVG(s.${c})::numeric, 2) AS ${q(`avg_${c}`)}`,
        ]);
        columns = [...groups, 'readings', 'avg_moisture_pct', 'avg_temperature_c', 'avg_ec_dsm', 'avg_ph', 'min_moisture_pct', 'max_moisture_pct'];
        sql = `SELECT ${[...sel, 'COUNT(*)::int AS readings', ...m, 'ROUND(MIN(s.moisture_pct)::numeric, 2) AS min_moisture_pct', 'ROUND(MAX(s.moisture_pct)::numeric, 2) AS max_moisture_pct'].join(', ')}
          ${from} WHERE ${where.join(' AND ')} GROUP BY ${groups.map((_: string, i: number) => i + 1).join(', ')} ORDER BY 1 LIMIT ${limit}`;
      } else {
        columns = ['date', 'zone', 'site', 'field', 'depth_cm', 'moisture_pct', 'temperature_c', 'ec_dsm', 'ph', 'source'];
        sql = `SELECT s.date, l.zone_code AS zone, l.site_name AS site, l.field_name AS field, s.depth_cm, s.moisture_pct, s.temperature_c, s.ec_dsm, s.ph, s.source
          ${from} WHERE ${where.join(' AND ')} ORDER BY s.date DESC, l.field_name LIMIT ${limit}`;
      }
      const res = await readOnly((c) => c.query(sql, params));
      const rows = tidy(res.rows).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v])));
      const rs = register(state, { title: 'Soil sensor readings', columns, rows, total: rows.length });
      return forModel(rs, 60);
    }

    case 'equipment_positions': {
      if (!GPS_READER_ROLES.includes(ctx.role)) throw new AppError('Your role cannot view equipment tracking.', 'FORBIDDEN', 403);
      const params: any[] = [ctx.orgId];
      const where = ['e.organization_id = $1'];
      if (args.equipment) { params.push(`%${String(args.equipment)}%`); where.push(`(e.name ILIKE $${params.length} OR e.identifier ILIKE $${params.length})`); }
      let sql: string;
      let columns: string[];
      if (args.date) {
        if (!isoDate.test(String(args.date))) throw new AppError('date must be YYYY-MM-DD', 'VALIDATION_ERROR', 400);
        params.push(args.date);
        columns = ['equipment', 'time', 'latitude', 'longitude', 'speed', 'heading'];
        sql = `SELECT e.name AS equipment, to_char(p.recorded_at, 'HH24:MI') AS time, p.latitude, p.longitude, p.speed, p.heading
          FROM public.gps_positions p JOIN public.equipment e ON e.id = p.equipment_id
          WHERE ${where.join(' AND ')} AND p.recorded_at::date = $${params.length}::date
          ORDER BY e.name, p.recorded_at LIMIT 1000`;
      } else {
        columns = ['equipment', 'type', 'identifier', 'active', 'last_seen', 'latitude', 'longitude', 'speed'];
        sql = `SELECT e.name AS equipment, e.type, e.identifier, e.is_active AS active,
                 to_char(p.recorded_at, 'YYYY-MM-DD HH24:MI') AS last_seen, p.latitude, p.longitude, p.speed
          FROM public.equipment e
          LEFT JOIN LATERAL (SELECT * FROM public.gps_positions g WHERE g.equipment_id = e.id ORDER BY g.recorded_at DESC LIMIT 1) p ON true
          WHERE ${where.join(' AND ')} ORDER BY e.name LIMIT 300`;
      }
      const res = await readOnly((c) => c.query(sql, params));
      const rows = tidy(res.rows).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v])));
      const rs = register(state, { title: 'Equipment tracking', columns, rows, total: rows.length });
      return forModel(rs, 60);
    }

    case 'soil_properties': {
      const depths: number[] = (Array.isArray(args.depths) && args.depths.length ? args.depths : [0, 30, 60]).map(Number);
      let title = 'Soil properties';
      let profile: any;
      if (args.field) {
        const params: any[] = [ctx.orgId, `%${String(args.field)}%`];
        let siteClause = '';
        if (ctx.siteIds !== null) { params.push(ctx.siteIds); siteClause = ` AND l.site_id = ANY($${params.length}::uuid[])`; }
        const found = await readOnly((c) => c.query(
          `SELECT l.field_id, l.field_name, l.site_name, l.field_type FROM bi.dim_location l
            WHERE l.organization_id = $1 AND NOT l.is_deleted${siteClause} AND (l.field_name ILIKE $2 OR l.gis_farm_code ILIKE $2)
            ORDER BY l.field_name LIMIT 1`, params,
        ));
        const f = found.rows[0];
        if (!f) throw new AppError(`No field matches "${args.field}" among the fields you can see.`, 'NOT_FOUND', 404);
        const applies = soilGrids.soilApplies(f.field_type);
        if (!applies.allowed) return { not_applicable: true, field: f.field_name, field_type: f.field_type, message: applies.reason };
        title = `Soil properties · ${f.field_name}`;
        const stored = await readOnly((c) => c.query(
          `SELECT dataset, depth_cm, value_num, value_text, unit FROM field_soil_properties WHERE organization_id = $1 AND field_id = $2`, [ctx.orgId, f.field_id],
        ));
        if (stored.rows.length) {
          const byKey = new Map<string, any>();
          stored.rows.forEach((r: any) => {
            const d = soilGrids.getDataset(r.dataset);
            const row = byKey.get(r.dataset) || { property: d?.label || r.dataset, unit: r.unit || '' };
            if (depths.includes(Number(r.depth_cm))) row[`${r.depth_cm}cm`] = r.value_text ?? (r.value_num === null ? null : Number(r.value_num));
            byKey.set(r.dataset, row);
          });
          profile = { rows: [...byKey.values()], source: 'OpenLandMap (saved field profile)' };
        } else {
          const c = await soilGrids.fieldCentroid(ctx.orgId, f.field_id);
          if (!c) throw new AppError(`${f.field_name} has no polygon yet, so its soil cannot be read from the maps.`, 'NOT_FOUND', 404);
          profile = await soilGrids.pointProfile(c.lon, c.lat, undefined, depths);
        }
      } else if (Number.isFinite(Number(args.lat)) && Number.isFinite(Number(args.lon))) {
        profile = await soilGrids.pointProfile(Number(args.lon), Number(args.lat), undefined, depths);
        title = `Soil properties · ${Number(args.lat).toFixed(4)}, ${Number(args.lon).toFixed(4)}`;
      } else {
        throw new AppError('Give a field or a latitude and longitude.', 'VALIDATION_ERROR', 400);
      }
      const columns = ['property', 'unit', ...depths.map((d) => `${d}cm`)];
      const rows = profile.rows.map((r: any) => Object.fromEntries(columns.map((k) => [k, r[k] ?? null])));
      const rs = register(state, { title, columns, rows, total: rows.length });
      return { ...forModel(rs, 20), source: profile.source, note: 'Modelled from global soil maps at 250 m; confirm with a lab test before fertiliser decisions.' };
    }

    case 'app_guide': {
      const topic = String(args.topic || '').toLowerCase();
      const list = SCREENS.filter(([n, , d]) => !topic || `${n} ${d}`.toLowerCase().includes(topic));
      return (list.length ? list : SCREENS).map(([screen, path, what]) => ({ screen, path, what }));
    }

    default:
      throw new AppError(`Unknown tool ${name}`, 'VALIDATION_ERROR', 400);
  }
}
