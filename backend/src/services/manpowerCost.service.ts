import { dbPool } from '../db/client';
import { AppError, NotFoundError } from '../utils/errors';
import { assertSiteInOrganization } from '../utils/tenantValidation';
import {
  buildCostSummary,
  buildWorkerCostLines,
  costRows,
  type CostInputRow,
} from '../utils/manpowerCost';

export type WorkerCategory = 'Casual' | 'Permanent';

export type CostFilters = {
  startDate: string;
  endDate: string;
  siteId?: string;
};

const RATE_SELECT = `
  mr.id, mr.site_id, s.name AS site_name, mr.category, mr.worker_id,
  w.employee_id, w.name AS worker_name, w.category AS worker_category,
  mr.rate_per_hour, to_char(mr.effective_from, 'YYYY-MM-DD') AS effective_from,
  mr.note, mr.created_by, u.name AS created_by_name, mr.created_at`;

function formatRate(row: any) {
  return {
    id: row.id,
    siteId: row.site_id,
    siteName: row.site_name ?? null,
    category: row.category ?? null,
    workerId: row.worker_id ?? null,
    employeeId: row.employee_id ?? null,
    workerName: row.worker_name ?? null,
    workerCategory: row.worker_category ?? null,
    ratePerHour: row.rate_per_hour == null ? null : Number(row.rate_per_hour),
    effectiveFrom: row.effective_from,
    note: row.note ?? null,
    createdBy: row.created_by ?? null,
    createdByName: row.created_by_name ?? null,
    createdAt: row.created_at,
  };
}

/** All live rate rows (group + personal), newest start date first. */
export async function listRates(organizationId: string, filters: { siteId?: string } = {}) {
  const params: any[] = [organizationId];
  let siteCondition = '';
  if (filters.siteId) {
    params.push(filters.siteId);
    siteCondition = `AND (mr.site_id = $2 OR w.site_id = $2)`;
  }
  const result = await dbPool.query(
    `SELECT ${RATE_SELECT}
     FROM manpower_rates mr
     LEFT JOIN sites s ON s.id = mr.site_id
     LEFT JOIN workers w ON w.id = mr.worker_id
     LEFT JOIN users u ON u.id = mr.created_by
     WHERE mr.organization_id = $1 AND mr.deleted_at IS NULL ${siteCondition}
     ORDER BY mr.effective_from DESC, mr.created_at DESC`,
    params,
  );
  const rows = result.rows.map(formatRate);
  return {
    groupRates: rows.filter((r) => r.workerId == null),
    workerRates: rows.filter((r) => r.workerId != null),
  };
}

