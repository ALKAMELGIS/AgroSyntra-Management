import { AnalyticsService } from '../services/analytics.service';
import { redisClient } from '../cache/client';
import { cacheKeys } from '../cache/keys';
import { logger } from '../utils/logger';
import { dbPool } from '../db/client';

const service = new AnalyticsService();

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

export const analyticsAggregateJob = {
  async run() {
    const { start_date, end_date } = buildDefaultRange();
    const orgs = await dbPool.query('SELECT id FROM organizations WHERE is_active = true');
    const summaries: Array<{ organizationId: string; rows: unknown[] }> = [];

    for (const org of orgs.rows) {
      const organizationId = String(org.id);
      const summary = await service.getMonthlySummary({ organizationId, start_date, end_date });
      const cacheScope = `${organizationId}:${start_date}:${end_date}`;
      await redisClient.setex(cacheKeys.analyticsMonthlySummary(cacheScope), 21600, JSON.stringify(summary));
      summaries.push({ organizationId, rows: summary });
    }

    logger.info({ start_date, end_date, orgCount: summaries.length }, 'Analytics monthly summary cached');
    return summaries;
  },
};
