"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyticsRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const analytics_service_1 = require("../../services/analytics.service");
const validate_1 = require("../middleware/validate");
const client_1 = require("../../db/client");
const tenant_1 = require("../middleware/tenant");
const tenantValidation_1 = require("../../utils/tenantValidation");
const dailyBrief_service_1 = require("../../services/dailyBrief.service");
exports.analyticsRouter = (0, express_1.Router)();
const service = new analytics_service_1.AnalyticsService();
const querySchema = zod_1.z.object({
    field_id: zod_1.z.string().uuid().optional(),
    site_id: zod_1.z.string().uuid().optional(),
    farm_area_id: zod_1.z.string().uuid().optional(),
    start_date: zod_1.z.string().optional(),
    end_date: zod_1.z.string().optional(),
    group_by: zod_1.z.enum(['day', 'week', 'month']).optional(),
});
function withOrgId(req, query) {
    return { ...query, organizationId: (0, tenant_1.requireOrgId)(req) };
}
exports.analyticsRouter.get('/harvest-summary', (0, validate_1.validate)({ query: querySchema }), async (req, res, next) => {
    try {
        const data = await service.getHarvestSummary(withOrgId(req, req.query));
        res.json({ success: true, data });
    }
    catch (error) {
        next(error);
    }
});
exports.analyticsRouter.get('/water-usage', (0, validate_1.validate)({ query: querySchema }), async (req, res, next) => {
    try {
        const data = await service.getWaterUsage(withOrgId(req, req.query));
        res.json({ success: true, data });
    }
    catch (error) {
        next(error);
    }
});
exports.analyticsRouter.get('/fertilizer-usage', (0, validate_1.validate)({ query: querySchema }), async (req, res, next) => {
    try {
        const data = await service.getFertilizerUsage(withOrgId(req, req.query));
        res.json({ success: true, data });
    }
    catch (error) {
        next(error);
    }
});
exports.analyticsRouter.get('/ecph-trends', (0, validate_1.validate)({ query: querySchema }), async (req, res, next) => {
    try {
        const data = await service.getEcphTrends(withOrgId(req, req.query));
        res.json({ success: true, data });
    }
    catch (error) {
        next(error);
    }
});
exports.analyticsRouter.get('/monthly-summary', (0, validate_1.validate)({ query: querySchema.omit({ group_by: true }) }), async (req, res, next) => {
    try {
        const data = await service.getMonthlySummary(withOrgId(req, req.query));
        res.json({ success: true, data });
    }
    catch (error) {
        next(error);
    }
});
const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
const corrQuerySchema = zod_1.z.object({
    field_id: zod_1.z.string().uuid(),
    start_date: zod_1.z.string().regex(isoDateRegex, 'Must be YYYY-MM-DD').optional(),
    end_date: zod_1.z.string().regex(isoDateRegex, 'Must be YYYY-MM-DD').optional(),
    group_by: zod_1.z.enum(['week', 'month']).default('week'),
});
exports.analyticsRouter.get('/fertigation-harvest', (0, validate_1.validate)({ query: corrQuerySchema }), async (req, res, next) => {
    try {
        const { field_id, start_date, end_date, group_by } = req.query;
        const orgId = (0, tenant_1.requireOrgId)(req);
        await (0, tenantValidation_1.assertFieldInOrganization)(field_id, orgId);
        const trunc = group_by === 'month' ? 'month' : 'week';
        const useDateRange = start_date && end_date;
        const params = [field_id, orgId];
        let dateClause;
        if (useDateRange) {
            dateClause = 'AND date BETWEEN $3 AND $4';
            params.push(start_date, end_date);
        }
        else {
            dateClause = "AND date >= NOW() - INTERVAL '6 months'";
        }
        const orgJoin = `JOIN fields f ON f.id = field_id AND f.organization_id = $2`;
        const [fertResult, harvResult] = await Promise.all([
            client_1.dbPool.query(`SELECT date_trunc('${trunc}', date) AS period,
                  COALESCE(SUM(daily_water), 0) AS water_m3,
                  COALESCE(SUM(
                    COALESCE(product1_quantity,0)+COALESCE(product2_quantity,0)+
                    COALESCE(product3_quantity,0)+COALESCE(product4_quantity,0)+
                    COALESCE(product5_quantity,0)+COALESCE(product6_quantity,0)+
                    COALESCE(product7_quantity,0)+COALESCE(product8_quantity,0)
                  ), 0) AS fertilizer_kg
           FROM fertigation_entries
           ${orgJoin}
           WHERE field_id = $1 ${dateClause}
           GROUP BY period ORDER BY period`, params),
            client_1.dbPool.query(`SELECT date_trunc('${trunc}', date) AS period,
                  COALESCE(SUM(total_quantity), 0) AS harvest_kg
           FROM harvests
           ${orgJoin}
           WHERE field_id = $1 ${dateClause}
           GROUP BY period ORDER BY period`, params),
        ]);
        const periodMap = {};
        for (const r of fertResult.rows) {
            const key = r.period.toISOString().slice(0, 10);
            periodMap[key] = { period: key, waterM3: Number(r.water_m3), fertilizerKg: Number(r.fertilizer_kg), harvestKg: 0 };
        }
        for (const r of harvResult.rows) {
            const key = r.period.toISOString().slice(0, 10);
            if (!periodMap[key])
                periodMap[key] = { period: key, waterM3: 0, fertilizerKg: 0, harvestKg: 0 };
            periodMap[key].harvestKg = Number(r.harvest_kg);
        }
        const data = Object.values(periodMap).sort((a, b) => a.period.localeCompare(b.period));
        res.json({ success: true, data });
    }
    catch (error) {
        next(error);
    }
});
const dailyBriefQuerySchema = zod_1.z.object({
    site_id: zod_1.z.string().uuid().optional(),
});
exports.analyticsRouter.get('/daily-brief', (0, validate_1.validate)({ query: dailyBriefQuerySchema }), async (req, res, next) => {
    try {
        const orgId = (0, tenant_1.requireOrgId)(req);
        const { site_id: siteId } = req.query;
        const data = await (0, dailyBrief_service_1.getDailyBrief)({ organizationId: orgId, siteId: siteId || null });
        res.json({ success: true, data });
    }
    catch (error) {
        next(error);
    }
});
