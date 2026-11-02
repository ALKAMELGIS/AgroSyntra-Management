import { dbPool } from '../db/client';
import {
  aggregateObservationMetrics,
  bioProductMatchesPattern,
  buildBioColumnsFromCatalog,
  formatMetricValue,
  getColumnProfile,
  getColumnsForProfile,
  getIsoWeekAndYear,
  SummaryColumnDef,
  SummaryObservationRow,
} from '../utils/scoutingSummaryColumns';
import { getBiologicalControlSummaryCatalog } from './scouting.service';

export interface ScoutingSummaryQuery {
  organizationId: string;
  siteId?: string;
  fieldId?: string;
  year?: number;
  startDate?: string;
  endDate?: string;
}

export interface ScoutingSummaryRow {
  reportId: string;
  reportDate: string;
  cropName: string | null;
  location: string;
  metrics: Record<string, number | null>;
  notes: string | null;
}

export interface ScoutingSummaryField {
  fieldId: string;
  fieldName: string;
  fieldTypeName: string | null;
  columnProfile: 'standard' | 'bl_block';
  columns: SummaryColumnDef[];
  rows: ScoutingSummaryRow[];
}

export interface ScoutingSummaryResult {
  year: number;
  columns: SummaryColumnDef[];
  fields: ScoutingSummaryField[];
}

interface ReportRow {
  id: string;
  field_id: string;
  field_name: string;
  report_date: string;
  report_time: string | null;
  created_at: string;
  crop_name: string | null;
  comments: string | null;
  observations: SummaryObservationRow[] | null;
}

interface BioEntryRow {
  field_id: string;
  year: number;
  week_number: number;
  product_name: string;
  item_code: string | null;
  per_m2: number | null;
  units: number | null;
}

function resolveYear(opts: ScoutingSummaryQuery): number {
  if (opts.year) return opts.year;
  if (opts.startDate) return Number(opts.startDate.slice(0, 4));
  return new Date().getFullYear();
}

function resolveDateRange(opts: ScoutingSummaryQuery, year: number): { startDate: string; endDate: string } {
  const startDate = opts.startDate || `${year}-01-01`;
  const endDate = opts.endDate || `${year}-12-31`;
  return { startDate, endDate };
}

function mapObservationRow(row: Record<string, unknown>): SummaryObservationRow {
  return {
    pestName: String(row.pestName ?? row.pest_name ?? ''),
    category: String(row.category ?? ''),
    total: row.total as number | null,
    average: row.average as number | null,
    count1: row.count1 as number | null,
    count2: row.count2 as number | null,
    count3: row.count3 as number | null,
    count4: row.count4 as number | null,
    count5: row.count5 as number | null,
    count6: row.count6 as number | null,
    count7: row.count7 as number | null,
    count8: row.count8 as number | null,
    count9: row.count9 as number | null,
    count10: row.count10 as number | null,
  };
}

