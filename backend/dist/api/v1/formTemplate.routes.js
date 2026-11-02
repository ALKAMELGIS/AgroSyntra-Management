"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formTemplateRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const asyncHandler_1 = require("../../utils/asyncHandler");
const client_1 = require("../../db/client");
exports.formTemplateRouter = (0, express_1.Router)();
exports.formTemplateRouter.use(auth_1.auth);
const getOrgId = (req) => req.user?.organizationId || null;
const ADMIN_ROLES = ['ceo', 'farm_manager', 'operation_manager'];
const templateSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    category: zod_1.z.string().min(1),
    slug: zod_1.z.string().min(1).optional(),
    description: zod_1.z.string().optional().nullable(),
    icon: zod_1.z.string().optional().nullable(),
    routePath: zod_1.z.string().optional().nullable(),
    columnsConfig: zod_1.z.any().optional().nullable(),
    siteId: zod_1.z.string().uuid().optional().nullable(),
});
// ---------- Template CRUD ----------
exports.formTemplateRouter.get('/', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const orgId = getOrgId(req);
    const result = await client_1.dbPool.query(`SELECT ft.*, s.name AS site_name
       FROM form_templates ft
       LEFT JOIN sites s ON s.id = ft.created_by_site_id
       WHERE ft.organization_id IS NULL OR ft.organization_id = $1
       ORDER BY ft.category, ft.name`, [orgId]);
    res.json({ success: true, data: result.rows });
}));
exports.formTemplateRouter.get('/all', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const orgId = getOrgId(req);
    const result = await client_1.dbPool.query(`SELECT ft.*, s.name AS site_name
       FROM form_templates ft
       LEFT JOIN sites s ON s.id = ft.created_by_site_id
       WHERE (ft.organization_id IS NULL OR ft.organization_id = $1)
       ORDER BY ft.category, s.name NULLS FIRST, ft.name`, [orgId]);
    res.json({ success: true, data: result.rows });
}));
exports.formTemplateRouter.get('/site/:siteId', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { siteId } = req.params;
    const orgId = getOrgId(req);
    const result = await client_1.dbPool.query(`SELECT ft.*, sft.is_default, sft.sort_order, sft.is_visible
       FROM site_form_templates sft
       JOIN form_templates ft ON ft.id = sft.template_id
       WHERE sft.site_id = $1
         AND (ft.organization_id IS NULL OR ft.organization_id = $2)
       ORDER BY ft.category, sft.sort_order, ft.name`, [siteId, orgId]);
    res.json({ success: true, data: result.rows });
}));
exports.formTemplateRouter.get('/categories', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const orgId = getOrgId(req);
    const result = await client_1.dbPool.query(`SELECT category, COUNT(*) AS count
       FROM form_templates
       WHERE organization_id IS NULL OR organization_id = $1
       GROUP BY category
       ORDER BY category`, [orgId]);
    res.json({ success: true, data: result.rows });
}));
exports.formTemplateRouter.post('/', (0, auth_1.authorize)('ceo', 'farm_manager', 'operation_manager', 'agronomist', 'worker'), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const data = templateSchema.parse(req.body);
    const orgId = getOrgId(req);
    const slug = data.slug ||
        data.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');
    const result = await client_1.dbPool.query(`INSERT INTO form_templates
         (organization_id, slug, name, category, description, icon, route_path, columns_config, is_system, created_by_site_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE, $9)
       RETURNING *`, [
        orgId,
        slug,
        data.name.trim(),
        data.category,
        data.description || null,
        data.icon || null,
        data.routePath || null,
        data.columnsConfig ? JSON.stringify(data.columnsConfig) : null,
        data.siteId || null,
    ]);
    res.status(201).json({ success: true, data: result.rows[0] });
}));
exports.formTemplateRouter.put('/:id', (0, auth_1.authorize)('ceo', 'farm_manager', 'operation_manager', 'agronomist', 'worker'), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const data = templateSchema.partial().parse(req.body);
    const userRole = req.user.role;
    const existing = await client_1.dbPool.query(`SELECT is_system, created_by_site_id FROM form_templates WHERE id = $1`, [id]);
    if (existing.rows[0]?.is_system) {
        return res.status(403).json({ success: false, message: 'Cannot edit built-in templates' });
    }
    const ownerSite = existing.rows[0]?.created_by_site_id;
    if (ownerSite && !ADMIN_ROLES.includes(userRole) && data.siteId !== ownerSite) {
        return res.status(403).json({ success: false, message: 'You can only edit templates owned by your site' });
    }
    const sets = [];
    const vals = [];
    let idx = 1;
    const addSet = (col, val) => {
        sets.push(`${col} = $${idx++}`);
        vals.push(val);
    };
    if (data.name !== undefined)
        addSet('name', data.name.trim());
    if (data.category !== undefined)
        addSet('category', data.category);
    if (data.description !== undefined)
        addSet('description', data.description || null);
    if (data.icon !== undefined)
        addSet('icon', data.icon || null);
    if (data.routePath !== undefined)
        addSet('route_path', data.routePath || null);
    if (data.columnsConfig !== undefined)
        addSet('columns_config', data.columnsConfig ? JSON.stringify(data.columnsConfig) : null);
    addSet('updated_at', new Date().toISOString());
    if (sets.length === 0)
        return res.json({ success: true });
    vals.push(id);
    const result = await client_1.dbPool.query(`UPDATE form_templates SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, vals);
    res.json({ success: true, data: result.rows[0] });
}));
exports.formTemplateRouter.delete('/:id', (0, auth_1.authorize)('ceo', 'farm_manager', 'operation_manager', 'agronomist', 'worker'), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const userRole = req.user.role;
    const tpl = await client_1.dbPool.query(`SELECT is_system, created_by_site_id FROM form_templates WHERE id = $1`, [id]);
    if (tpl.rows[0]?.is_system) {
        return res.status(400).json({ success: false, message: 'Cannot delete built-in templates' });
    }
    const ownerSite = tpl.rows[0]?.created_by_site_id;
    if (ownerSite && !ADMIN_ROLES.includes(userRole)) {
        const { activeSiteId } = zod_1.z.object({ activeSiteId: zod_1.z.string().uuid().optional() }).parse(req.query);
        if (activeSiteId !== ownerSite) {
            return res.status(403).json({ success: false, message: 'You can only delete templates owned by your site' });
        }
    }
    await client_1.dbPool.query(`DELETE FROM form_templates WHERE id = $1 AND is_system = FALSE`, [id]);
    res.json({ success: true });
}));
// ---------- Copy template ----------
exports.formTemplateRouter.post('/:id/copy', (0, auth_1.authorize)('ceo', 'farm_manager', 'operation_manager', 'agronomist', 'worker'), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const { siteId } = zod_1.z.object({ siteId: zod_1.z.string().uuid() }).parse(req.body);
    const orgId = getOrgId(req);
    const source = await client_1.dbPool.query(`SELECT * FROM form_templates WHERE id = $1`, [id]);
    if (source.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Template not found' });
    }
    const src = source.rows[0];
    const newSlug = `${src.slug}-copy-${Date.now()}`;
    const client = await client_1.dbPool.connect();
    try {
        await client.query('BEGIN');
        const ins = await client.query(`INSERT INTO form_templates
           (organization_id, slug, name, category, description, icon, route_path, columns_config, is_system, created_by_site_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE, $9)
         RETURNING *`, [
            orgId,
            newSlug,
            `${src.name} (copy)`,
            src.category,
            src.description,
            src.icon,
            src.route_path,
            src.columns_config ? (typeof src.columns_config === 'string' ? src.columns_config : JSON.stringify(src.columns_config)) : null,
            siteId,
        ]);
        const newId = ins.rows[0].id;
        await client.query(`INSERT INTO site_form_templates (site_id, template_id, sort_order)
         VALUES ($1, $2, 0)
         ON CONFLICT (site_id, template_id) DO NOTHING`, [siteId, newId]);
        await client.query('COMMIT');
        res.status(201).json({ success: true, data: ins.rows[0] });
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
}));
// ---------- Add single template to site ----------
exports.formTemplateRouter.post('/site/:siteId/add', (0, auth_1.authorize)('ceo', 'farm_manager', 'operation_manager', 'agronomist', 'worker'), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { siteId } = req.params;
    const { templateId } = zod_1.z.object({ templateId: zod_1.z.string().uuid() }).parse(req.body);
    await client_1.dbPool.query(`INSERT INTO site_form_templates (site_id, template_id, sort_order)
       VALUES ($1, $2, COALESCE((SELECT MAX(sort_order)+1 FROM site_form_templates WHERE site_id=$1), 0))
       ON CONFLICT (site_id, template_id) DO NOTHING`, [siteId, templateId]);
    res.json({ success: true });
}));
// ---------- Site assignment ----------
exports.formTemplateRouter.post('/site/:siteId/assign', (0, auth_1.authorize)('ceo', 'farm_manager', 'operation_manager'), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { siteId } = req.params;
    const { templateIds } = zod_1.z
        .object({ templateIds: zod_1.z.array(zod_1.z.string().uuid()) })
        .parse(req.body);
    const client = await client_1.dbPool.connect();
    try {
        await client.query('BEGIN');
        // Preserve existing is_default flags before re-assigning
        const existingMeta = await client.query(`SELECT template_id, is_default, is_visible FROM site_form_templates WHERE site_id = $1`, [siteId]);
        const defaultSet = new Set(existingMeta.rows.filter((r) => r.is_default).map((r) => r.template_id));
        const visibleByTemplate = new Map(existingMeta.rows.map((r) => [r.template_id, r.is_visible]));
        await client.query(`DELETE FROM site_form_templates WHERE site_id = $1`, [siteId]);
        for (let i = 0; i < templateIds.length; i++) {
            const tid = templateIds[i];
            const isDefault = defaultSet.has(tid);
            const isVisible = visibleByTemplate.has(tid) ? visibleByTemplate.get(tid) : true;
            await client.query(`INSERT INTO site_form_templates (site_id, template_id, sort_order, is_default, is_visible)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (site_id, template_id) DO UPDATE SET sort_order = $3, is_default = $4, is_visible = $5`, [siteId, tid, i, isDefault, isVisible]);
        }
        await client.query('COMMIT');
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
    res.json({ success: true });
}));
exports.formTemplateRouter.put('/site/:siteId/default', (0, auth_1.authorize)('ceo', 'farm_manager', 'operation_manager', 'agronomist', 'worker'), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { siteId } = req.params;
    const { templateId, category } = zod_1.z
        .object({ templateId: zod_1.z.string().uuid(), category: zod_1.z.string().min(1) })
        .parse(req.body);
    const client = await client_1.dbPool.connect();
    try {
        await client.query('BEGIN');
        const tplResult = await client.query(`SELECT slug FROM form_templates WHERE id = $1`, [templateId]);
        const slug = tplResult.rows[0]?.slug;
        const isSprayOrDrench = slug === 'pest-spray' || slug === 'pest-drench';
        if (isSprayOrDrench) {
            await client.query(`UPDATE site_form_templates sft
           SET is_default = FALSE
           FROM form_templates ft
           WHERE sft.template_id = ft.id
             AND sft.site_id = $1
             AND ft.category = $2
             AND ft.slug NOT IN ('pest-spray', 'pest-drench')`, [siteId, category]);
        }
        else {
            await client.query(`UPDATE site_form_templates sft
           SET is_default = FALSE
           FROM form_templates ft
           WHERE sft.template_id = ft.id
             AND sft.site_id = $1
             AND ft.category = $2`, [siteId, category]);
        }
        await client.query(`UPDATE site_form_templates
         SET is_default = TRUE
         WHERE site_id = $1 AND template_id = $2`, [siteId, templateId]);
        await client.query('COMMIT');
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
    res.json({ success: true });
}));
exports.formTemplateRouter.put('/site/:siteId/:templateId/visibility', (0, auth_1.authorize)('ceo', 'farm_manager', 'operation_manager', 'agronomist', 'worker'), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { siteId, templateId } = req.params;
    const { visible } = zod_1.z.object({ visible: zod_1.z.boolean() }).parse(req.body);
    const result = await client_1.dbPool.query(`UPDATE site_form_templates SET is_visible = $3
       WHERE site_id = $1 AND template_id = $2
       RETURNING id`, [siteId, templateId, visible]);
    if (result.rowCount === 0) {
        res.status(404).json({ success: false, message: 'Template not assigned to this site' });
        return;
    }
    res.json({ success: true, data: { visible } });
}));
exports.formTemplateRouter.delete('/site/:siteId/:templateId', (0, auth_1.authorize)('ceo', 'farm_manager', 'operation_manager'), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { siteId, templateId } = req.params;
    await client_1.dbPool.query(`DELETE FROM site_form_templates WHERE site_id = $1 AND template_id = $2`, [siteId, templateId]);
    res.json({ success: true });
}));
