import { Router, Response } from 'express';
import { z } from 'zod';
import { auth, authorize, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { dbPool } from '../../db/client';

export const formTemplateRouter = Router();
formTemplateRouter.use(auth);

const getOrgId = (req: AuthRequest) => (req as any).user?.organizationId || null;

const ADMIN_ROLES = ['ceo', 'farm_manager', 'operation_manager'];

const templateSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  slug: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  icon: z.string().optional().nullable(),
  routePath: z.string().optional().nullable(),
  columnsConfig: z.any().optional().nullable(),
  siteId: z.string().uuid().optional().nullable(),
});

// ---------- Template CRUD ----------

formTemplateRouter.get(
  '/',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const orgId = getOrgId(req);
    const result = await dbPool.query(
      `SELECT ft.*, s.name AS site_name
       FROM form_templates ft
       LEFT JOIN sites s ON s.id = ft.created_by_site_id
       WHERE ft.organization_id IS NULL OR ft.organization_id = $1
       ORDER BY ft.category, ft.name`,
      [orgId],
    );
    res.json({ success: true, data: result.rows });
  }),
);

formTemplateRouter.get(
  '/all',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const orgId = getOrgId(req);
    const result = await dbPool.query(
      `SELECT ft.*, s.name AS site_name
       FROM form_templates ft
       LEFT JOIN sites s ON s.id = ft.created_by_site_id
       WHERE (ft.organization_id IS NULL OR ft.organization_id = $1)
       ORDER BY ft.category, s.name NULLS FIRST, ft.name`,
      [orgId],
    );
    res.json({ success: true, data: result.rows });
  }),
);

formTemplateRouter.get(
  '/site/:siteId',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { siteId } = req.params;
    const orgId = getOrgId(req);

    const result = await dbPool.query(
      `SELECT ft.*, sft.is_default, sft.sort_order, sft.is_visible
       FROM site_form_templates sft
       JOIN form_templates ft ON ft.id = sft.template_id
       WHERE sft.site_id = $1
         AND (ft.organization_id IS NULL OR ft.organization_id = $2)
       ORDER BY ft.category, sft.sort_order, ft.name`,
      [siteId, orgId],
    );
    res.json({ success: true, data: result.rows });
  }),
);

formTemplateRouter.get(
  '/categories',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const orgId = getOrgId(req);
    const result = await dbPool.query(
      `SELECT category, COUNT(*) AS count
       FROM form_templates
       WHERE organization_id IS NULL OR organization_id = $1
       GROUP BY category
       ORDER BY category`,
      [orgId],
    );
    res.json({ success: true, data: result.rows });
  }),
);

formTemplateRouter.post(
  '/',
  authorize('ceo', 'farm_manager', 'operation_manager', 'agronomist', 'worker'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = templateSchema.parse(req.body);
    const orgId = getOrgId(req);
    const slug =
      data.slug ||
      data.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

    const result = await dbPool.query(
      `INSERT INTO form_templates
         (organization_id, slug, name, category, description, icon, route_path, columns_config, is_system, created_by_site_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE, $9)
       RETURNING *`,
      [
        orgId,
        slug,
        data.name.trim(),
        data.category,
        data.description || null,
        data.icon || null,
        data.routePath || null,
        data.columnsConfig ? JSON.stringify(data.columnsConfig) : null,
        data.siteId || null,
      ],
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  }),
);

