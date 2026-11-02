"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.germinationRecordRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const asyncHandler_1 = require("../../utils/asyncHandler");
const client_1 = require("../../db/client");
const tenant_1 = require("../middleware/tenant");
exports.germinationRecordRouter = (0, express_1.Router)();
exports.germinationRecordRouter.use(auth_1.auth);
exports.germinationRecordRouter.use((0, auth_1.authorize)('ceo', 'farm_manager', 'operation_manager', 'agronomist'));
// ─── SECTIONS ────────────────────────────────────────────────────────────────
exports.germinationRecordRouter.get('/sections', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const siteId = req.query.site_id;
    const orgId = (0, tenant_1.requireOrgId)(req);
    let query = `
    SELECT gs.*
    FROM germination_sections gs
    LEFT JOIN sites s ON s.id = gs.site_id
    WHERE COALESCE(gs.organization_id, s.organization_id) = $1
  `;
    const params = [orgId];
    if (siteId) {
        params.push(siteId);
        query += ` AND gs.site_id = $${params.length}`;
    }
    query += ` ORDER BY gs.sort_order ASC, gs.created_at ASC`;
    const result = await client_1.dbPool.query(query, params);
    res.json({ success: true, data: result.rows });
}));
exports.germinationRecordRouter.post('/sections', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const schema = zod_1.z.object({
        name: zod_1.z.string().min(1).max(100),
        siteId: zod_1.z.string().optional().nullable(),
    });
    const { name, siteId } = schema.parse(req.body);
    const orgId = req.user?.organizationId || null;
    const maxSort = await client_1.dbPool.query(`SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM germination_sections WHERE site_id = $1`, [siteId || null]);
    const result = await client_1.dbPool.query(`INSERT INTO germination_sections (organization_id, site_id, name, sort_order)
     VALUES ($1, $2, $3, $4) RETURNING *`, [orgId, siteId || null, name, maxSort.rows[0].next]);
    res.status(201).json({ success: true, data: result.rows[0] });
}));
exports.germinationRecordRouter.put('/sections/:id', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const schema = zod_1.z.object({ name: zod_1.z.string().min(1).max(100) });
    const { name } = schema.parse(req.body);
    const result = await client_1.dbPool.query(`UPDATE germination_sections SET name = $1 WHERE id = $2 RETURNING *`, [name, req.params.id]);
    if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: { message: 'Section not found' } });
    }
    res.json({ success: true, data: result.rows[0] });
}));
exports.germinationRecordRouter.delete('/sections/:id', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    await client_1.dbPool.query(`DELETE FROM germination_sections WHERE id = $1`, [req.params.id]);
    res.json({ success: true, data: { deleted: true } });
}));
// ─── RECORDS ─────────────────────────────────────────────────────────────────
const countSchema = zod_1.z.object({
    counting_number: zod_1.z.number().int().min(1),
    date: zod_1.z.string().optional().nullable(),
    seeds_total: zod_1.z.number().int().min(0).optional().nullable(),
    seeds_no_germ: zod_1.z.number().int().min(0).optional().nullable(),
});
const recordSchema = zod_1.z.object({
    sectionId: zod_1.z.string().uuid(),
    varietyId: zod_1.z.string().uuid().optional().nullable(),
    varietyName: zod_1.z.string().optional().nullable(),
    counts: zod_1.z.array(countSchema).default([]),
});
exports.germinationRecordRouter.get('/records', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const sectionId = req.query.section_id;
    if (!sectionId) {
        return res.status(400).json({ success: false, error: { message: 'section_id is required' } });
    }
    const result = await client_1.dbPool.query(`SELECT gr.*, cv.name AS resolved_variety_name
     FROM germination_records gr
     LEFT JOIN crop_varieties cv ON cv.id = gr.variety_id
     WHERE gr.section_id = $1
     ORDER BY gr.sort_order ASC, gr.created_at ASC`, [sectionId]);
    res.json({ success: true, data: result.rows });
}));
exports.germinationRecordRouter.post('/records', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const data = recordSchema.parse(req.body);
    const maxSort = await client_1.dbPool.query(`SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM germination_records WHERE section_id = $1`, [data.sectionId]);
    const result = await client_1.dbPool.query(`INSERT INTO germination_records (section_id, variety_id, variety_name, counts, sort_order)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`, [data.sectionId, data.varietyId || null, data.varietyName || null, JSON.stringify(data.counts), maxSort.rows[0].next]);
    res.status(201).json({ success: true, data: result.rows[0] });
}));
exports.germinationRecordRouter.put('/records/:id', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const schema = zod_1.z.object({
        varietyId: zod_1.z.string().uuid().optional().nullable(),
        varietyName: zod_1.z.string().optional().nullable(),
        counts: zod_1.z.array(countSchema).optional(),
    });
    const data = schema.parse(req.body);
    const sets = [];
    const params = [];
    let idx = 1;
    if (data.varietyId !== undefined) {
        sets.push(`variety_id = $${idx}::uuid`);
        params.push(data.varietyId || null);
        idx++;
    }
    if (data.varietyName !== undefined) {
        sets.push(`variety_name = $${idx}`);
        params.push(data.varietyName || null);
        idx++;
    }
    if (data.counts !== undefined) {
        sets.push(`counts = $${idx}::jsonb`);
        params.push(JSON.stringify(data.counts));
        idx++;
    }
    if (sets.length === 0) {
        return res.status(400).json({ success: false, error: { message: 'Nothing to update' } });
    }
    sets.push('updated_at = NOW()');
    params.push(req.params.id);
    const result = await client_1.dbPool.query(`UPDATE germination_records SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, params);
    if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: { message: 'Record not found' } });
    }
    res.json({ success: true, data: result.rows[0] });
}));
exports.germinationRecordRouter.delete('/records/:id', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    await client_1.dbPool.query(`DELETE FROM germination_records WHERE id = $1`, [req.params.id]);
    res.json({ success: true, data: { deleted: true } });
}));
// ─── BULK IMPORT ─────────────────────────────────────────────────────────────
exports.germinationRecordRouter.post('/bulk', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const schema = zod_1.z.object({
        siteId: zod_1.z.string().optional().nullable(),
        sections: zod_1.z.array(zod_1.z.object({
            name: zod_1.z.string().min(1),
            records: zod_1.z.array(zod_1.z.object({
                varietyName: zod_1.z.string().optional().nullable(),
                counts: zod_1.z.array(countSchema).default([]),
            })),
        })),
    });
    const { siteId, sections } = schema.parse(req.body);
    const orgId = req.user?.organizationId || null;
    const client = await client_1.dbPool.connect();
    let totalRecords = 0;
    try {
        await client.query('BEGIN');
        for (let si = 0; si < sections.length; si++) {
            const sec = sections[si];
            const secResult = await client.query(`INSERT INTO germination_sections (organization_id, site_id, name, sort_order)
         VALUES ($1, $2, $3, $4) RETURNING id`, [orgId, siteId || null, sec.name, si]);
            const sectionId = secResult.rows[0].id;
            for (let ri = 0; ri < sec.records.length; ri++) {
                const rec = sec.records[ri];
                await client.query(`INSERT INTO germination_records (section_id, variety_name, counts, sort_order)
           VALUES ($1, $2, $3, $4)`, [sectionId, rec.varietyName || null, JSON.stringify(rec.counts), ri]);
                totalRecords++;
            }
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
    res.json({ success: true, data: { sectionsCreated: sections.length, recordsCreated: totalRecords } });
}));
