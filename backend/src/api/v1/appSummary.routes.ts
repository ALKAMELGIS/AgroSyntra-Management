import { Router, Response } from 'express';
import { z } from 'zod';
import { auth, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/errors';
import { dbPool } from '../../db/client';
import {
  APP_SUMMARY_DEFAULTS,
  canEditSummaryEmail,
  rowFromDb,
  type AppSummaryPayload,
} from '../../data/appSummaryDefaults';

const appSummaryRouter = Router();
appSummaryRouter.use(auth);

const summaryRowSchema = z.object({
  area: z.string().min(1).max(200),
  today: z.string().max(2000),
  withApp: z.string().max(2000),
});

const contentsItemSchema = z.object({
  module: z.string().min(1).max(200),
  description: z.string().max(2000),
  replaces: z.string().max(500),
  path: z.string().min(1).max(300),
});

const contentsGroupSchema = z.object({
  group: z.string().min(1).max(200),
  items: z.array(contentsItemSchema),
});

const putSchema = z.object({
  introText: z.string().max(5000),
  closingText: z.string().max(5000),
  summaryRows: z.array(summaryRowSchema).min(1).max(50),
  contentsGroups: z.array(contentsGroupSchema).max(30),
});

async function ensureRow(): Promise<AppSummaryPayload & { updatedAt: string | null }> {
  const existing = await dbPool.query(`SELECT * FROM app_summary_content WHERE id = 1`);
  if (existing.rows[0]) {
    return rowFromDb(existing.rows[0]);
  }

  const d = APP_SUMMARY_DEFAULTS;
  await dbPool.query(
    `INSERT INTO app_summary_content (id, intro_text, closing_text, summary_rows, contents_groups)
     VALUES (1, $1, $2, $3::jsonb, $4::jsonb)`,
    [d.introText, d.closingText, JSON.stringify(d.summaryRows), JSON.stringify(d.contentsGroups)]
  );
  const inserted = await dbPool.query(`SELECT * FROM app_summary_content WHERE id = 1`);
  return rowFromDb(inserted.rows[0]);
}

appSummaryRouter.get(
  '/',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = await ensureRow();
    res.json({
      success: true,
      data: {
        ...data,
        canEdit: canEditSummaryEmail(req.user?.email),
      },
    });
  })
);

appSummaryRouter.put(
  '/',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!canEditSummaryEmail(req.user?.email)) {
      throw new AppError('Only the designated editor can update this page', 'FORBIDDEN', 403);
    }

    const body = putSchema.parse(req.body);
    await dbPool.query(
      `INSERT INTO app_summary_content (id, intro_text, closing_text, summary_rows, contents_groups, updated_at, updated_by)
       VALUES (1, $1, $2, $3::jsonb, $4::jsonb, NOW(), $5)
       ON CONFLICT (id) DO UPDATE SET
         intro_text = EXCLUDED.intro_text,
         closing_text = EXCLUDED.closing_text,
         summary_rows = EXCLUDED.summary_rows,
         contents_groups = EXCLUDED.contents_groups,
         updated_at = NOW(),
         updated_by = EXCLUDED.updated_by`,
      [
        body.introText,
        body.closingText,
        JSON.stringify(body.summaryRows),
        JSON.stringify(body.contentsGroups),
        req.user!.userId,
      ]
    );

    const result = await dbPool.query(`SELECT * FROM app_summary_content WHERE id = 1`);
    res.json({
      success: true,
      data: {
        ...rowFromDb(result.rows[0]),
        canEdit: canEditSummaryEmail(req.user?.email),
      },
    });
  })
);

export { appSummaryRouter };
