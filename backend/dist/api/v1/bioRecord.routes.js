"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bioRecordRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const asyncHandler_1 = require("../../utils/asyncHandler");
const tenant_1 = require("../middleware/tenant");
const tenantValidation_1 = require("../../utils/tenantValidation");
const client_1 = require("../../db/client");
exports.bioRecordRouter = (0, express_1.Router)();
exports.bioRecordRouter.use(auth_1.auth);
exports.bioRecordRouter.use(auth_1.authorizeFieldStaff);
const getOrgId = (req) => req.user?.organizationId || null;
const getUserId = (req) => req.user.userId;
// ──────────────────────── Product Catalog ────────────────────────
exports.bioRecordRouter.post('/catalog/import', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const orgId = getOrgId(req);
    const { products } = zod_1.z.object({
        products: zod_1.z.array(zod_1.z.object({
            itemCode: zod_1.z.string().min(1),
            itemName: zod_1.z.string().min(1),
        })),
    }).parse(req.body);
    const client = await client_1.dbPool.connect();
    try {
        await client.query('BEGIN');
        let inserted = 0;
        for (const p of products) {
            const r = await client.query(`INSERT INTO bio_products_catalog (item_code, item_name, organization_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (organization_id, item_code) DO UPDATE SET item_name = EXCLUDED.item_name
           RETURNING id`, [p.itemCode.trim(), p.itemName.trim(), orgId]);
            if (r.rowCount && r.rowCount > 0)
                inserted++;
        }
        await client.query('COMMIT');
        res.json({ success: true, data: { imported: inserted } });
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
}));
exports.bioRecordRouter.get('/catalog', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const orgId = getOrgId(req);
    const search = (req.query.search || '').trim();
    const all = req.query.all === 'true';
    const limit = all ? 5000 : Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = all ? 0 : (parseInt(req.query.offset) || 0);
    let query;
    let params;
    if (search) {
        query = `SELECT * FROM bio_products_catalog
               WHERE (organization_id IS NULL OR organization_id = $1)
                 AND (item_code ILIKE $2 OR item_name ILIKE $2)
               ORDER BY item_code
               LIMIT $3 OFFSET $4`;
        params = [orgId, `%${search}%`, limit, offset];
    }
    else {
        query = `SELECT * FROM bio_products_catalog
               WHERE organization_id IS NULL OR organization_id = $1
               ORDER BY item_code
               LIMIT $2 OFFSET $3`;
        params = [orgId, limit, offset];
    }
    const result = await client_1.dbPool.query(query, params);
    res.json({ success: true, data: result.rows });
}));
exports.bioRecordRouter.post('/catalog/single', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const orgId = getOrgId(req);
    const data = zod_1.z.object({
        itemCode: zod_1.z.string().min(1),
        itemName: zod_1.z.string().min(1),
        perPackage: zod_1.z.number().int().optional().nullable(),
        pricePerPackage: zod_1.z.number().optional().nullable(),
    }).parse(req.body);
    const result = await client_1.dbPool.query(`INSERT INTO bio_products_catalog (item_code, item_name, per_package, price_per_package, organization_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (organization_id, item_code) DO UPDATE SET
         item_name = EXCLUDED.item_name, per_package = EXCLUDED.per_package,
         price_per_package = EXCLUDED.price_per_package
       RETURNING *`, [data.itemCode.trim(), data.itemName.trim(), data.perPackage ?? null, data.pricePerPackage ?? null, orgId]);
    res.json({ success: true, data: result.rows[0] });
}));
exports.bioRecordRouter.put('/catalog/:id', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const data = zod_1.z.object({
        itemCode: zod_1.z.string().min(1).optional(),
        itemName: zod_1.z.string().min(1).optional(),
        perPackage: zod_1.z.number().int().optional().nullable(),
        pricePerPackage: zod_1.z.number().optional().nullable(),
    }).parse(req.body);
    const sets = [];
    const params = [];
    let idx = 1;
    if (data.itemCode !== undefined) {
        sets.push(`item_code = $${idx++}`);
        params.push(data.itemCode.trim());
    }
    if (data.itemName !== undefined) {
        sets.push(`item_name = $${idx++}`);
        params.push(data.itemName.trim());
    }
    if (data.perPackage !== undefined) {
        sets.push(`per_package = $${idx++}`);
        params.push(data.perPackage);
    }
    if (data.pricePerPackage !== undefined) {
        sets.push(`price_per_package = $${idx++}`);
        params.push(data.pricePerPackage);
    }
    if (sets.length === 0) {
        return res.json({ success: true, data: null });
    }
    params.push(id);
    const result = await client_1.dbPool.query(`UPDATE bio_products_catalog SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, params);
    res.json({ success: true, data: result.rows[0] || null });
}));
exports.bioRecordRouter.delete('/catalog/:id', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    await client_1.dbPool.query(`DELETE FROM bio_products_catalog WHERE id = $1`, [id]);
    res.json({ success: true });
}));
exports.bioRecordRouter.post('/catalog/sync-from-fields', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const orgId = getOrgId(req);
    const client = await client_1.dbPool.connect();
    try {
        await client.query('BEGIN');
        const uniqueProducts = await client.query(`SELECT DISTINCT ON (LOWER(TRIM(fp.product_name)))
           fp.item_code, fp.product_name, fp.per_package, fp.price_per_package
         FROM bio_record_field_products fp
         JOIN bio_record_field_setup bs ON bs.id = fp.field_setup_id
         WHERE bs.organization_id IS NULL OR bs.organization_id = $1
         ORDER BY LOWER(TRIM(fp.product_name)), fp.item_code NULLS LAST`, [orgId]);
        let added = 0;
        for (const p of uniqueProducts.rows) {
            const code = (p.item_code || p.product_name.substring(0, 20).replace(/\s+/g, '-').toUpperCase()).trim();
            const r = await client.query(`INSERT INTO bio_products_catalog (item_code, item_name, per_package, price_per_package, organization_id)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (organization_id, item_code) DO UPDATE SET
             item_name = EXCLUDED.item_name,
             per_package = COALESCE(EXCLUDED.per_package, bio_products_catalog.per_package),
             price_per_package = COALESCE(EXCLUDED.price_per_package, bio_products_catalog.price_per_package)
           RETURNING id`, [code, p.product_name.trim(), p.per_package ?? null, p.price_per_package ?? null, orgId]);
            if (r.rowCount && r.rowCount > 0)
                added++;
        }
        await client.query('COMMIT');
        res.json({ success: true, data: { synced: added } });
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
}));
// ──────────────────────── Site-Scoped Bio Catalog ────────────────────────
exports.bioRecordRouter.get('/catalog/site/:siteId', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { siteId } = req.params;
    const orgId = getOrgId(req);
    const search = (req.query.search || '').trim();
    let where = `(bp.organization_id IS NULL OR bp.organization_id = $1) AND sbp.site_id = $2`;
    const params = [orgId, siteId];
    if (search) {
        params.push(`%${search}%`);
        where += ` AND (bp.item_code ILIKE $3 OR bp.item_name ILIKE $3)`;
    }
    const result = await client_1.dbPool.query(`SELECT bp.id, bp.item_code, bp.item_name, bp.per_package, bp.is_active,
              sbp.price_per_package AS site_price, sbp.is_active AS site_active, sbp.id AS site_product_id
       FROM site_bio_products sbp
       JOIN bio_products_catalog bp ON bp.id = sbp.product_id
       WHERE ${where}
       ORDER BY bp.item_code`, params);
    res.json({ success: true, data: result.rows });
}));
exports.bioRecordRouter.get('/catalog/browse', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const orgId = getOrgId(req);
    const result = await client_1.dbPool.query(`SELECT id, item_code, item_name, per_package, price_per_package, is_active
       FROM bio_products_catalog
       WHERE (organization_id IS NULL OR organization_id = $1) AND is_active = TRUE
       ORDER BY item_code`, [orgId]);
    res.json({ success: true, data: result.rows });
}));
exports.bioRecordRouter.post('/catalog/site/:siteId/assign', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { siteId } = req.params;
    const { productIds, pricePerPackage } = zod_1.z.object({
        productIds: zod_1.z.array(zod_1.z.string().uuid()),
        pricePerPackage: zod_1.z.number().optional().nullable(),
    }).parse(req.body);
    const client = await client_1.dbPool.connect();
    try {
        await client.query('BEGIN');
        let added = 0;
        for (const pid of productIds) {
            const r = await client.query(`INSERT INTO site_bio_products (site_id, product_id, price_per_package)
           VALUES ($1, $2, $3)
           ON CONFLICT (site_id, product_id) DO NOTHING
           RETURNING id`, [siteId, pid, pricePerPackage ?? null]);
            if (r.rowCount && r.rowCount > 0)
                added++;
        }
        await client.query('COMMIT');
        res.json({ success: true, data: { added } });
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
}));
exports.bioRecordRouter.put('/catalog/site/:siteId/:productId', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { siteId, productId } = req.params;
    const { pricePerPackage } = zod_1.z.object({
        pricePerPackage: zod_1.z.number().optional().nullable(),
    }).parse(req.body);
    const result = await client_1.dbPool.query(`UPDATE site_bio_products SET price_per_package = $1
       WHERE site_id = $2 AND product_id = $3 RETURNING *`, [pricePerPackage ?? null, siteId, productId]);
    res.json({ success: true, data: result.rows[0] || null });
}));
exports.bioRecordRouter.delete('/catalog/site/:siteId/:productId', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { siteId, productId } = req.params;
    await client_1.dbPool.query(`DELETE FROM site_bio_products WHERE site_id = $1 AND product_id = $2`, [siteId, productId]);
    res.json({ success: true });
}));
// ──────────────────────── Crop / Field listing ────────────────────────
exports.bioRecordRouter.get('/crops', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const orgId = getOrgId(req);
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const siteId = req.query.site_id;
    let siteFilter = '';
    const params = [orgId, year];
    if (siteId) {
        params.push(siteId);
        siteFilter = ` AND f.farm_area_id IN (SELECT id FROM farm_areas WHERE site_id = $${params.length})`;
    }
    const result = await client_1.dbPool.query(`SELECT DISTINCT c.id, c.name
       FROM bio_record_field_setup bs
       JOIN crops c ON c.id = bs.crop_id
       JOIN fields f ON f.id = bs.field_id
       WHERE (bs.organization_id IS NULL OR bs.organization_id = $1)
         AND bs.year = $2${siteFilter}
       ORDER BY c.name`, params);
    res.json({ success: true, data: result.rows });
}));
exports.bioRecordRouter.get('/fields/:cropId/:year', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const orgId = getOrgId(req);
    const { cropId, year } = req.params;
    const siteId = req.query.site_id;
    let siteFilter = '';
    const params = [orgId, cropId, parseInt(year)];
    if (siteId) {
        params.push(siteId);
        siteFilter = ` AND fa.site_id = $${params.length}`;
    }
    const result = await client_1.dbPool.query(`SELECT bs.*, f.name AS field_name, fa.name AS farm_area_name
       FROM bio_record_field_setup bs
       JOIN fields f ON f.id = bs.field_id
       LEFT JOIN farm_areas fa ON fa.id = f.farm_area_id
       WHERE (bs.organization_id IS NULL OR bs.organization_id = $1)
         AND bs.crop_id = $2 AND bs.year = $3${siteFilter}
       ORDER BY f.name`, params);
    res.json({ success: true, data: result.rows });
}));
// ──────────────────────── Field Setup + Full data ────────────────────────
exports.bioRecordRouter.get('/field-setup/:id', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const setup = await client_1.dbPool.query(`SELECT * FROM bio_record_field_setup WHERE id = $1`, [id]);
    if (setup.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Field setup not found' });
    }
    const products = await client_1.dbPool.query(`SELECT * FROM bio_record_field_products WHERE field_setup_id = $1 ORDER BY sort_order`, [id]);
    const entries = await client_1.dbPool.query(`SELECT * FROM bio_record_entries WHERE field_setup_id = $1`, [id]);
    res.json({
        success: true,
        data: {
            setup: setup.rows[0],
            products: products.rows,
            entries: entries.rows,
        },
    });
}));
const fieldSetupSchema = zod_1.z.object({
    fieldId: zod_1.z.string().uuid(),
    cropId: zod_1.z.string().uuid(),
    year: zod_1.z.number().int(),
    surfaceM2: zod_1.z.number().optional().nullable(),
    plantsPerM2: zod_1.z.number().optional().nullable(),
    numberOfPlants: zod_1.z.number().int().optional().nullable(),
    startWeek: zod_1.z.number().int().optional().nullable(),
    products: zod_1.z.array(zod_1.z.object({
        id: zod_1.z.string().uuid().optional(),
        productCatalogId: zod_1.z.string().uuid().optional().nullable(),
        itemCode: zod_1.z.string().optional().nullable(),
        productName: zod_1.z.string().min(1),
        perPackage: zod_1.z.number().int().optional().nullable(),
        pricePerPackage: zod_1.z.number().optional().nullable(),
    })).optional(),
});
exports.bioRecordRouter.post('/field-setup', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const data = fieldSetupSchema.parse(req.body);
    const client = await client_1.dbPool.connect();
    try {
        await client.query('BEGIN');
        const upsert = await client.query(`INSERT INTO bio_record_field_setup
           (organization_id, field_id, crop_id, year, surface_m2, plants_per_m2, number_of_plants, start_week, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (field_id, crop_id, year) DO UPDATE SET
           surface_m2 = EXCLUDED.surface_m2,
           plants_per_m2 = EXCLUDED.plants_per_m2,
           number_of_plants = EXCLUDED.number_of_plants,
           start_week = EXCLUDED.start_week,
           updated_at = NOW()
         RETURNING *`, [orgId, data.fieldId, data.cropId, data.year,
            data.surfaceM2 ?? null, data.plantsPerM2 ?? null,
            data.numberOfPlants ?? null, data.startWeek ?? 1, userId]);
        const setupId = upsert.rows[0].id;
        if (data.products) {
            await client.query(`DELETE FROM bio_record_field_products WHERE field_setup_id = $1`, [setupId]);
            for (let i = 0; i < data.products.length; i++) {
                const p = data.products[i];
                await client.query(`INSERT INTO bio_record_field_products
               (field_setup_id, product_catalog_id, item_code, product_name, per_package, price_per_package, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`, [setupId, p.productCatalogId || null, p.itemCode || null,
                    p.productName, p.perPackage || null, p.pricePerPackage || null, i]);
            }
        }
        else {
            const existingProducts = await client.query(`SELECT COUNT(*) FROM bio_record_field_products WHERE field_setup_id = $1`, [setupId]);
            if (parseInt(existingProducts.rows[0].count) === 0) {
                let copied = false;
                const prevSetup = await client.query(`SELECT id FROM bio_record_field_setup
             WHERE field_id = $1 AND year < $2
             ORDER BY year DESC LIMIT 1`, [data.fieldId, data.year]);
                if (prevSetup.rows.length > 0) {
                    const prevProducts = await client.query(`SELECT product_catalog_id, item_code, product_name, per_package, price_per_package, sort_order
               FROM bio_record_field_products WHERE field_setup_id = $1 ORDER BY sort_order`, [prevSetup.rows[0].id]);
                    if (prevProducts.rows.length > 0) {
                        for (const p of prevProducts.rows) {
                            await client.query(`INSERT INTO bio_record_field_products
                     (field_setup_id, product_catalog_id, item_code, product_name, per_package, price_per_package, sort_order)
                   VALUES ($1, $2, $3, $4, $5, $6, $7)`, [setupId, p.product_catalog_id, p.item_code,
                                p.product_name, p.per_package, p.price_per_package, p.sort_order]);
                        }
                        copied = true;
                    }
                }
                if (!copied) {
                    const catalog = await client.query(`SELECT id, item_code, item_name, per_package, price_per_package
               FROM bio_products_catalog
               WHERE (organization_id IS NULL OR organization_id = $1) AND (is_active IS NULL OR is_active = true)
               ORDER BY item_code`, [orgId]);
                    for (let i = 0; i < catalog.rows.length; i++) {
                        const c = catalog.rows[i];
                        await client.query(`INSERT INTO bio_record_field_products
                   (field_setup_id, product_catalog_id, item_code, product_name, per_package, price_per_package, sort_order)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`, [setupId, c.id, c.item_code, c.item_name, c.per_package ?? null, c.price_per_package ?? null, i]);
                    }
                }
            }
        }
        await client.query('COMMIT');
        const products = await client_1.dbPool.query(`SELECT * FROM bio_record_field_products WHERE field_setup_id = $1 ORDER BY sort_order`, [setupId]);
        res.json({ success: true, data: { setup: upsert.rows[0], products: products.rows } });
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
}));
// ──────────────────────── Delete field setup ────────────────────────
exports.bioRecordRouter.delete('/field-setup/:id', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const client = await client_1.dbPool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`DELETE FROM bio_record_entries WHERE field_setup_id = $1`, [id]);
        await client.query(`DELETE FROM bio_record_field_products WHERE field_setup_id = $1`, [id]);
        await client.query(`DELETE FROM bio_record_field_setup WHERE id = $1`, [id]);
        await client.query('COMMIT');
        res.json({ success: true });
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
}));
// ──────────────────────── Bulk entry upsert ────────────────────────
exports.bioRecordRouter.put('/entries/bulk', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const userId = getUserId(req);
    const { fieldSetupId, entries } = zod_1.z.object({
        fieldSetupId: zod_1.z.string().uuid(),
        entries: zod_1.z.array(zod_1.z.object({
            productColumnId: zod_1.z.string().uuid(),
            weekNumber: zod_1.z.number().int().min(1).max(53),
            perM2: zod_1.z.number().nullable().optional(),
            units: zod_1.z.number().nullable().optional(),
        })),
    }).parse(req.body);
    const client = await client_1.dbPool.connect();
    try {
        await client.query('BEGIN');
        let upserted = 0;
        for (const e of entries) {
            if ((e.perM2 == null || e.perM2 === 0) && (e.units == null || e.units === 0)) {
                await client.query(`DELETE FROM bio_record_entries
             WHERE field_setup_id = $1 AND product_column_id = $2 AND week_number = $3`, [fieldSetupId, e.productColumnId, e.weekNumber]);
            }
            else {
                await client.query(`INSERT INTO bio_record_entries
               (field_setup_id, product_column_id, week_number, per_m2, units, created_by)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (field_setup_id, product_column_id, week_number)
             DO UPDATE SET per_m2 = EXCLUDED.per_m2, units = EXCLUDED.units, updated_at = NOW()`, [fieldSetupId, e.productColumnId, e.weekNumber,
                    e.perM2 ?? null, e.units ?? null, userId]);
                upserted++;
            }
        }
        await client.query('COMMIT');
        res.json({ success: true, data: { upserted } });
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
}));
// ──────────────────────── Excel import (bulk) ────────────────────────
exports.bioRecordRouter.post('/import-excel', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const { year, sheets } = zod_1.z.object({
        year: zod_1.z.number().int(),
        sheets: zod_1.z.array(zod_1.z.object({
            fieldId: zod_1.z.string().uuid(),
            cropId: zod_1.z.string().uuid(),
            surfaceM2: zod_1.z.number().optional().nullable(),
            plantsPerM2: zod_1.z.number().optional().nullable(),
            numberOfPlants: zod_1.z.number().int().optional().nullable(),
            startWeek: zod_1.z.number().int().optional().nullable(),
            products: zod_1.z.array(zod_1.z.object({
                itemCode: zod_1.z.string().optional().nullable(),
                productName: zod_1.z.string(),
                perPackage: zod_1.z.number().int().optional().nullable(),
                pricePerPackage: zod_1.z.number().optional().nullable(),
            })),
            entries: zod_1.z.array(zod_1.z.object({
                weekNumber: zod_1.z.number().int(),
                productIndex: zod_1.z.number().int(),
                perM2: zod_1.z.number().nullable().optional(),
                units: zod_1.z.number().nullable().optional(),
            })),
        })),
    }).parse(req.body);
    const client = await client_1.dbPool.connect();
    try {
        await client.query('BEGIN');
        let totalEntries = 0;
        for (const sheet of sheets) {
            const setupRes = await client.query(`INSERT INTO bio_record_field_setup
             (organization_id, field_id, crop_id, year, surface_m2, plants_per_m2, number_of_plants, start_week, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (field_id, crop_id, year) DO UPDATE SET
             surface_m2 = EXCLUDED.surface_m2, plants_per_m2 = EXCLUDED.plants_per_m2,
             number_of_plants = EXCLUDED.number_of_plants, start_week = EXCLUDED.start_week, updated_at = NOW()
           RETURNING id`, [orgId, sheet.fieldId, sheet.cropId, year,
                sheet.surfaceM2 ?? null, sheet.plantsPerM2 ?? null,
                sheet.numberOfPlants ?? null, sheet.startWeek ?? 1, userId]);
            const setupId = setupRes.rows[0].id;
            await client.query(`DELETE FROM bio_record_field_products WHERE field_setup_id = $1`, [setupId]);
            const productIds = [];
            for (let i = 0; i < sheet.products.length; i++) {
                const p = sheet.products[i];
                const code = (p.itemCode || p.productName.substring(0, 20).replace(/\s+/g, '-').toUpperCase()).trim();
                const catUpsert = await client.query(`INSERT INTO bio_products_catalog (item_code, item_name, per_package, price_per_package, organization_id)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (organization_id, item_code) DO UPDATE SET
               item_name = EXCLUDED.item_name,
               per_package = COALESCE(EXCLUDED.per_package, bio_products_catalog.per_package),
               price_per_package = COALESCE(EXCLUDED.price_per_package, bio_products_catalog.price_per_package)
             RETURNING id`, [code, p.productName.trim(), p.perPackage ?? null, p.pricePerPackage ?? null, orgId]);
                const catalogId = catUpsert.rows[0].id;
                const ins = await client.query(`INSERT INTO bio_record_field_products
               (field_setup_id, product_catalog_id, item_code, product_name, per_package, price_per_package, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`, [setupId, catalogId, code, p.productName,
                    p.perPackage || null, p.pricePerPackage || null, i]);
                productIds.push(ins.rows[0].id);
            }
            await client.query(`DELETE FROM bio_record_entries WHERE field_setup_id = $1`, [setupId]);
            for (const e of sheet.entries) {
                if (e.productIndex >= productIds.length)
                    continue;
                if ((e.perM2 == null || e.perM2 === 0) && (e.units == null || e.units === 0))
                    continue;
                await client.query(`INSERT INTO bio_record_entries
               (field_setup_id, product_column_id, week_number, per_m2, units, created_by)
             VALUES ($1, $2, $3, $4, $5, $6)`, [setupId, productIds[e.productIndex], e.weekNumber,
                    e.perM2 ?? null, e.units ?? null, userId]);
                totalEntries++;
            }
        }
        await client.query('COMMIT');
        res.json({ success: true, data: { sheets: sheets.length, entries: totalEntries } });
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
}));
// ──────────────────────── Summary ────────────────────────
exports.bioRecordRouter.get('/summary/:cropId/:year', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const orgId = (0, tenant_1.requireOrgId)(req);
    const { cropId, year } = req.params;
    const siteId = req.query.site_id;
    if (siteId)
        await (0, tenantValidation_1.assertSiteInOrganization)(siteId, orgId);
    let siteFilter = '';
    const params = [orgId, cropId, parseInt(year)];
    if (siteId) {
        params.push(siteId);
        siteFilter = ` AND f.farm_area_id IN (SELECT id FROM farm_areas WHERE site_id = $${params.length})`;
    }
    const result = await client_1.dbPool.query(`SELECT bs.id AS setup_id, f.name AS field_name, bs.surface_m2, bs.number_of_plants,
              bs.plants_per_m2, bs.start_week,
              COALESCE(SUM(e.units * fp.price_per_package / NULLIF(fp.per_package, 0)), 0) AS total_cost,
              COALESCE(SUM(e.units), 0) AS total_units
       FROM bio_record_field_setup bs
       JOIN fields f ON f.id = bs.field_id AND f.organization_id = $1
       LEFT JOIN bio_record_field_products fp ON fp.field_setup_id = bs.id
       LEFT JOIN bio_record_entries e ON e.product_column_id = fp.id
       WHERE bs.organization_id = $1
         AND bs.crop_id = $2 AND bs.year = $3${siteFilter}
       GROUP BY bs.id, f.name, bs.surface_m2, bs.number_of_plants, bs.plants_per_m2, bs.start_week
       ORDER BY f.name`, params);
    const productTotals = await client_1.dbPool.query(`SELECT fp.product_name, fp.item_code,
              SUM(e.per_m2) AS total_per_m2, SUM(e.units) AS total_units,
              COALESCE(SUM(e.units * fp.price_per_package / NULLIF(fp.per_package, 0)), 0) AS total_cost
       FROM bio_record_field_setup bs
       JOIN fields f ON f.id = bs.field_id AND f.organization_id = $1
       JOIN bio_record_field_products fp ON fp.field_setup_id = bs.id
       LEFT JOIN bio_record_entries e ON e.product_column_id = fp.id
       WHERE bs.organization_id = $1
         AND bs.crop_id = $2 AND bs.year = $3${siteFilter}
       GROUP BY fp.product_name, fp.item_code
       ORDER BY fp.product_name`, params);
    res.json({
        success: true,
        data: { fields: result.rows, productTotals: productTotals.rows },
    });
}));
