import { dbPool } from '../db/client';

export interface BatchTraceVariety {
  variety: string;
  quantity: number;
  grade: string | null;
}

export interface BatchTraceWorkforceWorker {
  workerId: string;
  employeeId: string;
  workerName: string;
  section: string | null;
  startTime: string | null;
  endTime: string | null;
  actual: number | null;
}

export interface BatchTraceWorkforceTeam {
  teamLeaderId: string | null;
  teamLeaderName: string | null;
  workers: BatchTraceWorkforceWorker[];
}

export interface BatchTracePhiConflict {
  applicationId: string;
  productName: string;
  sprayDate: string;
  phiEndDate: string;
  phiDays: number;
  daysViolated: number;
  segmentId: string | null;
  cropName: string | null;
  operatorName: string | null;
}

export interface BatchTraceScoutingObservation {
  pestName: string;
  category: string;
  percent: number | null;
  average: number | null;
}

export interface BatchTraceScoutingReport {
  id: string;
  reportDate: string;
  reportTime: string | null;
  scoutName: string | null;
  cropName: string | null;
  variety: string | null;
  comments: string | null;
  observations: BatchTraceScoutingObservation[];
}

export interface BatchTraceHarvest {
  id: string;
  batchNumber: string;
  date: string;
  fieldId: string;
  fieldName: string;
  siteId: string | null;
  siteName: string | null;
  segmentId: string | null;
  packhouse: string | null;
  shiftNumber: string | null;
  startTime: string | null;
  endTime: string | null;
  authorizedBy: string | null;
  totalQuantity: number;
  notes: string | null;
}

export interface BatchTraceMatch {
  harvest: BatchTraceHarvest;
  varieties: BatchTraceVariety[];
  workforce: BatchTraceWorkforceTeam[];
  phiConflicts: BatchTracePhiConflict[];
  scoutingReports: BatchTraceScoutingReport[];
}

export interface BatchTraceResult {
  batchNumber: string;
  matches: BatchTraceMatch[];
}

const SEGMENT_MATCH_SQL = `
  pa.segment_id = 'ALL'
  OR (h.segment_id IS NULL AND pa.segment_id IS NULL)
  OR LOWER(TRIM(h.segment_id)) = LOWER(TRIM(pa.segment_id))
`;

/** node-pg returns DATE columns as JS Date objects; normalize to YYYY-MM-DD for SQL/API. */
function toIsoDateString(value: unknown): string {
  if (value == null || value === '') return '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    return value.toISOString().slice(0, 10);
  }
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return s;
}

function toTimeString(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) return value.toISOString().slice(11, 19);
  const s = String(value);
  const match = s.match(/(\d{2}:\d{2}(:\d{2})?)/);
  return match ? match[1] : s;
}

function mapHarvestRow(row: Record<string, unknown>): BatchTraceHarvest {
  return {
    id: String(row.id),
    batchNumber: String(row.batch_number ?? ''),
    date: toIsoDateString(row.date),
    fieldId: String(row.field_id),
    fieldName: String(row.field_name ?? ''),
    siteId: row.site_id ? String(row.site_id) : null,
    siteName: row.site_name ? String(row.site_name) : null,
    segmentId: row.segment_id ? String(row.segment_id) : null,
    packhouse: row.packhouse ? String(row.packhouse) : null,
    shiftNumber: row.shift_number ? String(row.shift_number) : null,
    startTime: toTimeString(row.start_time),
    endTime: toTimeString(row.end_time),
    authorizedBy: row.authorized_by ? String(row.authorized_by) : null,
    totalQuantity: Number(row.total_quantity),
    notes: row.notes ? String(row.notes) : null,
  };
}

async function fetchHarvestsByBatch(batchNumber: string, organizationId: string): Promise<Record<string, unknown>[]> {
  const result = await dbPool.query(
    `SELECT h.*,
            f.name AS field_name,
            fa.site_id,
            s.name AS site_name
     FROM harvests h
     JOIN fields f ON f.id = h.field_id
     LEFT JOIN farm_areas fa ON fa.id = f.farm_area_id
     LEFT JOIN sites s ON s.id = fa.site_id
     WHERE LOWER(TRIM(h.batch_number)) = LOWER(TRIM($1))
       AND COALESCE(h.organization_id, f.organization_id) = $2
     ORDER BY h.date DESC, f.name ASC`,
    [batchNumber.trim(), organizationId]
  );
  return result.rows;
}

async function fetchVarieties(harvestId: string): Promise<BatchTraceVariety[]> {
  const result = await dbPool.query(
    `SELECT variety, quantity, grade
     FROM harvest_varieties
     WHERE harvest_id = $1
     ORDER BY variety ASC`,
    [harvestId]
  );
  return result.rows.map((row) => ({
    variety: String(row.variety),
    quantity: Number(row.quantity),
    grade: row.grade ? String(row.grade) : null,
  }));
}

async function fetchPhiConflicts(harvestId: string): Promise<BatchTracePhiConflict[]> {
  const result = await dbPool.query(
    `SELECT
       pa.id AS application_id,
       pp.name AS product_name,
       pa.application_date AS spray_date,
       pa.phi_end_date,
       pp.phi_days,
       (pa.phi_end_date::date - h.date) AS days_violated,
       pa.segment_id,
       pa.crop_name,
       pa.operator_name
     FROM harvests h
     JOIN pesticide_applications pa
       ON pa.field_id = h.field_id
       AND pa.approval_status = 'approved'
       AND h.date >= pa.application_date
       AND h.date < pa.phi_end_date::date
       AND (${SEGMENT_MATCH_SQL})
     JOIN pesticide_products pp ON pp.id = pa.product_id
     WHERE h.id = $1
     ORDER BY pa.application_date DESC`,
    [harvestId]
  );

  return result.rows.map((row) => ({
    applicationId: String(row.application_id),
    productName: String(row.product_name),
    sprayDate: toIsoDateString(row.spray_date),
    phiEndDate: toIsoDateString(row.phi_end_date),
    phiDays: Number(row.phi_days ?? 0),
    daysViolated: Math.max(0, Number(row.days_violated)),
    segmentId: row.segment_id ? String(row.segment_id) : null,
    cropName: row.crop_name ? String(row.crop_name) : null,
    operatorName: row.operator_name ? String(row.operator_name) : null,
  }));
}