function dedupeReportsByFieldDate(reports: ReportRow[]): ReportRow[] {
  const byKey = new Map<string, ReportRow>();

  for (const report of reports) {
    const dateKey = String(report.report_date).slice(0, 10);
    const key = `${report.field_id}:${dateKey}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, report);
      continue;
    }

    const existingTime = existing.report_time || '';
    const nextTime = report.report_time || '';
    if (nextTime > existingTime) {
      byKey.set(key, report);
      continue;
    }
    if (nextTime < existingTime) continue;

    if (new Date(report.created_at).getTime() > new Date(existing.created_at).getTime()) {
      byKey.set(key, report);
    }
  }

  return Array.from(byKey.values());
}

function buildBioLookup(entries: BioEntryRow[]): Map<string, Map<number, BioEntryRow[]>> {
  const byField = new Map<string, Map<number, BioEntryRow[]>>();

  for (const entry of entries) {
    if (!byField.has(entry.field_id)) {
      byField.set(entry.field_id, new Map());
    }
    const byWeek = byField.get(entry.field_id)!;
    if (!byWeek.has(entry.week_number)) {
      byWeek.set(entry.week_number, []);
    }
    byWeek.get(entry.week_number)!.push(entry);
  }

  return byField;
}

function applyBioMetrics(
  metrics: Record<string, number | null>,
  columns: SummaryColumnDef[],
  bioEntries: BioEntryRow[] | undefined,
): Record<string, number | null> {
  if (!bioEntries?.length) return metrics;

  for (const column of columns) {
    if (column.kind !== 'bio' || !column.bioProductPattern) continue;

    const matches = bioEntries.filter((entry) =>
      bioProductMatchesPattern(entry.product_name, entry.item_code, column.bioProductPattern!),
    );

    if (!matches.length) {
      metrics[column.key] = null;
      continue;
    }

    let value: number | null = null;
    for (const entry of matches) {
      const next = entry.per_m2 ?? entry.units;
      if (next == null || !Number.isFinite(Number(next))) continue;
      value = value == null ? Number(next) : value + Number(next);
    }
    metrics[column.key] = formatMetricValue(value);
  }

  return metrics;
}

export async function getScoutingSummary(opts: ScoutingSummaryQuery): Promise<ScoutingSummaryResult> {
  const year = resolveYear(opts);
  const { startDate, endDate } = resolveDateRange(opts, year);

  const bioCatalog = await getBiologicalControlSummaryCatalog(opts.organizationId);
  const bioColumns = buildBioColumnsFromCatalog(bioCatalog);

  let fieldWhere = 'WHERE f.organization_id = $1';
  const fieldParams: unknown[] = [opts.organizationId];
  let siteJoin = '';

  if (opts.siteId) {
    siteJoin = ' JOIN farm_areas fa ON fa.id = f.farm_area_id';
    fieldParams.push(opts.siteId);
    fieldWhere += ` AND fa.site_id = $${fieldParams.length}`;
  }

  if (opts.fieldId) {
    fieldParams.push(opts.fieldId);
    fieldWhere += ` AND f.id = $${fieldParams.length}`;
  }

  const fieldsResult = await dbPool.query<{ id: string; name: string; field_type_name: string | null }>(
    `SELECT f.id, f.name, ft.name AS field_type_name
     FROM fields f
     LEFT JOIN field_types ft ON ft.id = f.field_type_id
     ${siteJoin}
     ${fieldWhere}
     ORDER BY f.name ASC`,
    fieldParams,
  );

  const fields = fieldsResult.rows;
  const fieldIds = fields.map((f) => f.id);

  if (fieldIds.length === 0) {
    return { year, columns: getColumnsForProfile('standard', bioColumns), fields: [] };
  }

  const reportParams: unknown[] = [opts.organizationId, startDate, endDate, fieldIds];
  const reportsResult = await dbPool.query<ReportRow>(
    `SELECT DISTINCT ON (sr.field_id, sr.report_date)
            sr.id,
            sr.field_id,
            f.name AS field_name,
            sr.report_date,
            sr.report_time,
            sr.created_at,
            sr.crop_name,
            sr.comments,
            (
              SELECT COALESCE(json_agg(json_build_object(
                'pestName', so.pest_name,
                'category', so.category,
                'total', so.total,
                'average', so.average,
                'count1', so.count_1,
                'count2', so.count_2,
                'count3', so.count_3,
                'count4', so.count_4,
                'count5', so.count_5,
                'count6', so.count_6,
                'count7', so.count_7,
                'count8', so.count_8,
                'count9', so.count_9,
                'count10', so.count_10
              ) ORDER BY so.category, so.pest_name), '[]'::json)
              FROM scouting_observations so
              WHERE so.scouting_report_id = sr.id
            ) AS observations
     FROM scouting_reports sr
     JOIN fields f ON f.id = sr.field_id
     LEFT JOIN farm_areas fa ON fa.id = f.farm_area_id
     WHERE COALESCE(sr.organization_id, f.organization_id) = $1
       AND sr.report_date >= $2::date
       AND sr.report_date <= $3::date
       AND sr.field_id = ANY($4::uuid[])
       ${opts.siteId ? 'AND fa.site_id = $5' : ''}
     ORDER BY sr.field_id, sr.report_date, sr.report_time DESC NULLS LAST, sr.created_at DESC`,
    opts.siteId ? [...reportParams, opts.siteId] : reportParams,
  );

  const dedupedReports = dedupeReportsByFieldDate(reportsResult.rows);
  const reportsByField = new Map<string, ReportRow[]>();
  for (const report of dedupedReports) {
    if (!reportsByField.has(report.field_id)) {
      reportsByField.set(report.field_id, []);
    }
    reportsByField.get(report.field_id)!.push(report);
  }

  for (const list of reportsByField.values()) {
    list.sort((a, b) => String(a.report_date).localeCompare(String(b.report_date)));
  }

  const bioResult = await dbPool.query<BioEntryRow>(
    `SELECT bs.field_id,
            bs.year,
            e.week_number,
            fp.product_name,
            fp.item_code,
            e.per_m2,
            e.units
     FROM bio_record_field_setup bs
     JOIN bio_record_field_products fp ON fp.field_setup_id = bs.id
     JOIN bio_record_entries e ON e.field_setup_id = bs.id AND e.product_column_id = fp.id
     WHERE bs.field_id = ANY($1::uuid[])
       -- Approved values only: a cell holding just a pending (unapproved) value is skipped.
       AND (e.per_m2 IS NOT NULL OR e.units IS NOT NULL)
       AND EXISTS (
         SELECT 1
         FROM seasons s
         JOIN fields f ON f.id = bs.field_id
         JOIN farm_areas fa ON fa.id = f.farm_area_id AND fa.site_id = s.site_id
         WHERE s.id = bs.season_id
           AND s.start_date <= $3::date
           AND COALESCE(s.end_date, s.planned_end_date) >= $2::date
       )`,
    [fieldIds, startDate, endDate],
  );

  const bioByField = buildBioLookup(bioResult.rows);
  const summaryFields: ScoutingSummaryField[] = fields.map((field) => {
    const columnProfile = getColumnProfile(field.name);
    const columns = getColumnsForProfile(columnProfile, bioColumns);
    const fieldReports = reportsByField.get(field.id) || [];
    const fieldBio = bioByField.get(field.id);

    const rows: ScoutingSummaryRow[] = fieldReports.map((report) => {
      const observations = (report.observations || []).map((row) =>
        mapObservationRow(row as unknown as Record<string, unknown>),
      );
      const metrics = aggregateObservationMetrics(observations, columns);

      for (const [key, value] of Object.entries(metrics)) {
        metrics[key] = formatMetricValue(value);
      }

      const { week } = getIsoWeekAndYear(String(report.report_date));
      const bioEntries = fieldBio?.get(week);
      applyBioMetrics(metrics, columns, bioEntries);

      return {
        reportId: report.id,
        reportDate: String(report.report_date).slice(0, 10),
        cropName: report.crop_name,
        location: field.name,
        metrics,
        notes: report.comments,
      };
    });

    return {
      fieldId: field.id,
      fieldName: field.name,
      fieldTypeName: field.field_type_name,
      columnProfile,
      columns,
      rows,
    };
  });

  return {
    year,
    columns: getColumnsForProfile('standard', bioColumns),
    fields: summaryFields,
  };
}
