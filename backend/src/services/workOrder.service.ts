import { dbPool } from '../db/client';
import { pushNotificationService } from './push-notification.service';
import { emitAlert } from '../websocket';
import { getPhiForSiteProductCrop, schedulePHINotifications } from './ipm.service';
import { checkAndNotifyFieldHarvestConflicts } from './phiAuditLog.service';
import { AppError, NotFoundError } from '../utils/errors';
import { alignMixtureItems, assertMixtureSizes } from '../utils/mixtureGroups';
import { logger } from '../utils/logger';

const ORG_SCOPE = 'COALESCE(wo.organization_id, s.organization_id)';

function badRequest(message: string): AppError {
  return new AppError(message, 'VALIDATION_ERROR', 400);
}

// ─── List Work Orders ─────────────────────────────────────────────

export async function listWorkOrders(opts: {
  siteId?: string;
  status?: string;
  assignedTo?: string;
  organizationId: string;
  page?: number;
  limit?: number;
}): Promise<{ items: any[]; meta: any }> {
  const page = opts.page || 1;
  const limit = Math.min(opts.limit || 50, 200);
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const params: any[] = [];

  params.push(opts.organizationId);
  conditions.push(`${ORG_SCOPE} = $${params.length}`);

  if (opts.siteId) {
    params.push(opts.siteId);
    conditions.push(`wo.site_id = $${params.length}`);
  }
  if (opts.status) {
    params.push(opts.status);
    conditions.push(`wo.status = $${params.length}`);
  }
  if (opts.assignedTo) {
    params.push(opts.assignedTo);
    conditions.push(`wo.assigned_to = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  // LEFT JOIN so an order whose site was removed still shows up (org comes from the order itself).
  const siteJoin = ' LEFT JOIN sites s ON s.id = wo.site_id';

  const countRes = await dbPool.query(
    `SELECT COUNT(*) FROM spray_work_orders wo${siteJoin} ${where}`, params,
  );
  const total = parseInt(countRes.rows[0].count, 10);

  const lIdx = params.length + 1;
  const oIdx = params.length + 2;
  params.push(limit, offset);

  const result = await dbPool.query(
    `SELECT wo.*,
            ib.name AS issued_by_name,
            at.name AS assigned_to_name,
            cb.name AS completed_by_name_user,
            ab.name AS approved_by_name,
            s.name  AS site_name,
            (SELECT COUNT(*) FROM spray_work_order_items i WHERE i.work_order_id = wo.id) AS item_count
     FROM spray_work_orders wo
     ${siteJoin}
     LEFT JOIN users ib ON ib.id = wo.issued_by
     LEFT JOIN users at ON at.id = wo.assigned_to
     LEFT JOIN users cb ON cb.id = wo.completed_by
     LEFT JOIN users ab ON ab.id = wo.approved_by
     ${where}
     ORDER BY wo.created_at DESC
     LIMIT $${lIdx} OFFSET $${oIdx}`,
    params,
  );

  return { items: result.rows, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
}

// ─── Get Single Work Order ────────────────────────────────────────

/** Returns the work order with items, or null when it does not exist in the organization. */
export async function getWorkOrderById(id: string, organizationId: string): Promise<any> {
  const woRes = await dbPool.query(
    `SELECT wo.*,
            ib.name AS issued_by_name,
            at.name AS assigned_to_name,
            cb.name AS completed_by_name_user,
            ab.name AS approved_by_name,
            s.name  AS site_name
     FROM spray_work_orders wo
     LEFT JOIN users ib ON ib.id = wo.issued_by
     LEFT JOIN users at ON at.id = wo.assigned_to
     LEFT JOIN users cb ON cb.id = wo.completed_by
     LEFT JOIN users ab ON ab.id = wo.approved_by
     LEFT JOIN sites s  ON s.id  = wo.site_id
     WHERE wo.id = $1 AND ${ORG_SCOPE} = $2`,
    [id, organizationId],
  );
  if (woRes.rows.length === 0) return null;

  const wo = woRes.rows[0];

  const itemsRes = await dbPool.query(
    `SELECT i.*,
            f.name AS field_name,
            pp.name AS product_name,
            pp.active_ingredient,
            pp.phi_days AS product_phi_days
     FROM spray_work_order_items i
     LEFT JOIN fields f ON f.id = i.field_id
     LEFT JOIN pesticide_products pp ON pp.id = i.product_id
     WHERE i.work_order_id = $1
     ORDER BY i.sort_order, i.created_at`,
    [id],
  );

  wo.items = itemsRes.rows;
  return wo;
}

async function requireWorkOrder(id: string, organizationId: string): Promise<any> {
  const wo = await getWorkOrderById(id, organizationId);
  if (!wo) throw new NotFoundError('Work order not found');
  return wo;
}

/** Locks the work order row for the rest of the transaction and returns its current status. */
async function lockStatus(client: any, id: string): Promise<string> {
  const res = await client.query('SELECT status FROM spray_work_orders WHERE id = $1 FOR UPDATE', [id]);
  if (res.rows.length === 0) throw new NotFoundError('Work order not found');
  return res.rows[0].status;
}

async function assertAssignableOperator(userId: string, organizationId: string): Promise<void> {
  const res = await dbPool.query(
    `SELECT id FROM users WHERE id = $1 AND role = 'operator' AND is_active = true AND organization_id = $2`,
    [userId, organizationId],
  );
  if (res.rows.length === 0) throw badRequest('Work orders can only be assigned to an active operator in your organization');
}

/** Normalises a time input to HH:mm[:ss] for the TIME columns; accepts legacy "YYYY-MM-DDTHH:mm" values. */
export function toTimeOfDay(value: unknown): string | null {
  if (value == null || value === '') return null;
  const match = String(value).match(/(?:^|T)(\d{1,2}:\d{2}(?::\d{2})?)/);
  if (!match) throw badRequest(`Invalid time "${value}", expected HH:mm`);
  return match[1];
}

// ─── Create Work Order ────────────────────────────────────────────

export async function createWorkOrder(data: any, userId: string, organizationId: string): Promise<any> {
  if (!data.siteId) throw badRequest('Select a site before creating a work order');
  if (data.assignedTo) await assertAssignableOperator(data.assignedTo, organizationId);

  const client = await dbPool.connect();
  let wo: any;
  try {
    await client.query('BEGIN');

    const woRes = await client.query(
      `INSERT INTO spray_work_orders
         (site_id, application_type, date_issued, justification, status,
          important_instructions, issued_by, assigned_to, organization_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        data.siteId,
        data.applicationType || 'spray',
        data.dateIssued || new Date().toISOString().split('T')[0],
        data.justification || null,
        data.status === 'draft' ? 'draft' : 'issued',
        data.importantInstructions || null,
        userId,
        data.assignedTo || null,
        organizationId,
        userId,
      ],
    );
    wo = woRes.rows[0];

    if (Array.isArray(data.items)) {
      await insertItems(client, wo.id, data.items, data.siteId, data.dateIssued);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  if (wo.status === 'issued' && wo.assigned_to) {
    notifyUser(wo.assigned_to, wo.id, {
      title: `New Work Order #${wo.work_order_number} assigned to you`,
      message: `A ${wo.application_type} work order has been issued. Justification: ${wo.justification || 'N/A'}`,
      severity: 'info',
    }).catch((err) => logger.error('WO notification failed', err));
  }

  return await getWorkOrderById(wo.id, organizationId);
}

async function insertItems(client: any, workOrderId: string, items: any[], siteId: string | null, fallbackDate?: string): Promise<void> {
  assertMixtureSizes(items.map((it) => it.groupId));
  // A mixture is the same tank pass: it gets its main row's times, machinery and completed by.
  const rows = alignMixtureItems(items);
  for (let i = 0; i < rows.length; i++) {
    const item = rows[i];
    let phiDays = item.phiDays ?? 0;
    if (item.productId && siteId) {
      // The field's crop picks up the site's crop-specific PHI.
      phiDays = await phiForField(client, siteId, item.productId, item.fieldId, {
        cropName: item.cropName, fallback: phiDays,
      });
    }

    await client.query(
      `INSERT INTO spray_work_order_items
         (work_order_id, sort_order, field_id, segment, product_id, rate,
          date_of_application, phi_days, group_id, is_mixture_child,
          start_time, end_time, total_product_qty, total_water_qty,
          actual_qty, machinery_ref, quality_check, completed_by_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
      [
        workOrderId, i + 1,
        item.fieldId || null,
        item.segment || null,
        item.productId || null,
        item.rate || null,
        item.dateOfApplication || fallbackDate || null,
        phiDays,
        item.groupId || null,
        item.isMixtureChild || false,
        toTimeOfDay(item.startTime),
        toTimeOfDay(item.endTime),
        item.totalProductQty ? Number(item.totalProductQty) : null,
        item.totalWaterQty ? Number(item.totalWaterQty) : null,
        item.actualQty ? Number(item.actualQty) : null,
        item.machineryRef || null,
        item.qualityCheck || false,
        item.completedByName || null,
      ],
    );
  }
}

// ─── Update (draft / issued) ──────────────────────────────────────

export async function updateWorkOrder(id: string, data: any, userId: string, organizationId: string): Promise<any> {
  const existing = await requireWorkOrder(id, organizationId);
  if (data.siteId === null || data.siteId === '') throw badRequest('A work order must have a site');
  if (data.assignedTo) await assertAssignableOperator(data.assignedTo, organizationId);

  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');

    const status = await lockStatus(client, id);
    if (status !== 'draft' && status !== 'issued') {
      throw badRequest('Only draft or issued work orders can be edited');
    }

    const sets: string[] = [];
    const params: any[] = [];
    const push = (col: string, val: any) => { params.push(val); sets.push(`${col} = $${params.length}`); };

    if (data.siteId !== undefined) push('site_id', data.siteId);
    if (data.applicationType !== undefined) push('application_type', data.applicationType);
    if (data.dateIssued !== undefined) push('date_issued', data.dateIssued);
    if (data.justification !== undefined) push('justification', data.justification);
    if (data.assignedTo !== undefined) push('assigned_to', data.assignedTo);
    if (data.importantInstructions !== undefined) push('important_instructions', data.importantInstructions);
    push('updated_at', new Date().toISOString());

    params.push(id);
    await client.query(`UPDATE spray_work_orders SET ${sets.join(', ')} WHERE id = $${params.length}`, params);

    if (Array.isArray(data.items)) {
      await client.query('DELETE FROM spray_work_order_items WHERE work_order_id = $1', [id]);
      await insertItems(client, id, data.items, data.siteId || existing.site_id);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const reassigned = data.assignedTo && data.assignedTo !== existing.assigned_to;
  if (reassigned && existing.status === 'issued') {
    notifyUser(data.assignedTo, id, {
      title: `Work Order #${existing.work_order_number} assigned to you`,
      message: `A ${existing.application_type} work order has been reassigned to you.`,
      severity: 'info',
    }).catch((err) => logger.error('WO reassignment notification failed', err));
  }

  return await getWorkOrderById(id, organizationId);
}

// ─── Operator Save / Submit ───────────────────────────────────────

const has = (obj: any, key: string) => Object.prototype.hasOwnProperty.call(obj, key);
const numOrNull = (v: unknown) => (v != null && v !== '' ? v : null);

/** A pesticide the operator picks must be assigned to the work order's site. */
async function assertProductOnSite(client: any, siteId: string | null, productId: string): Promise<void> {
  if (!siteId) return;
  const res = await client.query(
    'SELECT 1 FROM site_pesticide_products WHERE site_id = $1 AND product_id = $2',
    [siteId, productId],
  );
  if (res.rows.length === 0) throw badRequest('That pesticide is not assigned to this site');
}

const SITE_FIELDS_SQL = `
  SELECT f.id, f.name
  FROM fields f
  JOIN farm_areas fa ON fa.id = f.farm_area_id
  WHERE fa.site_id = $1 AND f.deleted_at IS NULL`;

/** A row the operator adds must be on a field of the work order's site. */
async function assertFieldOnSite(client: any, siteId: string | null, fieldId: string): Promise<void> {
  const res = await client.query(`${SITE_FIELDS_SQL} AND f.id = $2`, [siteId, fieldId]);
  if (res.rows.length === 0) throw badRequest('That field is not on this work order\'s site');
}

/** Fields of a work order's site, for the rows an operator adds. */
export async function listSiteFields(siteId: string | null): Promise<Array<{ id: string; name: string }>> {
  if (!siteId) return [];
  const res = await dbPool.query(`${SITE_FIELDS_SQL} ORDER BY f.name`, [siteId]);
  return res.rows;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function groupIdOrNull(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (!UUID_RE.test(String(value))) throw badRequest('Invalid mixture group');
  return String(value);
}

/** The crop currently on a field (used for the site's crop-specific PHI). */
async function cropNameForField(db: any, fieldId: string | null | undefined): Promise<string | null> {
  if (!fieldId) return null;
  const res = await db.query(
    'SELECT c.name AS crop_name FROM fields f LEFT JOIN crops c ON c.id = f.current_crop_id WHERE f.id = $1',
    [fieldId],
  );
  return res.rows[0]?.crop_name || null;
}

/**
 * PHI days for a pesticide on a field: the site's crop-specific PHI when one is set for the
 * field's crop, else the pesticide's own PHI. A lookup failure gives `fallback`.
 */
async function phiForField(
  db: any, siteId: string | null, productId: string, fieldId: string | null | undefined,
  opts: { cropName?: string | null; fallback?: number } = {},
): Promise<number> {
  try {
    const cropName = opts.cropName || await cropNameForField(db, fieldId);
    return await getPhiForSiteProductCrop(siteId, productId, cropName);
  } catch {
    return opts.fallback ?? 0;
  }
}

/** Inserts a row the operator added (another product, another field, or a tank-mix row). */
async function insertOperatorRow(client: any, wo: any, item: any, sortOrder: number): Promise<void> {
  if (!item.fieldId) throw badRequest('Choose a field for every added row');
  if (!item.productId) throw badRequest('Choose a pesticide for every row');
  await assertFieldOnSite(client, wo.site_id, item.fieldId);
  await assertProductOnSite(client, wo.site_id, item.productId);
  const isMixtureChild = Boolean(item.isMixtureChild);
  const groupId = groupIdOrNull(item.groupId);
  if (isMixtureChild && !groupId) throw badRequest('A mixture row needs the row it is mixed with');

  await client.query(
    `INSERT INTO spray_work_order_items
       (work_order_id, sort_order, field_id, segment, product_id, rate,
        date_of_application, phi_days, group_id, is_mixture_child,
        start_time, end_time, total_product_qty, total_water_qty,
        actual_qty, machinery_ref, quality_check, completed_by_name, added_by_operator)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, true)`,
    [
      wo.id, sortOrder,
      item.fieldId,
      item.segment || null,
      item.productId,
      item.rate || null,
      item.dateOfApplication || wo.date_issued || null,
      await phiForField(client, wo.site_id, item.productId, item.fieldId),
      groupId,
      isMixtureChild,
      toTimeOfDay(item.startTime),
      toTimeOfDay(item.endTime),
      numOrNull(item.totalProductQty),
      numOrNull(item.totalWaterQty),
      numOrNull(item.actualQty),
      item.machineryRef || null,
      item.qualityCheck || false,
      item.completedByName || null,
    ],
  );
}

/**
 * Saves the operator's work on an issued order. Before completing, the operator may change
 * segment, pesticide, rate, date of application and justification as well as the actuals.
 * Start / end time may stay empty. A changed pesticide gets its PHI looked up again, the same
 * way as at issue. Approval later turns these saved items into the spray records.
 *
 * `items` is the full ordered list: rows with an id are existing rows, rows without one are
 * rows the operator adds (e.g. another pesticide when the issued one ran short, or a mixture).
 * Rows the operator added and left out of the list are removed; issued rows never are.
 */
async function saveOperatorWork(
  id: string, data: any, userId: string, organizationId: string, opts: { complete: boolean },
): Promise<any> {
  const existing = await requireWorkOrder(id, organizationId);
  if (existing.assigned_to !== userId) {
    throw new AppError('Only the assigned operator can submit this work order', 'FORBIDDEN', 403);
  }
  const existingItems = new Map<string, any>((existing.items || []).map((it: any) => [it.id, it]));

  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');

    const status = await lockStatus(client, id);
    if (!['issued', 'in_progress'].includes(status)) {
      throw badRequest('Work order is not in a submittable state');
    }

    if (Array.isArray(data.items)) {
      // Group each row ends up in: the one sent, else the one it already has.
      assertMixtureSizes(data.items.map((it: any) => it?.groupId || existingItems.get(it?.id)?.group_id));
      const keptIds = new Set(data.items.map((it: any) => it?.id).filter(Boolean));
      const removed = (existing.items || [])
        .filter((it: any) => it.added_by_operator && !keptIds.has(it.id))
        .map((it: any) => it.id);
      if (removed.length > 0) {
        await client.query(
          'DELETE FROM spray_work_order_items WHERE work_order_id = $1 AND added_by_operator = true AND id = ANY($2::uuid[])',
          [id, removed],
        );
      }

      // A mixture is the same tank pass: it gets its main row's times, machinery and completed by.
      const groupOf = (it: any) => it?.groupId || existingItems.get(it?.id)?.group_id;
      const rows = alignMixtureItems(
        data.items.map((it: any) => ({
          ...it,
          isMixtureChild: it?.isMixtureChild ?? Boolean(existingItems.get(it?.id)?.is_mixture_child),
        })),
        groupOf,
      );

      for (const [index, item] of rows.entries()) {
        const sortOrder = index + 1;
        if (!item.id) {
          await insertOperatorRow(client, existing, item, sortOrder);
          continue;
        }
        const before = existingItems.get(item.id);
        if (!before) continue;

        const params: any[] = [
          item.id,
          id,
          toTimeOfDay(item.startTime),
          toTimeOfDay(item.endTime),
          numOrNull(item.totalProductQty),
          numOrNull(item.totalWaterQty),
          numOrNull(item.actualQty),
          item.machineryRef || null,
          item.qualityCheck || false,
          item.completedByName || null,
        ];
        const sets = [
          'start_time = $3', 'end_time = $4', 'total_product_qty = $5', 'total_water_qty = $6',
          'actual_qty = $7', 'machinery_ref = $8', 'quality_check = $9', 'completed_by_name = $10',
        ];
        const push = (col: string, val: unknown) => { params.push(val); sets.push(`${col} = $${params.length}`); };

        if (has(item, 'segment')) push('segment', item.segment || null);
        if (has(item, 'rate')) push('rate', item.rate || null);
        if (has(item, 'dateOfApplication')) push('date_of_application', item.dateOfApplication || null);
        if (has(item, 'productId')) {
          if (!item.productId) throw badRequest('Choose a pesticide for every row');
          if (item.productId !== before.product_id) {
            await assertProductOnSite(client, existing.site_id, item.productId);
            push('product_id', item.productId);
            push('phi_days', await phiForField(client, existing.site_id, item.productId, before.field_id));
          }
        }
        // A row that gets a mixture added to it joins that mixture's group.
        const groupId = has(item, 'groupId') ? groupIdOrNull(item.groupId) : null;
        if (groupId && !before.group_id) push('group_id', groupId);
        if (Number(before.sort_order) !== sortOrder) push('sort_order', sortOrder);

        await client.query(
          `UPDATE spray_work_order_items SET ${sets.join(', ')}
           WHERE id = $1 AND work_order_id = $2`,
          params,
        );
      }
    }

    if (has(data, 'justification')) {
      await client.query(
        'UPDATE spray_work_orders SET justification = $2, updated_at = NOW() WHERE id = $1',
        [id, data.justification || null],
      );
    }

    if (opts.complete) {
      await client.query(
        `UPDATE spray_work_orders
         SET status = 'completed', completed_by = $2, completed_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [id, userId],
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return existing;
}

/** Saves the operator's changes without completing; the order stays with the operator. */
export async function operatorSave(id: string, data: any, userId: string, organizationId: string): Promise<any> {
  await saveOperatorWork(id, data, userId, organizationId, { complete: false });
  return await getWorkOrderById(id, organizationId);
}

export async function operatorSubmit(id: string, data: any, userId: string, organizationId: string): Promise<any> {
  const existing = await saveOperatorWork(id, data, userId, organizationId, { complete: true });

  // The issuer may be an operations manager / agronomist who cannot approve,
  // so every pest agronomist in the organization is told as well.
  reviewersFor(existing.issued_by, organizationId)
    .then((recipients) => Promise.all(recipients.map((uid) => notifyUser(uid, id, {
      title: `Work Order #${existing.work_order_number} completed - pending your approval`,
      message: `The operator has completed the ${existing.application_type} work order and submitted actuals.`,
      severity: 'info',
    }))))
    .catch((err) => logger.error('WO completion notification failed', err));

  return await getWorkOrderById(id, organizationId);
}