async function fetchWorkforce(
  fieldName: string,
  harvestDate: string,
  startTime: string | null,
  endTime: string | null
): Promise<BatchTraceWorkforceTeam[]> {
  const params: Array<string> = [fieldName, harvestDate];
  let timeClause = '';

  if (startTime && endTime) {
    params.push(startTime, endTime);
    timeClause = `
      AND (
        (r.start_time IS NULL AND r.end_time IS NULL)
        OR (r.start_time <= $4::time AND r.end_time >= $3::time)
      )`;
  }

  const result = await dbPool.query(
    `SELECT r.worker_id,
            w.employee_id,
            w.name AS worker_name,
            r.section,
            r.start_time,
            r.end_time,
            r.actual,
            r.submitted_by,
            tl.name AS team_leader_name
     FROM manpower_records r
     JOIN workers w ON w.id = r.worker_id
     LEFT JOIN workers tl ON tl.id = r.submitted_by
     WHERE r.deleted_at IS NULL
       AND r.record_date = $2::date
       AND LOWER(TRIM(r.location)) = LOWER(TRIM($1))
       AND r.activity ILIKE 'Harvesting'
       ${timeClause}
     ORDER BY tl.name NULLS LAST, w.name ASC, r.task_sequence ASC`,
    params
  );

  const teams = new Map<string, BatchTraceWorkforceTeam>();

  for (const row of result.rows) {
    const leaderKey = row.submitted_by ? String(row.submitted_by) : '__none__';
    if (!teams.has(leaderKey)) {
      teams.set(leaderKey, {
        teamLeaderId: row.submitted_by ? String(row.submitted_by) : null,
        teamLeaderName: row.team_leader_name ? String(row.team_leader_name) : null,
        workers: [],
      });
    }

    teams.get(leaderKey)!.workers.push({
      workerId: String(row.worker_id),
      employeeId: String(row.employee_id),
      workerName: String(row.worker_name),
      section: row.section ? String(row.section) : null,
      startTime: toTimeString(row.start_time),
      endTime: toTimeString(row.end_time),
      actual: row.actual != null ? Number(row.actual) : null,
    });
  }

  return Array.from(teams.values());
}

async function fetchScoutingReports(
  fieldId: string,
  harvestDate: string
): Promise<BatchTraceScoutingReport[]> {
  const result = await dbPool.query(
    `SELECT sr.id,
            sr.report_date,
            sr.report_time,
            u.name AS scout_name,
            sr.crop_name,
            sr.variety,
            sr.comments,
            (SELECT json_agg(json_build_object(
              'pestName', so.pest_name,
              'category', so.category,
              'percent', so.percent,
              'average', so.average
            ) ORDER BY so.category, so.pest_name)
             FROM scouting_observations so
             WHERE so.scouting_report_id = sr.id) AS observations
     FROM scouting_reports sr
     LEFT JOIN users u ON u.id = sr.scout_user_id
     WHERE sr.field_id = $1
       AND sr.report_date >= ($2::date - INTERVAL '30 days')
       AND sr.report_date <= $2::date
     ORDER BY sr.report_date DESC, sr.created_at DESC
     LIMIT 20`,
    [fieldId, harvestDate]
  );

  return result.rows.map((row) => ({
    id: String(row.id),
    reportDate: toIsoDateString(row.report_date),
    reportTime: toTimeString(row.report_time),
    scoutName: row.scout_name ? String(row.scout_name) : null,
    cropName: row.crop_name ? String(row.crop_name) : null,
    variety: row.variety ? String(row.variety) : null,
    comments: row.comments ? String(row.comments) : null,
    observations: Array.isArray(row.observations)
      ? row.observations.map((obs: Record<string, unknown>) => ({
          pestName: String(obs.pestName ?? ''),
          category: String(obs.category ?? ''),
          percent: obs.percent != null ? Number(obs.percent) : null,
          average: obs.average != null ? Number(obs.average) : null,
        }))
      : [],
  }));
}

export async function traceByBatchNumber(batchNumber: string, organizationId: string): Promise<BatchTraceResult> {
  const trimmed = batchNumber.trim();
  if (!trimmed) {
    return { batchNumber: trimmed, matches: [] };
  }

  const harvestRows = await fetchHarvestsByBatch(trimmed, organizationId);
  const matches: BatchTraceMatch[] = [];

  for (const row of harvestRows) {
    const harvest = mapHarvestRow(row);
    const [varieties, phiConflicts, workforce] = await Promise.all([
      fetchVarieties(harvest.id),
      fetchPhiConflicts(harvest.id),
      fetchWorkforce(harvest.fieldName, harvest.date, harvest.startTime, harvest.endTime),
    ]);

    const scoutingReports = phiConflicts.length > 0
      ? await fetchScoutingReports(harvest.fieldId, harvest.date)
      : [];

    matches.push({
      harvest,
      varieties,
      workforce,
      phiConflicts,
      scoutingReports,
    });
  }

  return { batchNumber: trimmed, matches };
}
