"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDailyBrief = getDailyBrief;
const client_1 = require("../db/client");
function pushSiteFilter(params, siteId, columnSql) {
    if (!siteId)
        return '';
    params.push(siteId);
    return ` AND ${columnSql} = $${params.length}`;
}
async function getDailyBrief({ organizationId, siteId }) {
    const orgIdx = 1;
    const params = [organizationId];
    const siteOnFa = pushSiteFilter(params, siteId, 'fa.site_id');
    const phiPromise = client_1.dbPool.query(`SELECT pa.id AS application_id, pa.field_id, f.name AS field_name, pp.name AS product_name,
            pa.phi_end_date, (pa.phi_end_date - CURRENT_DATE) AS days_remaining,
            c.name AS zone_name
     FROM pesticide_applications pa
     JOIN fields f ON f.id = pa.field_id
     LEFT JOIN pesticide_products pp ON pp.id = pa.product_id
     LEFT JOIN farm_areas fa ON fa.id = f.farm_area_id
     LEFT JOIN sites s ON s.id = fa.site_id
     LEFT JOIN countries c ON c.id = s.country_id
     WHERE pa.approval_status = 'approved'
       AND pa.phi_end_date >= CURRENT_DATE
       AND f.deleted_at IS NULL
       AND COALESCE(pa.organization_id, f.organization_id) = $${orgIdx}${siteOnFa}
     ORDER BY pa.phi_end_date ASC`, params);
    const harvestParams = [organizationId];
    const harvestSiteFilter = pushSiteFilter(harvestParams, siteId, 'fa.site_id');
    const harvestPromise = client_1.dbPool.query(`SELECT h.field_id, f.name AS field_name, c.name AS crop_name,
            cn.name AS zone_name, SUM(h.total_quantity) AS total_kg
     FROM harvests h
     JOIN fields f ON f.id = h.field_id
     LEFT JOIN crops c ON c.id = f.current_crop_id
     LEFT JOIN farm_areas fa ON fa.id = f.farm_area_id
     LEFT JOIN sites s ON s.id = fa.site_id
     LEFT JOIN countries cn ON cn.id = s.country_id
     WHERE h.date = CURRENT_DATE - INTERVAL '1 day'
       AND COALESCE(h.organization_id, f.organization_id) = $1${harvestSiteFilter}
     GROUP BY h.field_id, f.name, c.name, cn.name
     ORDER BY total_kg DESC`, harvestParams);
    const scoutParams = [organizationId];
    const scoutSiteFilter = pushSiteFilter(scoutParams, siteId, 'fa.site_id');
    const scoutingPromise = client_1.dbPool.query(`SELECT sr.id AS report_id, sr.field_id, f.name AS field_name, sr.severity,
            pdc.name AS pest_name, sr.custom_pest_name, sr.report_date
     FROM scouting_reports sr
     JOIN fields f ON f.id = sr.field_id
     LEFT JOIN farm_areas fa ON fa.id = f.farm_area_id
     LEFT JOIN pest_disease_catalog pdc ON pdc.id = sr.pest_disease_id
     WHERE sr.status = 'open'
       AND sr.severity IN ('medium', 'high', 'critical')
       AND COALESCE(sr.organization_id, f.organization_id) = $1${scoutSiteFilter}
     ORDER BY CASE sr.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 ELSE 3 END, sr.report_date DESC
     LIMIT 20`, scoutParams);
    const alertParams = [organizationId];
    const alertSiteFilter = pushSiteFilter(alertParams, siteId, 'fa.site_id');
    const alertsPromise = client_1.dbPool.query(`SELECT ae.id, ae.title, ae.message, ae.severity, ae.entity_type, ae.entity_id,
            ae.field_id, ae.created_at, f.name AS field_name
     FROM alert_events ae
     LEFT JOIN fields f ON f.id = ae.field_id
     LEFT JOIN farm_areas fa ON fa.id = f.farm_area_id
     LEFT JOIN sites s ON s.id = fa.site_id
     WHERE ae.created_at >= NOW() - INTERVAL '48 hours'
       AND (
         ae.field_id IS NULL
         OR COALESCE(f.organization_id, s.organization_id) = $1
       )${alertSiteFilter}
     ORDER BY ae.created_at DESC
     LIMIT 15`, alertParams);
    const crParams = [organizationId];
    const crSiteFilter = pushSiteFilter(crParams, siteId, 'fa.site_id');
    const changeRequestsPromise = client_1.dbPool.query(`SELECT cr.id, cr.action, cr.entity_id, cr.created_at, u.name AS requested_by_name
     FROM ipm_change_requests cr
     JOIN pesticide_applications pa ON pa.id = cr.entity_id
     JOIN fields f ON f.id = pa.field_id
     LEFT JOIN farm_areas fa ON fa.id = f.farm_area_id
     LEFT JOIN users u ON u.id = cr.requested_by
     WHERE cr.status = 'pending'
       AND cr.organization_id = $1${crSiteFilter}
     ORDER BY cr.created_at DESC
     LIMIT 15`, crParams);
    const woParams = [organizationId];
    const woSiteFilter = pushSiteFilter(woParams, siteId, 'wo.site_id');
    const workOrdersPromise = client_1.dbPool.query(`SELECT wo.id, wo.work_order_number, wo.status, wo.application_type, wo.date_issued,
            at.name AS assigned_to_name
     FROM spray_work_orders wo
     JOIN sites s ON s.id = wo.site_id
     LEFT JOIN users at ON at.id = wo.assigned_to
     WHERE COALESCE(wo.organization_id, s.organization_id) = $1
       AND wo.status IN ('issued', 'in_progress', 'completed')${woSiteFilter}
     ORDER BY wo.created_at DESC
     LIMIT 15`, woParams);
    const [phiResult, harvestResult, scoutingResult, alertsResult, changeRequestsResult, workOrdersResult] = await Promise.all([
        phiPromise,
        harvestPromise,
        scoutingPromise,
        alertsPromise,
        changeRequestsPromise,
        workOrdersPromise,
    ]);
    const yesterdayTotal = harvestResult.rows.reduce((sum, r) => sum + Number(r.total_kg), 0);
    const phiFields = phiResult.rows.map((r) => ({
        applicationId: r.application_id,
        fieldId: r.field_id,
        fieldName: r.field_name,
        productName: r.product_name,
        phiEndDate: r.phi_end_date,
        daysRemaining: Number(r.days_remaining),
        zoneName: r.zone_name,
    }));
    const pestAlerts = scoutingResult.rows.map((r) => ({
        reportId: r.report_id,
        fieldId: r.field_id,
        fieldName: r.field_name,
        severity: r.severity,
        pestName: r.pest_name || r.custom_pest_name,
        reportDate: r.report_date,
    }));
    const recentAlerts = alertsResult.rows.map((r) => ({
        id: r.id,
        title: r.title,
        message: r.message,
        severity: r.severity,
        entityType: r.entity_type,
        entityId: r.entity_id,
        fieldId: r.field_id,
        fieldName: r.field_name,
        createdAt: r.created_at,
    }));
    const pendingChangeRequests = changeRequestsResult.rows.map((r) => ({
        id: r.id,
        action: r.action,
        entityId: r.entity_id,
        requestedByName: r.requested_by_name,
        createdAt: r.created_at,
    }));
    const openWorkOrders = workOrdersResult.rows.map((r) => ({
        id: r.id,
        workOrderNumber: r.work_order_number,
        status: r.status,
        applicationType: r.application_type,
        dateIssued: r.date_issued,
        assignedToName: r.assigned_to_name,
    }));
    return {
        siteId: siteId || null,
        summary: {
            phiBlocked: phiFields.length,
            pestAlerts: pestAlerts.length,
            recentAlerts: recentAlerts.length,
            pendingChangeRequests: pendingChangeRequests.length,
            openWorkOrders: openWorkOrders.length,
        },
        phiFields,
        yesterdayHarvest: {
            totalKg: yesterdayTotal,
            byField: harvestResult.rows.map((r) => ({
                fieldName: r.field_name,
                cropName: r.crop_name,
                zoneName: r.zone_name,
                totalKg: Number(r.total_kg),
            })),
        },
        pestAlerts,
        recentAlerts,
        pendingChangeRequests,
        openWorkOrders,
    };
}