// ─── Approve ──────────────────────────────────────────────────────

/**
 * Approves a completed work order. The approver must already be allowed to approve
 * pesticide applications (checked by the route), so the generated applications are
 * created approved and immediately count towards PHI.
 */
export async function approveWorkOrder(id: string, userId: string, organizationId: string): Promise<any> {
  const existing = await requireWorkOrder(id, organizationId);

  const client = await dbPool.connect();
  let applications: any[] = [];
  try {
    await client.query('BEGIN');

    const status = await lockStatus(client, id);
    if (status !== 'completed') {
      throw badRequest('Only completed work orders can be approved');
    }

    await client.query(
      `UPDATE spray_work_orders
       SET status = 'approved', approved_by = $2, approved_at = NOW(), rejection_reason = NULL, updated_at = NOW()
       WHERE id = $1`,
      [id, userId],
    );

    const wo = await requireWorkOrder(id, organizationId);
    applications = await convertToApplications(wo, userId, organizationId, client);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Same follow-ups as approving a pesticide application directly.
  for (const app of applications) {
    schedulePHINotifications(app).catch((err) => logger.error('WO PHI scheduling failed', err));
  }
  const fieldIds = new Set(applications.map((a) => a.field_id).filter(Boolean));
  for (const fieldId of fieldIds) {
    checkAndNotifyFieldHarvestConflicts(fieldId).catch(() => {});
  }

  if (existing.assigned_to) {
    notifyUser(existing.assigned_to, id, {
      title: `Work Order #${existing.work_order_number} approved`,
      message: `Your ${existing.application_type} work order was approved and the spray records are now active.`,
      severity: 'info',
    }).catch((err) => logger.error('WO approval notification failed', err));
  }

  return await getWorkOrderById(id, organizationId);
}

// ─── Reject / Send back / Cancel ──────────────────────────────────

/**
 * - completed → back to issued so the operator can correct and resubmit (reviewer only).
 * - issued / in_progress → cancelled as rejected (managers or reviewer).
 */
export async function rejectWorkOrder(
  id: string,
  reason: string,
  userId: string,
  organizationId: string,
  permissions: { canReview: boolean; canManage: boolean },
): Promise<any> {
  const existing = await requireWorkOrder(id, organizationId);

  const client = await dbPool.connect();
  let status: string;
  try {
    await client.query('BEGIN');

    status = await lockStatus(client, id);
    if (status === 'completed') {
      if (!permissions.canReview) {
        throw new AppError('Only the pest agronomist can send back a completed work order', 'FORBIDDEN', 403);
      }
      if (!reason?.trim()) throw badRequest('Give a reason so the operator knows what to fix');
      await client.query(
        `UPDATE spray_work_orders
         SET status = 'issued', rejection_reason = $2, completed_by = NULL, completed_at = NULL,
             approved_by = NULL, approved_at = NULL, updated_at = NOW()
         WHERE id = $1`,
        [id, reason.trim()],
      );
    } else if (['issued', 'in_progress'].includes(status)) {
      if (!permissions.canManage && !permissions.canReview) {
        throw new AppError('You cannot cancel this work order', 'FORBIDDEN', 403);
      }
      await client.query(
        `UPDATE spray_work_orders
         SET status = 'rejected', rejection_reason = $2, approved_by = $3, approved_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [id, reason?.trim() || null, userId],
      );
    } else {
      throw badRequest('Work order cannot be rejected in its current state');
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  if (existing.assigned_to) {
    const sentBack = status === 'completed';
    notifyUser(existing.assigned_to, id, {
      title: sentBack
        ? `Work Order #${existing.work_order_number} sent back to you`
        : `Work Order #${existing.work_order_number} cancelled`,
      message: sentBack
        ? `Please correct and resubmit. Reason: ${reason.trim()}`
        : `This work order was cancelled. Reason: ${reason?.trim() || 'N/A'}`,
      severity: 'warning',
    }).catch((err) => logger.error('WO rejection notification failed', err));
  }

  return await getWorkOrderById(id, organizationId);
}

// ─── Delete Draft ─────────────────────────────────────────────────

export async function deleteWorkOrder(id: string, organizationId: string): Promise<void> {
  const existing = await requireWorkOrder(id, organizationId);
  if (!['draft', 'rejected'].includes(existing.status)) {
    throw badRequest('Only draft or rejected work orders can be deleted');
  }
  await dbPool.query('DELETE FROM spray_work_orders WHERE id = $1', [id]);
}

// ─── Convert to Pesticide Applications ────────────────────────────

async function convertToApplications(wo: any, userId: string, organizationId: string, client: any): Promise<any[]> {
  if (!wo.items?.length) return [];

  const templateSlug = wo.application_type === 'drench' ? 'pest-drench' : 'pest-spray';
  const tplRes = await client.query(
    `SELECT id FROM form_templates WHERE slug = $1 LIMIT 1`,
    [templateSlug],
  );
  const templateId = tplRes.rows[0]?.id || null;

  const created: any[] = [];
  for (const item of wo.items) {
    let unitPrice: number | null = null;
    if (item.product_id && wo.site_id) {
      const priceRes = await client.query(
        `SELECT unit_price FROM site_pesticide_products WHERE site_id = $1 AND product_id = $2`,
        [wo.site_id, item.product_id],
      );
      unitPrice = priceRes.rows[0]?.unit_price ?? null;
    }

    const totalQty = item.total_product_qty || item.actual_qty || null;
    let cost: number | null = null;
    if (totalQty && unitPrice) {
      cost = (Number(totalQty) * Number(unitPrice)) / 1000;
    }

    const fieldInfo = item.field_id
      ? await client.query(`SELECT f.name, c.name AS crop_name FROM fields f LEFT JOIN crops c ON c.id = f.current_crop_id WHERE f.id = $1`, [item.field_id])
      : { rows: [] };
    const cropName = fieldInfo.rows[0]?.crop_name || null;

    // PHI is looked up again with the field's crop, so the site's crop-specific PHI applies
    // (also to orders issued before the crop was taken into account).
    const phiDays = item.product_id
      ? await phiForField(client, wo.site_id, item.product_id, item.field_id, {
        cropName, fallback: Number(item.phi_days) || 0,
      })
      : Number(item.phi_days) || 0;

    let phiEndDate: string | null = null;
    const appDate = item.date_of_application || wo.date_issued;
    if (appDate && phiDays > 0) {
      const base = new Date(appDate);
      if (item.end_time) {
        const [h, m] = item.end_time.split(':').map(Number);
        base.setHours(h || 0, m || 0);
      }
      base.setDate(base.getDate() + phiDays);
      phiEndDate = base.toISOString();
    }

    const res = await client.query(
      `INSERT INTO pesticide_applications
         (field_id, product_id, application_date, phi_end_date,
          dosage, dosage_unit, application_method, target_pest,
          operator_name, approval_status, authorized_by, approved_at,
          organization_id, created_by,
          crop_name, segment_id, justification,
          application_start_time, application_end_time,
          active_ingredient, unit_price, cost, uom,
          total_quantity_applied, total_water_qty,
          machinery_used, template_id, group_id, is_mixture_child)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'approved',$11,NOW(),$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
       RETURNING *`,
      [
        item.field_id, item.product_id, appDate, phiEndDate,
        item.rate || null, 'ML', null, wo.justification,
        item.completed_by_name || null, wo.organization_id || organizationId, userId,
        cropName, item.segment || null, wo.justification,
        item.start_time || null, item.end_time || null,
        item.active_ingredient || null, unitPrice, cost, 'ML',
        totalQty, item.total_water_qty || null,
        item.machinery_ref || null, templateId, item.group_id || null, item.is_mixture_child || false,
      ],
    );
    created.push(res.rows[0]);
  }
  return created;
}

// ─── Notification Helper ──────────────────────────────────────────

/** The issuer plus every active pest agronomist in the organization, without duplicates. */
async function reviewersFor(issuedBy: string | null, organizationId: string): Promise<string[]> {
  const res = await dbPool.query(
    `SELECT id FROM users WHERE role = 'pest_agronomist' AND is_active = true AND organization_id = $1`,
    [organizationId],
  );
  const ids = new Set<string>(res.rows.map((r: { id: string }) => r.id));
  if (issuedBy) ids.add(issuedBy);
  return [...ids];
}

/** entity_id links the notification to the order, so clicking it can open that order. */
async function notifyUser(
  userId: string,
  workOrderId: string,
  data: { title: string; message: string; severity: string },
): Promise<void> {
  const eventRes = await dbPool.query(
    `INSERT INTO alert_events (entity_type, entity_id, severity, title, message)
     VALUES ('work_order', $1, $2, $3, $4) RETURNING *`,
    [workOrderId, data.severity, data.title, data.message],
  );
  const event = eventRes.rows[0];

  await dbPool.query(
    `INSERT INTO user_notifications (user_id, alert_event_id, title, message, severity)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, event.id, data.title, data.message, data.severity],
  );

  emitAlert(event, userId);

  pushNotificationService.sendToUser(userId, {
    title: data.title,
    body: data.message,
    type: 'info',
    data: { alertEventId: event.id, entityType: 'work_order' },
  }).catch(() => {});
}

// ─── Get crew list ────────────────────────────────────────────────

/**
 * Operators and workers of the organization. Only operators can be assigned a work
 * order ("Given to"); workers are listed for the per-row "Completed by" name.
 */
export async function getOperators(organizationId: string): Promise<any[]> {
  const result = await dbPool.query(
    `SELECT id, name, email, role FROM users
     WHERE role IN ('operator', 'worker') AND is_active = true AND organization_id = $1
     ORDER BY name`,
    [organizationId],
  );
  return result.rows;
}
