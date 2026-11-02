"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyticsAggregateJob = void 0;
const analytics_service_1 = require("../services/analytics.service");
const client_1 = require("../cache/client");
const keys_1 = require("../cache/keys");
const logger_1 = require("../utils/logger");
const client_2 = require("../db/client");
const service = new analytics_service_1.AnalyticsService();
const buildDefaultRange = () => {
    const today = new Date();
    const start = new Date(today);
    start.setMonth(today.getMonth() - 5);
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    return {
        start_date: start.toISOString().split('T')[0],
        end_date: today.toISOString().split('T')[0],
    };
};
exports.analyticsAggregateJob = {
    async run() {
        const { start_date, end_date } = buildDefaultRange();
        const orgs = await client_2.dbPool.query('SELECT id FROM organizations WHERE is_active = true');
        const summaries = [];
        for (const org of orgs.rows) {
            const organizationId = String(org.id);
            const summary = await service.getMonthlySummary({ organizationId, start_date, end_date });
            const cacheScope = `${organizationId}:${start_date}:${end_date}`;
            await client_1.redisClient.setex(keys_1.cacheKeys.analyticsMonthlySummary(cacheScope), 21600, JSON.stringify(summary));
            summaries.push({ organizationId, rows: summary });
        }
        logger_1.logger.info({ start_date, end_date, orgCount: summaries.length }, 'Analytics monthly summary cached');
        return summaries;
    },
};
