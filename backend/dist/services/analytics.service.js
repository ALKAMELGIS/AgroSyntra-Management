"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsService = void 0;
const client_1 = require("../db/client");
const client_2 = require("../cache/client");
const keys_1 = require("../cache/keys");
const errors_1 = require("../utils/errors");
class AnalyticsService {
    async getMonthlySummary(params) {
        const { start_date, end_date } = this.ensureDefaultRange(params);
        const cacheScope = `${params.organizationId}:${start_date}:${end_date}`;
        const canCache = !params.field_id &&
            !params.site_id &&
            !params.farm_area_id &&
            !params.start_date &&
            !params.end_date;
        if (canCache) {
            const cached = await client_2.redisClient.get(keys_1.cacheKeys.analyticsMonthlySummary(cacheScope));
            if (cached)
                return JSON.parse(cached);
        }
        const normalized = { ...params, start_date, end_date, group_by: 'month' };
        const [water, fertilizer, harvest] = await Promise.all([
            this.getWaterUsage(normalized),
            this.getFertilizerUsage(normalized),
            this.getHarvestSummary(normalized),
        ]);
        const summary = this.combineMonthlySummary(water, fertilizer, harvest);
        if (canCache) {
            await client_2.redisClient.setex(keys_1.cacheKeys.analyticsMonthlySummary(cacheScope), 21600, JSON.stringify(summary));
        }
        return summary;
    }
    async getHarvestSummary(params) {
        const { groupBySql, values, whereSql } = this.buildFilters(params, 'h');
        const result = await client_1.dbPool.query(`SELECT ${groupBySql} AS period,
              SUM(h.total_quantity) AS total_quantity,
              COUNT(*) AS harvest_count
       FROM harvests h
       LEFT JOIN fields f ON f.id = h.field_id
       LEFT JOIN farm_areas fa ON fa.id = f.farm_area_id
       LEFT JOIN sites s ON s.id = fa.site_id
       ${whereSql}
       GROUP BY period
       ORDER BY period ASC`, values);
        return result.rows;
    }
    async getWaterUsage(params) {
        const { groupBySql, values, whereSql } = this.buildFilters(params, 'fe');
        const result = await client_1.dbPool.query(`SELECT ${groupBySql} AS period,
              COALESCE(SUM(fe.daily_water), 0) AS total_water
       FROM fertigation_entries fe
       LEFT JOIN fields f ON f.id = fe.field_id
       LEFT JOIN farm_areas fa ON fa.id = f.farm_area_id
       LEFT JOIN sites s ON s.id = fa.site_id
       ${whereSql}
       GROUP BY period
       ORDER BY period ASC`, values);
        return result.rows;
    }
    async getFertilizerUsage(params) {
        const { groupBySql, values, whereSql } = this.buildFilters(params, 'fe');
        const result = await client_1.dbPool.query(`SELECT ${groupBySql} AS period,
              COALESCE(SUM(fe.total_fertilizer), 0) AS total_fertilizer
       FROM fertigation_entries fe
       LEFT JOIN fields f ON f.id = fe.field_id
       LEFT JOIN farm_areas fa ON fa.id = f.farm_area_id
       LEFT JOIN sites s ON s.id = fa.site_id
       ${whereSql}
       GROUP BY period
       ORDER BY period ASC`, values);
        return result.rows;
    }
    async getEcphTrends(params) {
        const { groupBySql, values, whereSql } = this.buildFilters(params, 'e');
        const result = await client_1.dbPool.query(`SELECT ${groupBySql} AS period,
              AVG(r.ec) AS avg_ec,
              AVG(r.ph) AS avg_ph,
              AVG(r.drain) AS avg_drain,
              AVG(r.percent_drain) AS avg_percent_drain
       FROM ecph_entries e
       LEFT JOIN ecph_valve_readings r ON r.ecph_entry_id = e.id
       LEFT JOIN fields f ON f.id = e.field_id
       LEFT JOIN farm_areas fa ON fa.id = f.farm_area_id
       LEFT JOIN sites s ON s.id = fa.site_id
       ${whereSql}
       GROUP BY period
       ORDER BY period ASC`, values);
        return result.rows;
    }
    buildFilters(params, alias) {
        const groupBy = params.group_by ?? 'month';
        const groupBySql = this.toDateTrunc(groupBy, `${alias}.date`);
        const values = [];
        const where = [];
        values.push(params.organizationId);
        where.push(`COALESCE(${alias}.organization_id, f.organization_id) = $${values.length}`);
        if (params.field_id) {
            values.push(params.field_id);
            where.push(`${alias}.field_id = $${values.length}`);
        }
        if (params.site_id) {
            values.push(params.site_id);
            where.push(`s.id = $${values.length}`);
        }
        if (params.farm_area_id) {
            values.push(params.farm_area_id);
            where.push(`fa.id = $${values.length}`);
        }
        if (params.start_date) {
            values.push(params.start_date);
            where.push(`${alias}.date >= $${values.length}`);
        }
        if (params.end_date) {
            values.push(params.end_date);
            where.push(`${alias}.date <= $${values.length}`);
        }
        const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
        return { groupBySql, values, whereSql };
    }
    ensureDefaultRange(params) {
        if (params.start_date || params.end_date) {
            return {
                start_date: params.start_date ?? '',
                end_date: params.end_date ?? '',
            };
        }
        const today = new Date();
        const start = new Date(today);
        start.setMonth(today.getMonth() - 5);
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        return {
            start_date: start.toISOString().split('T')[0],
            end_date: today.toISOString().split('T')[0],
        };
    }
    combineMonthlySummary(waterRows, fertilizerRows, harvestRows) {
        const map = new Map();
        const upsert = (rows, key, field) => {
            rows.forEach((row) => {
                const period = String(row.period);
                const entry = map.get(period) || {
                    period,
                    totalWater: 0,
                    totalFertilizer: 0,
                    totalHarvest: 0,
                };
                entry[field] = Number(row[key]) || 0;
                map.set(period, entry);
            });
        };
        upsert(waterRows, 'total_water', 'totalWater');
        upsert(fertilizerRows, 'total_fertilizer', 'totalFertilizer');
        upsert(harvestRows, 'total_quantity', 'totalHarvest');
        return Array.from(map.values()).sort((a, b) => a.period.localeCompare(b.period));
    }
    toDateTrunc(groupBy, column) {
        if (groupBy === 'day')
            return `date_trunc('day', ${column})`;
        if (groupBy === 'week')
            return `date_trunc('week', ${column})`;
        if (groupBy === 'month')
            return `date_trunc('month', ${column})`;
        throw new errors_1.AppError('Invalid group_by value', 'VALIDATION_ERROR', 400);
    }
}
exports.AnalyticsService = AnalyticsService;
