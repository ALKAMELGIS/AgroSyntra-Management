import { Router } from 'express';
import { z } from 'zod';
import { AnalyticsService } from '../../services/analytics.service';
import { validate } from '../middleware/validate';
import { dbPool } from '../../db/client';
import { AuthRequest } from '../middleware/auth';
import { requireOrgId } from '../middleware/tenant';
import { assertFieldInOrganization } from '../../utils/tenantValidation';
import { getDailyBrief } from '../../services/dailyBrief.service';

export const analyticsRouter = Router();
const service = new AnalyticsService();

const querySchema = z.object({
  field_id: z.string().uuid().optional(),
  site_id: z.string().uuid().optional(),
  farm_area_id: z.string().uuid().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  group_by: z.enum(['day', 'week', 'month']).optional(),
});

function withOrgId(req: AuthRequest, query: Record<string, unknown>) {
  return { ...query, organizationId: requireOrgId(req) };
}

analyticsRouter.get(
  '/harvest-summary',
  validate({ query: querySchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await service.getHarvestSummary(withOrgId(req, req.query as Record<string, unknown>));
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
);

analyticsRouter.get(
  '/water-usage',
  validate({ query: querySchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await service.getWaterUsage(withOrgId(req, req.query as Record<string, unknown>));
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
);

analyticsRouter.get(
  '/fertilizer-usage',
  validate({ query: querySchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await service.getFertilizerUsage(withOrgId(req, req.query as Record<string, unknown>));
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
);

analyticsRouter.get(
  '/ecph-trends',
  validate({ query: querySchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await service.getEcphTrends(withOrgId(req, req.query as Record<string, unknown>));
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
);

analyticsRouter.get(
  '/monthly-summary',
  validate({ query: querySchema.omit({ group_by: true }) }),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await service.getMonthlySummary(withOrgId(req, req.query as Record<string, unknown>));
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
);

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

const corrQuerySchema = z.object({
  field_id: z.string().uuid(),
  start_date: z.string().regex(isoDateRegex, 'Must be YYYY-MM-DD').optional(),
  end_date: z.string().regex(isoDateRegex, 'Must be YYYY-MM-DD').optional(),
  group_by: z.enum(['week', 'month']).default('week'),
});

analyticsRouter.get(
  '/fertigation-harvest',
  validate({ query: corrQuerySchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const { field_id, start_date, end_date, group_by } = req.query as any;
      const orgId = requireOrgId(req);
      await assertFieldInOrganization(field_id, orgId);

      const trunc = group_by === 'month' ? 'month' : 'week';

      const useDateRange = start_date && end_date;
      const params: any[] = [field_id, orgId];
      let dateClause: string;
      if (useDateRange) {
        dateClause = 'AND date BETWEEN $3 AND $4';
        params.push(start_date, end_date);
      } else {
        dateClause = "AND date >= NOW() - INTERVAL '6 months'";
      }

      const orgJoin = `JOIN fields f ON f.id = field_id AND f.organization_id = $2`;

      const [fertResult, harvResult] = await Promise.all([
        dbPool.query(
          `SELECT date_trunc('${trunc}', date) AS period,
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
           GROUP BY period ORDER BY period`,
          params,
        ),
        dbPool.query(
          `SELECT date_trunc('${trunc}', date) AS period,
                  COALESCE(SUM(total_quantity), 0) AS harvest_kg
           FROM harvests
           ${orgJoin}
           WHERE field_id = $1 ${dateClause}
           GROUP BY period ORDER BY period`,
          params,
        ),
      ]);

      const periodMap: Record<string, any> = {};
      for (const r of fertResult.rows) {
        const key = r.period.toISOString().slice(0, 10);
        periodMap[key] = { period: key, waterM3: Number(r.water_m3), fertilizerKg: Number(r.fertilizer_kg), harvestKg: 0 };
      }
      for (const r of harvResult.rows) {
        const key = r.period.toISOString().slice(0, 10);
        if (!periodMap[key]) periodMap[key] = { period: key, waterM3: 0, fertilizerKg: 0, harvestKg: 0 };
        periodMap[key].harvestKg = Number(r.harvest_kg);
      }

      const data = Object.values(periodMap).sort((a: any, b: any) => a.period.localeCompare(b.period));
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

const dailyBriefQuerySchema = z.object({
  site_id: z.string().uuid().optional(),
});

analyticsRouter.get(
  '/daily-brief',
  validate({ query: dailyBriefQuerySchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const orgId = requireOrgId(req);
      const { site_id: siteId } = req.query as { site_id?: string };
      const data = await getDailyBrief({ organizationId: orgId, siteId: siteId || null });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);