formTemplateRouter.put(
  '/:id',
  authorize('ceo', 'farm_manager', 'operation_manager', 'agronomist', 'worker'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const data = templateSchema.partial().parse(req.body);
    const userRole = req.user!.role;

    const existing = await dbPool.query(`SELECT is_system, created_by_site_id FROM form_templates WHERE id = $1`, [id]);
    if (existing.rows[0]?.is_system) {
      return res.status(403).json({ success: false, message: 'Cannot edit built-in templates' });
    }
    const ownerSite = existing.rows[0]?.created_by_site_id;
    if (ownerSite && !ADMIN_ROLES.includes(userRole) && data.siteId !== ownerSite) {
      return res.status(403).json({ success: false, message: 'You can only edit templates owned by your site' });
    }

    const sets: string[] = [];
    const vals: any[] = [];
    let idx = 1;

    const addSet = (col: string, val: any) => {
      sets.push(`${col} = $${idx++}`);
      vals.push(val);
    };

    if (data.name !== undefined) addSet('name', data.name.trim());
    if (data.category !== undefined) addSet('category', data.category);
    if (data.description !== undefined) addSet('description', data.description || null);
    if (data.icon !== undefined) addSet('icon', data.icon || null);
    if (data.routePath !== undefined) addSet('route_path', data.routePath || null);
    if (data.columnsConfig !== undefined)
      addSet('columns_config', data.columnsConfig ? JSON.stringify(data.columnsConfig) : null);
    addSet('updated_at', new Date().toISOString());

    if (sets.length === 0) return res.json({ success: true });

    vals.push(id);
    const result = await dbPool.query(
      `UPDATE form_templates SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      vals,
    );
    res.json({ success: true, data: result.rows[0] });
  }),
);

formTemplateRouter.delete(
  '/:id',
  authorize('ceo', 'farm_manager', 'operation_manager', 'agronomist', 'worker'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const userRole = req.user!.role;
    const tpl = await dbPool.query(`SELECT is_system, created_by_site_id FROM form_templates WHERE id = $1`, [id]);
    if (tpl.rows[0]?.is_system) {
      return res.status(400).json({ success: false, message: 'Cannot delete built-in templates' });
    }
    const ownerSite = tpl.rows[0]?.created_by_site_id;
    if (ownerSite && !ADMIN_ROLES.includes(userRole)) {
      const { activeSiteId } = z.object({ activeSiteId: z.string().uuid().optional() }).parse(req.query);
      if (activeSiteId !== ownerSite) {
        return res.status(403).json({ success: false, message: 'You can only delete templates owned by your site' });
      }
    }
    await dbPool.query(`DELETE FROM form_templates WHERE id = $1 AND is_system = FALSE`, [id]);
    res.json({ success: true });
  }),
);

// ---------- Copy template ----------

formTemplateRouter.post(
  '/:id/copy',
  authorize('ceo', 'farm_manager', 'operation_manager', 'agronomist', 'worker'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { siteId } = z.object({ siteId: z.string().uuid() }).parse(req.body);
    const orgId = getOrgId(req);

    const source = await dbPool.query(`SELECT * FROM form_templates WHERE id = $1`, [id]);
    if (source.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }
    const src = source.rows[0];
    const newSlug = `${src.slug}-copy-${Date.now()}`;

    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');
      const ins = await client.query(
        `INSERT INTO form_templates
           (organization_id, slug, name, category, description, icon, route_path, columns_config, is_system, created_by_site_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE, $9)
         RETURNING *`,
        [
          orgId,
          newSlug,
          `${src.name} (copy)`,
          src.category,
          src.description,
          src.icon,
          src.route_path,
          src.columns_config ? (typeof src.columns_config === 'string' ? src.columns_config : JSON.stringify(src.columns_config)) : null,
          siteId,
        ],
      );
      const newId = ins.rows[0].id;
      await client.query(
        `INSERT INTO site_form_templates (site_id, template_id, sort_order)
         VALUES ($1, $2, 0)
         ON CONFLICT (site_id, template_id) DO NOTHING`,
        [siteId, newId],
      );
      await client.query('COMMIT');
      res.status(201).json({ success: true, data: ins.rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }),
);

// ---------- Add single template to site ----------

formTemplateRouter.post(
  '/site/:siteId/add',
  authorize('ceo', 'farm_manager', 'operation_manager', 'agronomist', 'worker'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { siteId } = req.params;
    const { templateId } = z.object({ templateId: z.string().uuid() }).parse(req.body);
    await dbPool.query(
      `INSERT INTO site_form_templates (site_id, template_id, sort_order)
       VALUES ($1, $2, COALESCE((SELECT MAX(sort_order)+1 FROM site_form_templates WHERE site_id=$1), 0))
       ON CONFLICT (site_id, template_id) DO NOTHING`,
      [siteId, templateId],
    );
    res.json({ success: true });
  }),
);

// ---------- Site assignment ----------

formTemplateRouter.post(
  '/site/:siteId/assign',
  authorize('ceo', 'farm_manager', 'operation_manager'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { siteId } = req.params;
    const { templateIds } = z
      .object({ templateIds: z.array(z.string().uuid()) })
      .parse(req.body);

    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');
      // Preserve existing is_default flags before re-assigning
      const existingMeta = await client.query(
        `SELECT template_id, is_default, is_visible FROM site_form_templates WHERE site_id = $1`,
        [siteId],
      );
      const defaultSet = new Set(
        existingMeta.rows.filter((r: { is_default: boolean }) => r.is_default).map((r: { template_id: string }) => r.template_id),
      );
      const visibleByTemplate = new Map(
        existingMeta.rows.map((r: { template_id: string; is_visible: boolean }) => [r.template_id, r.is_visible]),
      );

      await client.query(`DELETE FROM site_form_templates WHERE site_id = $1`, [siteId]);
      for (let i = 0; i < templateIds.length; i++) {
        const tid = templateIds[i];
        const isDefault = defaultSet.has(tid);
        const isVisible = visibleByTemplate.has(tid) ? visibleByTemplate.get(tid) : true;
        await client.query(
          `INSERT INTO site_form_templates (site_id, template_id, sort_order, is_default, is_visible)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (site_id, template_id) DO UPDATE SET sort_order = $3, is_default = $4, is_visible = $5`,
          [siteId, tid, i, isDefault, isVisible],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    res.json({ success: true });
  }),
);

formTemplateRouter.put(
  '/site/:siteId/default',
  authorize('ceo', 'farm_manager', 'operation_manager', 'agronomist', 'worker'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { siteId } = req.params;
    const { templateId, category } = z
      .object({ templateId: z.string().uuid(), category: z.string().min(1) })
      .parse(req.body);

    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');

      const tplResult = await client.query(`SELECT slug FROM form_templates WHERE id = $1`, [templateId]);
      const slug = tplResult.rows[0]?.slug;
      const isSprayOrDrench = slug === 'pest-spray' || slug === 'pest-drench';

      if (isSprayOrDrench) {
        await client.query(
          `UPDATE site_form_templates sft
           SET is_default = FALSE
           FROM form_templates ft
           WHERE sft.template_id = ft.id
             AND sft.site_id = $1
             AND ft.category = $2
             AND ft.slug NOT IN ('pest-spray', 'pest-drench')`,
          [siteId, category],
        );
      } else {
        await client.query(
          `UPDATE site_form_templates sft
           SET is_default = FALSE
           FROM form_templates ft
           WHERE sft.template_id = ft.id
             AND sft.site_id = $1
             AND ft.category = $2`,
          [siteId, category],
        );
      }

      await client.query(
        `UPDATE site_form_templates
         SET is_default = TRUE
         WHERE site_id = $1 AND template_id = $2`,
        [siteId, templateId],
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    res.json({ success: true });
  }),
);

formTemplateRouter.put(
  '/site/:siteId/:templateId/visibility',
  authorize('ceo', 'farm_manager', 'operation_manager', 'agronomist', 'worker'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { siteId, templateId } = req.params;
    const { visible } = z.object({ visible: z.boolean() }).parse(req.body);
    const result = await dbPool.query(
      `UPDATE site_form_templates SET is_visible = $3
       WHERE site_id = $1 AND template_id = $2
       RETURNING id`,
      [siteId, templateId, visible],
    );
    if (result.rowCount === 0) {
      res.status(404).json({ success: false, message: 'Template not assigned to this site' });
      return;
    }
    res.json({ success: true, data: { visible } });
  }),
);

formTemplateRouter.delete(
  '/site/:siteId/:templateId',
  authorize('ceo', 'farm_manager', 'operation_manager'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { siteId, templateId } = req.params;
    await dbPool.query(
      `DELETE FROM site_form_templates WHERE site_id = $1 AND template_id = $2`,
      [siteId, templateId],
    );
    res.json({ success: true });
  }),
);

