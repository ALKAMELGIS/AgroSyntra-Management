import { dbPool } from '../db/client';
import { AppError } from '../utils/errors';

/**
 * Persistent Form Identity & Data Integration Layer (read side).
 *
 * Every form has a permanent FORM_ID (UUID v5 of its FORM_KEY) and FORM_PATH
 * (see migration 174). This service reads forms and their records through the
 * registry, so one API serves any form without per-form code, and every value
 * carries the FORM_ID of the form it came from. It never writes record data.
 */

export interface FormRow {
  form_id: string;
  form_key: string;
  form_path: string;
  title_en: string;
  title_ar: string | null;
  category: string;
  ui_route: string | null;
  template_slug: string | null;
  organization_id: string | null;
  status: string;
  version: number;
}

export interface RegistryTable {
  table_name: string;
  role: 'records' | 'lines' | 'photos';
  parent_table: string | null;
  parent_key: string | null;
  date_column: string | null;
  attachment_entity: string | null;
  template_column: string | null;
  is_default: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDENT_RE = /^[a-z_][a-z0-9_]{0,62}$/;

/** Table and column names come from form_registry_tables, never from a request; still checked before use. */
function ident(name: string): string {
  if (!IDENT_RE.test(name)) throw new AppError(`Invalid identifier: ${name}`, 'INTERNAL_ERROR', 500);
  return `"${name}"`;
}

// Geometry / binary columns are left out of record values (GIS reads shapes from fields / gis_features).
const skippedColumns = new Map<string, string[]>();
async function columnsToSkip(table: string): Promise<string[]> {
  const cached = skippedColumns.get(table);
  if (cached) return cached;
  const { rows } = await dbPool.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 AND udt_name IN ('geometry', 'geography', 'bytea')`,
    [table],
  );
  const cols = rows.map((r: any) => r.column_name as string);
  skippedColumns.set(table, cols);
  return cols;
}

async function rowsById(table: string, ids: string[], keyColumn = 'id'): Promise<any[]> {
  if (!ids.length) return [];
  const skip = await columnsToSkip(table);
  const minus = skip.map((c) => ` - '${c}'`).join('');
  const { rows } = await dbPool.query(
    `SELECT to_jsonb(t)${minus} AS doc FROM public.${ident(table)} t WHERE t.${ident(keyColumn)} = ANY($1::uuid[])`,
    [ids],
  );
  return rows.map((r: any) => r.doc);
}

const FORM_COLUMNS = `form_id, form_key, form_path, title_en, title_ar, category, ui_route, template_slug,
  organization_id, status, version, created_at, updated_at`;

export async function listForms(orgId: string, opts: { includeCounts?: boolean; includeRetired?: boolean } = {}) {
  const { rows } = await dbPool.query(
    `SELECT ${FORM_COLUMNS} FROM form_registry
      WHERE (organization_id IS NULL OR organization_id = $1)
        AND ($2::boolean OR status = 'active')
      ORDER BY category, form_path`,
    [orgId, Boolean(opts.includeRetired)],
  );
  const tables = await dbPool.query(
    `SELECT form_id, table_name, role, parent_table, parent_key FROM form_registry_tables ORDER BY role, table_name`,
  );
  const byForm = new Map<string, any[]>();
  tables.rows.forEach((t: any) => {
    const list = byForm.get(t.form_id) || [];
    list.push({ table: t.table_name, role: t.role, parentTable: t.parent_table, parentKey: t.parent_key });
    byForm.set(t.form_id, list);
  });
  let counts = new Map<string, { records: number; last_updated_at: string | null }>();
  if (opts.includeCounts) {
    const c = await dbPool.query(
      `SELECT form_id, COUNT(*)::int AS records, MAX(updated_at) AS last_updated_at
         FROM bi.form_records WHERE organization_id = $1 GROUP BY form_id`,
      [orgId],
    );
    counts = new Map(c.rows.map((r: any) => [r.form_id, { records: r.records, last_updated_at: r.last_updated_at }]));
  }
  return rows.map((f: any) => ({
    ...f,
    tables: byForm.get(f.form_id) || [],
    ...(opts.includeCounts ? { record_count: counts.get(f.form_id)?.records ?? 0, last_updated_at: counts.get(f.form_id)?.last_updated_at ?? null } : {}),
  }));
}

/** A form by FORM_ID, FORM_KEY or FORM_PATH. */
export async function resolveForm(ref: string, orgId: string): Promise<FormRow> {
  const value = String(ref || '').trim().replace(/^\/+|\/+$/g, '');
  if (!value) throw new AppError('Form reference is required', 'VALIDATION_ERROR', 400);
  const byId = UUID_RE.test(value);
  const { rows } = await dbPool.query(
    `SELECT ${FORM_COLUMNS} FROM form_registry
      WHERE (organization_id IS NULL OR organization_id = $2)
        AND (${byId ? 'form_id = $1::uuid' : 'form_key = $1 OR form_path = $1'})
      LIMIT 1`,
    [value, orgId],
  );
  if (!rows.length) throw new AppError(`Form not found: ${value}`, 'NOT_FOUND', 404);
  return rows[0];
}

export async function getFormTables(formId: string): Promise<RegistryTable[]> {
  const { rows } = await dbPool.query(
    `SELECT table_name, role, parent_table, parent_key, date_column, attachment_entity, template_column, is_default
       FROM form_registry_tables WHERE form_id = $1 ORDER BY CASE role WHEN 'records' THEN 0 ELSE 1 END, table_name`,
    [formId],
  );
  return rows;
}

/** Form definition: tables, every column (the form's fields) and template column layouts. */
export async function getFormSchema(form: FormRow, orgId: string) {
  const tables = await getFormTables(form.form_id);
  const fields = await dbPool.query(
    `SELECT table_name, role, field_key, data_type, ordinal_position, nullable
       FROM bi.form_fields WHERE form_id = $1 ORDER BY role, table_name, ordinal_position`,
    [form.form_id],
  );
  const templates = await dbPool.query(
    `SELECT id, slug, name, organization_id, columns_config
       FROM form_templates WHERE form_id = $1 AND (organization_id IS NULL OR organization_id = $2)`,
    [form.form_id, orgId],
  );
  return {
    ...form,
    tables: tables.map((t) => ({
      table: t.table_name, role: t.role, parentTable: t.parent_table, parentKey: t.parent_key,
      dateColumn: t.date_column, attachmentEntity: t.attachment_entity,
    })),
    fields: fields.rows,
    templates: templates.rows,
  };
}

export interface RecordQuery {
  from?: string;
  to?: string;
  siteId?: string;
  fieldId?: string;
  updatedSince?: string;
  limit?: number;
  cursor?: string;
  includeValues?: boolean;
}

const encodeCursor = (updatedAt: string, id: string) =>
  Buffer.from(JSON.stringify([updatedAt, id])).toString('base64url');
function decodeCursor(cursor?: string): [string, string] | null {
  if (!cursor) return null;
  try {
    const v = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (Array.isArray(v) && v.length === 2 && UUID_RE.test(v[1])) return [String(v[0]), String(v[1])];
  } catch { /* fall through */ }
  throw new AppError('Invalid cursor', 'VALIDATION_ERROR', 400);
}

/**
 * Records of one form, oldest change first, keyset-paged on (updated_at, record_id)
 * so Power BI incremental refresh can pass updated_since and the cursor.
 */
export async function listRecords(form: FormRow, orgId: string, q: RecordQuery = {}) {
  const limit = Math.min(Math.max(Number(q.limit) || 200, 1), 1000);
  const where: string[] = ['r.form_id = $1', 'r.organization_id = $2'];
  const vals: any[] = [form.form_id, orgId];
  const add = (sql: string, v: any) => { vals.push(v); where.push(sql.replace('?', `$${vals.length}`)); };
  if (q.from) add('r.record_date >= ?::date', q.from);
  if (q.to) add('r.record_date <= ?::date', q.to);
  if (q.siteId) add('r.site_id = ?::uuid', q.siteId);
  if (q.fieldId) add('r.field_id = ?::uuid', q.fieldId);
  if (q.updatedSince) add('r.updated_at > ?::timestamptz', q.updatedSince);
  const cur = decodeCursor(q.cursor);
  if (cur) {
    vals.push(cur[0], cur[1]);
    where.push(`(r.updated_at, r.record_id) > ($${vals.length - 1}::timestamptz, $${vals.length}::uuid)`);
  }
  vals.push(limit + 1);
  const { rows } = await dbPool.query(
    `SELECT r.form_id, r.record_id, r.source_table, r.organization_id, r.site_id, r.field_id,
            r.record_date, r.created_at, r.updated_at,
            l.zone_code, l.site_name, l.farm_area_name, l.field_name
       FROM bi.form_records r
       LEFT JOIN bi.dim_location l ON l.field_id = r.field_id
      WHERE ${where.join(' AND ')}
      ORDER BY r.updated_at, r.record_id
      LIMIT $${vals.length}`,
    vals,
  );
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  if (q.includeValues !== false && page.length) {
    const byTable = new Map<string, string[]>();
    page.forEach((r: any) => byTable.set(r.source_table, [...(byTable.get(r.source_table) || []), r.record_id]));
    const docs = new Map<string, any>();
    for (const [table, ids] of byTable) {
      (await rowsById(table, ids)).forEach((d) => docs.set(d.id, d));
    }
    page.forEach((r: any) => { r.values = docs.get(r.record_id) || null; });
  }

  const last = page[page.length - 1];
  return {
    form: { form_id: form.form_id, form_key: form.form_key, form_path: form.form_path },
    records: page,
    nextCursor: hasMore && last ? encodeCursor(new Date(last.updated_at).toISOString(), last.record_id) : null,
  };
}

/** One record with everything attached to it: values, lines, photos, attachments, comments and relations. */
export async function getRecord(orgId: string, recordId: string, formRef?: string) {
  if (!UUID_RE.test(recordId)) throw new AppError('Invalid record id', 'VALIDATION_ERROR', 400);
  const { rows } = await dbPool.query(
    `SELECT r.*, fr.form_key, fr.form_path, fr.title_en, fr.title_ar
       FROM bi.form_records r JOIN form_registry fr ON fr.form_id = r.form_id
      WHERE r.record_id = $1 AND r.organization_id = $2`,
    [recordId, orgId],
  );
  if (!rows.length) throw new AppError('Record not found', 'NOT_FOUND', 404);
  let header = rows[0];
  if (formRef) {
    const form = await resolveForm(formRef, orgId);
    const match = rows.find((r: any) => r.form_id === form.form_id);
    if (!match) throw new AppError('Record does not belong to this form', 'NOT_FOUND', 404);
    header = match;
  }

  const [values] = await rowsById(header.source_table, [recordId]);

  // Lines / photos hang off the records table, whichever of its forms the record belongs to.
  const children = await dbPool.query(
    `SELECT DISTINCT table_name, role, parent_key FROM form_registry_tables
      WHERE parent_table = $1 AND role IN ('lines', 'photos')`,
    [header.source_table],
  );
  const lines: Record<string, any[]> = {};
  const photos: Record<string, any[]> = {};
  for (const c of children.rows) {
    const docs = await rowsById(c.table_name, [recordId], c.parent_key);
    (c.role === 'photos' ? photos : lines)[c.table_name] = docs;
  }

  const attachments = await dbPool.query(
    `SELECT attachment_id, original_name, filename, mime_type, size_bytes, url, created_at
       FROM bi.form_attachments WHERE record_id = $1 AND form_id = $2 ORDER BY created_at`,
    [recordId, header.form_id],
  );
  const comments = await dbPool.query(
    `SELECT c.id, c.comment, c.created_at, u.name AS author
       FROM entity_comments c LEFT JOIN users u ON u.id = c.user_id
      WHERE c.entity_id = $1 AND (c.organization_id IS NULL OR c.organization_id = $2)
      ORDER BY c.created_at`,
    [recordId, orgId],
  );
  const location = header.field_id
    ? (await dbPool.query(`SELECT * FROM bi.dim_location WHERE field_id = $1`, [header.field_id])).rows[0] || null
    : null;
  const gisFeatures = header.field_id ? await featuresForField(header.field_id, orgId) : [];

  return {
    form: { form_id: header.form_id, form_key: header.form_key, form_path: header.form_path, title_en: header.title_en, title_ar: header.title_ar },
    record: {
      record_id: header.record_id, source_table: header.source_table, record_date: header.record_date,
      created_at: header.created_at, updated_at: header.updated_at,
      site_id: header.site_id, field_id: header.field_id,
    },
    values: values || null,
    lines,
    photos,
    attachments: attachments.rows,
    comments: comments.rows,
    relations: { location, gisFeatures },
  };
}

/** GIS features (any synced layer of the organisation) linked to a field, with their link keys. */
export async function featuresForField(fieldId: string, orgId: string) {
  const { rows } = await dbPool.query(
    `SELECT g.id AS feature_id, g.layer_id, l.name AS layer_name, g.external_id AS object_id,
            g.properties ->> COALESCE(l.attribute_mapping ->> 'globalId', 'GlobalID')  AS global_id,
            g.properties ->> COALESCE(l.attribute_mapping ->> 'zoneId',   'ZONE_ID')   AS zone_id,
            g.properties ->> COALESCE(l.attribute_mapping ->> 'farmCode', 'Farm_Code') AS farm_code
       FROM gis_features g JOIN gis_layers l ON l.id = g.layer_id
      WHERE g.linked_field_id = $1 AND (l.organization_id IS NULL OR l.organization_id = $2)`,
    [fieldId, orgId],
  );
  return rows;
}

/** Records of every form for a set of fields, grouped by form (used by the GIS feature lookup). */
export async function formsForFields(fieldIds: string[], orgId: string, opts: { recordsPerForm?: number } = {}) {
  if (!fieldIds.length) return [];
  const per = Math.min(Math.max(Number(opts.recordsPerForm) || 20, 0), 200);
  const { rows } = await dbPool.query(
    `SELECT fr.form_id, fr.form_key, fr.form_path, fr.title_en, fr.title_ar, fr.category,
            COUNT(r.record_id)::int AS record_count, MIN(r.record_date) AS first_record_date,
            MAX(r.record_date) AS last_record_date, MAX(r.updated_at) AS last_updated_at
       FROM bi.form_records r JOIN form_registry fr ON fr.form_id = r.form_id
      WHERE r.field_id = ANY($1::uuid[]) AND r.organization_id = $2
      GROUP BY fr.form_id, fr.form_key, fr.form_path, fr.title_en, fr.title_ar, fr.category
      ORDER BY fr.category, fr.form_path`,
    [fieldIds, orgId],
  );
  if (!per) return rows;
  for (const f of rows) {
    const recs = await dbPool.query(
      `SELECT record_id, source_table, record_date, updated_at FROM bi.form_records
        WHERE form_id = $1 AND field_id = ANY($2::uuid[]) AND organization_id = $3
        ORDER BY record_date DESC NULLS LAST, updated_at DESC LIMIT $4`,
      [f.form_id, fieldIds, orgId, per],
    );
    const byTable = new Map<string, string[]>();
    recs.rows.forEach((r: any) => byTable.set(r.source_table, [...(byTable.get(r.source_table) || []), r.record_id]));
    const docs = new Map<string, any>();
    for (const [table, ids] of byTable) (await rowsById(table, ids)).forEach((d) => docs.set(d.id, d));
    f.records = recs.rows.map((r: any) => ({ ...r, values: docs.get(r.record_id) || null }));
  }
  return rows;
}

/** Flat CSV of one form's records (header columns + values), for tools that prefer files. */
export function toCsv(records: any[]): string {
  const keys = new Set<string>(['form_id', 'record_id', 'record_date', 'zone_code', 'site_name', 'farm_area_name', 'field_name', 'updated_at']);
  records.forEach((r) => Object.keys(r.values || {}).forEach((k) => keys.add(k)));
  const cols = [...keys];
  const cell = (v: any) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.join(',')];
  records.forEach((r) => {
    lines.push(cols.map((c) => cell(c in r && c !== 'values' ? r[c] : r.values?.[c])).join(','));
  });
  return lines.join('\r\n');
}