async function insertReplacingSameDay(
  organizationId: string,
  userId: string,
  keyCondition: string,
  keyParams: any[],
  insert: { siteId: string | null; category: string | null; workerId: string | null; ratePerHour: number | null; effectiveFrom: string; note?: string | null },
) {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    // A second rate on the same start date is a correction: retire the old row, keep it as history.
    await client.query(
      `UPDATE manpower_rates SET deleted_at = NOW(), deleted_by = $2
       WHERE organization_id = $1 AND deleted_at IS NULL AND effective_from = $3 AND ${keyCondition}`,
      [organizationId, userId, insert.effectiveFrom, ...keyParams],
    );
    const result = await client.query(
      `INSERT INTO manpower_rates (organization_id, site_id, category, worker_id, rate_per_hour, effective_from, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        organizationId,
        insert.siteId,
        insert.category,
        insert.workerId,
        insert.ratePerHour,
        insert.effectiveFrom,
        insert.note || null,
        userId,
      ],
    );
    await client.query('COMMIT');
    return result.rows[0].id as string;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function getRateById(organizationId: string, id: string) {
  const result = await dbPool.query(
    `SELECT ${RATE_SELECT}
     FROM manpower_rates mr
     LEFT JOIN sites s ON s.id = mr.site_id
     LEFT JOIN workers w ON w.id = mr.worker_id
     LEFT JOIN users u ON u.id = mr.created_by
     WHERE mr.id = $1 AND mr.organization_id = $2 AND mr.deleted_at IS NULL`,
    [id, organizationId],
  );
  if (!result.rows[0]) throw new NotFoundError('Rate not found');
  return formatRate(result.rows[0]);
}

export async function setGroupRate(
  organizationId: string,
  userId: string,
  data: { siteId: string; category: WorkerCategory; ratePerHour: number; effectiveFrom: string; note?: string | null },
) {
  await assertSiteInOrganization(data.siteId, organizationId);
  // Positions $1–$3 are organization, user, effective_from inside insertReplacingSameDay.
  const id = await insertReplacingSameDay(
    organizationId,
    userId,
    'worker_id IS NULL AND site_id = $4 AND category = $5',
    [data.siteId, data.category],
    { siteId: data.siteId, category: data.category, workerId: null, ratePerHour: data.ratePerHour, effectiveFrom: data.effectiveFrom, note: data.note },
  );
  return getRateById(organizationId, id);
}

/** ratePerHour null = the worker goes back on the group rate from effectiveFrom. */
export async function setWorkerRate(
  organizationId: string,
  userId: string,
  data: { workerId: string; ratePerHour: number | null; effectiveFrom: string; note?: string | null },
) {
  const worker = await dbPool.query(
    `SELECT id FROM workers WHERE id = $1 AND organization_id = $2`,
    [data.workerId, organizationId],
  );
  if (!worker.rows[0]) throw new AppError('Worker not found in organization', 'FORBIDDEN', 403);
  const id = await insertReplacingSameDay(
    organizationId,
    userId,
    'worker_id = $4',
    [data.workerId],
    { siteId: null, category: null, workerId: data.workerId, ratePerHour: data.ratePerHour, effectiveFrom: data.effectiveFrom, note: data.note },
  );
  return getRateById(organizationId, id);
}

export async function deleteRate(organizationId: string, userId: string, id: string) {
  const result = await dbPool.query(
    `UPDATE manpower_rates SET deleted_at = NOW(), deleted_by = $3
     WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
     RETURNING id`,
    [id, organizationId, userId],
  );
  if (!result.rows[0]) throw new NotFoundError('Rate not found');
}

/**
 * One row per approved manpower record in the period, with the personal and group rate
 * in force on that record's date. Hours use the same rule as the Work Hours pivot.
 * Category and home site are the worker's current ones (no history is kept for them).
 */
export async function fetchCostInputRows(organizationId: string, filters: CostFilters): Promise<CostInputRow[]> {
  const params: any[] = [organizationId, filters.startDate, filters.endDate];
  let siteCondition = '';
  if (filters.siteId) {
    params.push(filters.siteId);
    siteCondition = `AND w.site_id = $4`;
  }
  const result = await dbPool.query(
    `SELECT r.id AS record_id,
            to_char(r.record_date, 'YYYY-MM-DD') AS record_date,
            r.worker_id, w.employee_id, w.name AS worker_name, w.category,
            w.site_id, s.name AS site_name,
            COALESCE(r.activity, '') AS activity,
            GREATEST(COALESCE(r.work_hours,
              EXTRACT(EPOCH FROM (r.end_time - r.start_time)) / 3600.0, 0), 0) AS hours,
            pr.id AS personal_rate_id,
            pr.rate_per_hour AS personal_rate,
            gr.rate_per_hour AS group_rate
     FROM manpower_records r
     JOIN workers w ON w.id = r.worker_id
     LEFT JOIN sites s ON s.id = w.site_id
     LEFT JOIN LATERAL (
       SELECT mr.id, mr.rate_per_hour
       FROM manpower_rates mr
       WHERE mr.organization_id = $1 AND mr.deleted_at IS NULL
         AND mr.worker_id = r.worker_id
         AND mr.effective_from <= r.record_date
       ORDER BY mr.effective_from DESC, mr.created_at DESC
       LIMIT 1
     ) pr ON TRUE
     LEFT JOIN LATERAL (
       SELECT mr.rate_per_hour
       FROM manpower_rates mr
       WHERE mr.organization_id = $1 AND mr.deleted_at IS NULL
         AND mr.worker_id IS NULL
         AND mr.site_id = w.site_id
         AND mr.category = w.category
         AND mr.effective_from <= r.record_date
       ORDER BY mr.effective_from DESC, mr.created_at DESC
       LIMIT 1
     ) gr ON TRUE
     WHERE r.deleted_at IS NULL
       AND r.approval_status = 'approved'
       AND COALESCE(r.organization_id, w.organization_id) = $1
       AND r.record_date >= $2::date
       AND r.record_date <= $3::date
       ${siteCondition}
     ORDER BY r.record_date, w.name`,
    params,
  );
  return result.rows.map((row: any) => ({
    recordId: row.record_id,
    date: row.record_date,
    workerId: row.worker_id,
    employeeId: row.employee_id || '',
    workerName: row.worker_name || '',
    category: row.category || '',
    siteId: row.site_id ?? null,
    siteName: row.site_name || '',
    activity: row.activity || '',
    hours: Number(row.hours) || 0,
    personalRateFound: row.personal_rate_id != null,
    personalRate: row.personal_rate == null ? null : Number(row.personal_rate),
    groupRate: row.group_rate == null ? null : Number(row.group_rate),
  }));
}

export async function getCostDetail(organizationId: string, filters: CostFilters) {
  const costed = costRows(await fetchCostInputRows(organizationId, filters));
  const summary = buildCostSummary(costed);
  return { lines: buildWorkerCostLines(costed), totals: summary.totals };
}

export async function getCostSummary(organizationId: string, filters: CostFilters) {
  const costed = costRows(await fetchCostInputRows(organizationId, filters));
  return buildCostSummary(costed);
}
