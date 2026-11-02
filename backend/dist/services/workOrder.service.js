"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listWorkOrders = listWorkOrders;
exports.getWorkOrderById = getWorkOrderById;
exports.createWorkOrder = createWorkOrder;
exports.updateWorkOrder = updateWorkOrder;
exports.operatorSubmit = operatorSubmit;
exports.approveWorkOrder = approveWorkOrder;
exports.rejectWorkOrder = rejectWorkOrder;
exports.deleteWorkOrder = deleteWorkOrder;
exports.getOperators = getOperators;
const client_1 = require("../db/client");
const push_notification_service_1 = require("./push-notification.service");
const websocket_1 = require("../websocket");
const ipm_service_1 = require("./ipm.service");
const logger_1 = require("../utils/logger");
// ─── List Work Orders ─────────────────────────────────────────────
async function listWorkOrders(opts) {
    const page = opts.page || 1;
    const limit = Math.min(opts.limit || 50, 200);
    const offset = (page - 1) * limit;
    const conditions = [];
    const params = [];
    params.push(opts.organizationId);
    conditions.push(`COALESCE(wo.organization_id, s.organization_id) = $${params.length}`);
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
    const siteJoin = ' JOIN sites s ON s.id = wo.site_id';
    const countRes = await client_1.dbPool.query(`SELECT COUNT(*) FROM spray_work_orders wo${siteJoin} ${where}`, params);
    const total = parseInt(countRes.rows[0].count, 10);
    const lIdx = params.length + 1;
    const oIdx = params.length + 2;
    params.push(limit, offset);
    const result = await client_1.dbPool.query(`SELECT wo.*,
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
     LIMIT $${lIdx} OFFSET $${oIdx}`, params);
    return { items: result.rows, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
}
// ─── Get Single Work Order ────────────────────────────────────────
async function getWorkOrderById(id) {
    const woRes = await client_1.dbPool.query(`SELECT wo.*,
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
     WHERE wo.id = $1`, [id]);
    if (woRes.rows.length === 0)
        return null;
    const wo = woRes.rows[0];
    const itemsRes = await client_1.dbPool.query(`SELECT i.*,
            f.name AS field_name,
            pp.name AS product_name,
            pp.active_ingredient,
            pp.phi_days AS product_phi_days
     FROM spray_work_order_items i
     LEFT JOIN fields f ON f.id = i.field_id
     LEFT JOIN pesticide_products pp ON pp.id = i.product_id
     WHERE i.work_order_id = $1
     ORDER BY i.sort_order, i.created_at`, [id]);
    wo.items = itemsRes.rows;
    return wo;
}
// ─── Create Work Order ────────────────────────────────────────────
async function createWorkOrder(data, userId) {
    const client = await client_1.dbPool.connect();
    try {
        await client.query('BEGIN');
        const woRes = await client.query(`INSERT INTO spray_work_orders
         (site_id, application_type, date_issued, justification, status,
          important_instructions, issued_by, assigned_to, organization_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`, [
            data.siteId || null,
            data.applicationType || 'spray',
            data.dateIssued || new Date().toISOString().split('T')[0],
            data.justification || null,
            data.status || 'issued',
            data.importantInstructions || null,
            data.issuedBy || userId,
            data.assignedTo || null,
            data.organizationId || null,
            userId,
        ]);
        const wo = woRes.rows[0];
        if (Array.isArray(data.items)) {
            for (let i = 0; i < data.items.length; i++) {
                const item = data.items[i];
                let phiDays = item.phiDays ?? 0;
                if (item.productId && data.siteId) {
                    try {
                        phiDays = await (0, ipm_service_1.getPhiForSiteProductCrop)(data.siteId, item.productId, item.cropName || null);
                    }
                    catch { /* use default */ }
                }
                await client.query(`INSERT INTO spray_work_order_items
             (work_order_id, sort_order, field_id, segment, product_id, rate,
              date_of_application, phi_days, group_id, is_mixture_child,
              start_time, end_time, total_product_qty, total_water_qty,
              actual_qty, machinery_ref, quality_check, completed_by_name)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`, [
                    wo.id, i + 1,
                    item.fieldId || null,
                    item.segment || null,
                    item.productId || null,
                    item.rate || null,
                    item.dateOfApplication || data.dateIssued || null,
                    phiDays,
                    item.groupId || null,
                    item.isMixtureChild || false,
                    item.startTime || null,
                    item.endTime || null,
                    item.totalProductQty ? Number(item.totalProductQty) : null,
                    item.totalWaterQty ? Number(item.totalWaterQty) : null,
                    item.actualQty ? Number(item.actualQty) : null,
                    item.machineryRef || null,
                    item.qualityCheck || false,
                    item.completedByName || null,
                ]);
            }
        }
        await client.query('COMMIT');
        if (wo.status === 'issued' && wo.assigned_to) {
            notifyUser(wo.assigned_to, {
                title: `New Work Order #${wo.work_order_number} assigned to you`,
                message: `A ${wo.application_type} work order has been issued. Justification: ${wo.justification || 'N/A'}`,
                severity: 'info',
            }).catch((err) => logger_1.logger.error('WO notification failed', err));
        }
        return await getWorkOrderById(wo.id);
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
}
// ─── Update Draft ─────────────────────────────────────────────────
async function updateWorkOrder(id, data, userId) {
    const existing = await getWorkOrderById(id);
    if (!existing)
        throw new Error('Work order not found');
    if (existing.status !== 'draft' && existing.status !== 'issued') {
        throw new Error('Only draft or issued work orders can be edited');
    }
    const client = await client_1.dbPool.connect();
    try {
        await client.query('BEGIN');
        const sets = [];
        const params = [];
        const push = (col, val) => { params.push(val); sets.push(`${col} = $${params.length}`); };
        if (data.siteId !== undefined)
            push('site_id', data.siteId);
        if (data.applicationType !== undefined)
            push('application_type', data.applicationType);
        if (data.dateIssued !== undefined)
            push('date_issued', data.dateIssued);
        if (data.justification !== undefined)
            push('justification', data.justification);
        if (data.assignedTo !== undefined)
            push('assigned_to', data.assignedTo);
        if (data.importantInstructions !== undefined)
            push('important_instructions', data.importantInstructions);
        push('updated_at', new Date().toISOString());
        if (sets.length) {
            params.push(id);
            await client.query(`UPDATE spray_work_orders SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
        }
        if (Array.isArray(data.items)) {
            await client.query('DELETE FROM spray_work_order_items WHERE work_order_id = $1', [id]);
            for (let i = 0; i < data.items.length; i++) {
                const item = data.items[i];
                let phiDays = item.phiDays ?? 0;
                if (item.productId && (data.siteId || existing.site_id)) {
                    try {
                        phiDays = await (0, ipm_service_1.getPhiForSiteProductCrop)(data.siteId || existing.site_id, item.productId, item.cropName || null);
                    }
                    catch { /* use default */ }
                }
                await client.query(`INSERT INTO spray_work_order_items
             (work_order_id, sort_order, field_id, segment, product_id, rate,
              date_of_application, phi_days, group_id, is_mixture_child,
              start_time, end_time, total_product_qty, total_water_qty,
              actual_qty, machinery_ref, quality_check, completed_by_name)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`, [id, i + 1, item.fieldId || null, item.segment || null, item.productId || null,
                    item.rate || null, item.dateOfApplication || null, phiDays,
                    item.groupId || null, item.isMixtureChild || false,
                    item.startTime || null, item.endTime || null,
                    item.totalProductQty ? Number(item.totalProductQty) : null,
                    item.totalWaterQty ? Number(item.totalWaterQty) : null,
                    item.actualQty ? Number(item.actualQty) : null,
                    item.machineryRef || null, item.qualityCheck || false,
                    item.completedByName || null]);
            }
        }
        await client.query('COMMIT');
        return await getWorkOrderById(id);
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
}
// ─── Operator Submit ──────────────────────────────────────────────
async function operatorSubmit(id, data, userId) {
    const existing = await getWorkOrderById(id);
    if (!existing)
        throw new Error('Work order not found');
    if (!['issued', 'in_progress'].includes(existing.status)) {
        throw new Error('Work order is not in a submittable state');
    }
    const client = await client_1.dbPool.connect();
    try {
        await client.query('BEGIN');
        if (Array.isArray(data.items)) {
            for (const item of data.items) {
                await client.query(`UPDATE spray_work_order_items
           SET start_time = $2, end_time = $3, total_product_qty = $4,
               total_water_qty = $5, actual_qty = $6, machinery_ref = $7,
               quality_check = $8, completed_by_name = $9
           WHERE id = $1`, [
                    item.id,
                    item.startTime || null,
                    item.endTime || null,
                    item.totalProductQty != null ? item.totalProductQty : null,
                    item.totalWaterQty != null ? item.totalWaterQty : null,
                    item.actualQty != null ? item.actualQty : null,
                    item.machineryRef || null,
                    item.qualityCheck || false,
                    item.completedByName || null,
                ]);
            }
        }
        await client.query(`UPDATE spray_work_orders
       SET status = 'completed', completed_by = $2, completed_at = NOW(), updated_at = NOW()
       WHERE id = $1`, [id, userId]);
        await client.query('COMMIT');
        if (existing.issued_by) {
            notifyUser(existing.issued_by, {
                title: `Work Order #${existing.work_order_number} completed - pending your approval`,
                message: `The operator has completed the ${existing.application_type} work order and submitted actuals.`,
                severity: 'info',
            }).catch((err) => logger_1.logger.error('WO completion notification failed', err));
        }
        return await getWorkOrderById(id);
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
}
// ─── Approve ──────────────────────────────────────────────────────
async function approveWorkOrder(id, userId) {
    const existing = await getWorkOrderById(id);
    if (!existing)
        throw new Error('Work order not found');
    if (existing.status !== 'completed') {
        throw new Error('Only completed work orders can be approved');
    }
    const client = await client_1.dbPool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`UPDATE spray_work_orders
       SET status = 'approved', approved_by = $2, approved_at = NOW(), updated_at = NOW()
       WHERE id = $1`, [id, userId]);
        await convertToApplications(id, userId, client);
        await client.query('COMMIT');
        return await getWorkOrderById(id);
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
}
// ─── Reject ───────────────────────────────────────────────────────
async function rejectWorkOrder(id, reason, userId) {
    const existing = await getWorkOrderById(id);
    if (!existing)
        throw new Error('Work order not found');
    if (!['completed', 'issued', 'in_progress'].includes(existing.status)) {
        throw new Error('Work order cannot be rejected in its current state');
    }
    await client_1.dbPool.query(`UPDATE spray_work_orders
     SET status = 'rejected', rejection_reason = $2, approved_by = $3, approved_at = NOW(), updated_at = NOW()
     WHERE id = $1`, [id, reason || null, userId]);
    return await getWorkOrderById(id);
}
// ─── Delete Draft ─────────────────────────────────────────────────
async function deleteWorkOrder(id) {
    const existing = await client_1.dbPool.query('SELECT status FROM spray_work_orders WHERE id = $1', [id]);
    if (existing.rows.length === 0)
        throw new Error('Work order not found');
    if (!['draft', 'rejected'].includes(existing.rows[0].status)) {
        throw new Error('Only draft or rejected work orders can be deleted');
    }
    await client_1.dbPool.query('DELETE FROM spray_work_orders WHERE id = $1', [id]);
}
// ─── Convert to Pesticide Applications ────────────────────────────
async function convertToApplications(workOrderId, userId, client) {
    const wo = await getWorkOrderById(workOrderId);
    if (!wo || !wo.items?.length)
        return;
    const templateSlug = wo.application_type === 'drench' ? 'pest-drench' : 'pest-spray';
    const tplRes = await client.query(`SELECT id FROM form_templates WHERE slug = $1 LIMIT 1`, [templateSlug]);
    const templateId = tplRes.rows[0]?.id || null;
    for (const item of wo.items) {
        let unitPrice = null;
        if (item.product_id && wo.site_id) {
            const priceRes = await client.query(`SELECT unit_price FROM site_pesticide_products WHERE site_id = $1 AND product_id = $2`, [wo.site_id, item.product_id]);
            unitPrice = priceRes.rows[0]?.unit_price ?? null;
        }
        const totalQty = item.total_product_qty || item.actual_qty || null;
        let cost = null;
        if (totalQty && unitPrice) {
            cost = (Number(totalQty) * Number(unitPrice)) / 1000;
        }
        let phiEndDate = null;
        const appDate = item.date_of_application || wo.date_issued;
        if (appDate && item.phi_days > 0) {
            const base = new Date(appDate);
            if (item.end_time) {
                const [h, m] = item.end_time.split(':').map(Number);
                base.setHours(h || 0, m || 0);
            }
            base.setDate(base.getDate() + item.phi_days);
            phiEndDate = base.toISOString();
        }
        const fieldInfo = item.field_id
            ? await client.query(`SELECT f.name, c.name AS crop_name FROM fields f LEFT JOIN crops c ON c.id = f.current_crop_id WHERE f.id = $1`, [item.field_id])
            : { rows: [] };
        const cropName = fieldInfo.rows[0]?.crop_name || null;
        await client.query(`INSERT INTO pesticide_applications
         (field_id, product_id, application_date, phi_end_date,
          dosage, dosage_unit, application_method, target_pest,
          operator_name, approval_status, organization_id, created_by,
          crop_name, segment_id, justification,
          application_start_time, application_end_time,
          active_ingredient, unit_price, cost, uom,
          total_quantity_applied, total_water_qty,
          machinery_used, template_id, group_id, is_mixture_child)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)`, [
            item.field_id, item.product_id, appDate, phiEndDate,
            item.rate || null, 'ML', null, wo.justification,
            item.completed_by_name || null, wo.organization_id, userId,
            cropName, item.segment || null, wo.justification,
            item.start_time || null, item.end_time || null,
            item.active_ingredient || null, unitPrice, cost, 'ML',
            totalQty, item.total_water_qty || null,
            item.machinery_ref || null, templateId, item.group_id || null, item.is_mixture_child || false,
        ]);
    }
}
// ─── Notification Helper ──────────────────────────────────────────
async function notifyUser(userId, data) {
    const eventRes = await client_1.dbPool.query(`INSERT INTO alert_events (entity_type, severity, title, message)
     VALUES ('work_order', $1, $2, $3) RETURNING *`, [data.severity, data.title, data.message]);
    const event = eventRes.rows[0];
    await client_1.dbPool.query(`INSERT INTO user_notifications (user_id, alert_event_id, title, message, severity)
     VALUES ($1, $2, $3, $4, $5)`, [userId, event.id, data.title, data.message, data.severity]);
    (0, websocket_1.emitAlert)(event, userId);
    push_notification_service_1.pushNotificationService.sendToUser(userId, {
        title: data.title,
        body: data.message,
        type: 'info',
        data: { alertEventId: event.id, entityType: 'work_order' },
    }).catch(() => { });
}
// ─── Get operators list ───────────────────────────────────────────
async function getOperators() {
    const result = await client_1.dbPool.query(`SELECT id, name, email, role FROM users WHERE role IN ('operator', 'worker') AND is_active = true ORDER BY name`);
    return result.rows;
}
