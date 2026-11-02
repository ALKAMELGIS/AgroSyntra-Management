"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nurserySowingRecordRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const asyncHandler_1 = require("../../utils/asyncHandler");
const client_1 = require("../../db/client");
const tenant_1 = require("../middleware/tenant");
exports.nurserySowingRecordRouter = (0, express_1.Router)();
exports.nurserySowingRecordRouter.use(auth_1.auth);
exports.nurserySowingRecordRouter.use(auth_1.authorizeFieldStaff);
const mediaComponentSchema = zod_1.z.object({
    qty: zod_1.z.union([zod_1.z.number(), zod_1.z.string()]).optional().nullable(),
    uom: zod_1.z.string().optional().nullable(),
});
const recordSchema = zod_1.z.object({
    siteId: zod_1.z.string().uuid(),
    seedingDate: zod_1.z.string().min(1),
    cropId: zod_1.z.string().uuid().optional().nullable(),
    varietyId: zod_1.z.string().uuid().optional().nullable(),
    seedBatch: zod_1.z.string().optional().nullable(),
    breederId: zod_1.z.string().uuid().optional().nullable(),
    seedsPerCell: zod_1.z.union([zod_1.z.number(), zod_1.z.string()]).optional().nullable(),
    trayType: zod_1.z.string().optional().nullable(),
    trayCount: zod_1.z.union([zod_1.z.number(), zod_1.z.string()]).optional().nullable(),
    growingMediaBrand: zod_1.z.string().optional().nullable(),
    mediaComponents: zod_1.z.object({
        perlite: mediaComponentSchema.optional(),
        peatMoss: mediaComponentSchema.optional(),
        compost: mediaComponentSchema.optional(),
        vermiculite: mediaComponentSchema.optional(),
    }).optional().nullable(),
    seedlingCount: zod_1.z.union([zod_1.z.number(), zod_1.z.string()]).optional().nullable(),
    germinationPct: zod_1.z.union([zod_1.z.number(), zod_1.z.string()]).optional().nullable(),
    readyToTransplantDate: zod_1.z.string().optional().nullable(),
    releaseDate: zod_1.z.string().optional().nullable(),
    seedlingsPlanted: zod_1.z.union([zod_1.z.number(), zod_1.z.string()]).optional().nullable(),
});
const updateSchema = recordSchema.partial().omit({ siteId: true });
function toNum(v) {
    if (v === null || v === undefined || v === '')
        return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}
function mapRow(row) {
    return {
        id: row.id,
        organizationId: row.organization_id,
        siteId: row.site_id,
        seedingDate: row.seeding_date,
        cropId: row.crop_id,
        cropName: row.crop_name,
        varietyId: row.variety_id,
        varietyName: row.variety_name,
        seedBatch: row.seed_batch,
        breederId: row.breeder_id,
        breederName: row.breeder_name,
        seedsPerCell: row.seeds_per_cell,
        trayType: row.tray_type,
        trayCount: row.tray_count,
        growingMediaBrand: row.growing_media_brand,
        mediaComponents: row.media_components || {},
        seedlingCount: row.seedling_count,
        germinationPct: row.germination_pct,
        readyToTransplantDate: row.ready_to_transplant_date,
        releaseDate: row.release_date,
        seedlingsPlanted: row.seedlings_planted,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
const listSelect = `
  SELECT nsr.*,
         c.name AS crop_name, cv.name AS variety_name, b.name AS breeder_name
  FROM nursery_sowing_records nsr
  LEFT JOIN crops c ON c.id = nsr.crop_id
  LEFT JOIN crop_varieties cv ON cv.id = nsr.variety_id
  LEFT JOIN breeders b ON b.id = nsr.breeder_id
  WHERE nsr.organization_id = $1
`;
exports.nurserySowingRecordRouter.get('/', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const siteId = req.query.site_id;
    const orgId = (0, tenant_1.requireOrgId)(req);
    let query = listSelect;
    const params = [orgId];
    if (siteId) {
        query += ` AND nsr.site_id = $2`;
        params.push(siteId);
    }
    query += ` ORDER BY nsr.seeding_date DESC, nsr.created_at DESC`;
    const result = await client_1.dbPool.query(query, params);
    res.json({ success: true, data: result.rows.map(mapRow) });
}));
exports.nurserySowingRecordRouter.post('/', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const data = recordSchema.parse(req.body);
    const orgId = (0, tenant_1.requireOrgId)(req);
    const result = await client_1.dbPool.query(`INSERT INTO nursery_sowing_records (
       organization_id, site_id, seeding_date, crop_id, variety_id, seed_batch, breeder_id,
       seeds_per_cell, tray_type, tray_count, growing_media_brand, media_components,
       seedling_count, germination_pct, ready_to_transplant_date, release_date, seedlings_planted
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     RETURNING *`, [
        orgId, data.siteId, data.seedingDate, data.cropId || null, data.varietyId || null,
        data.seedBatch || null, data.breederId || null,
        toNum(data.seedsPerCell), data.trayType || null, toNum(data.trayCount),
        data.growingMediaBrand || null, JSON.stringify(data.mediaComponents || {}),
        toNum(data.seedlingCount), toNum(data.germinationPct),
        data.readyToTransplantDate || null, data.releaseDate || null, toNum(data.seedlingsPlanted),
    ]);
    const row = result.rows[0];
    const full = await client_1.dbPool.query(`SELECT nsr.*, c.name AS crop_name, cv.name AS variety_name, b.name AS breeder_name
     FROM nursery_sowing_records nsr
     LEFT JOIN crops c ON c.id = nsr.crop_id
     LEFT JOIN crop_varieties cv ON cv.id = nsr.variety_id
     LEFT JOIN breeders b ON b.id = nsr.breeder_id
     WHERE nsr.id = $1 AND nsr.organization_id = $2`, [row.id, orgId]);
    res.status(201).json({ success: true, data: mapRow(full.rows[0]) });
}));
exports.nurserySowingRecordRouter.put('/:id', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const data = updateSchema.parse(req.body);
    const orgId = (0, tenant_1.requireOrgId)(req);
    const id = req.params.id;
    const sets = [];
    const params = [];
    let idx = 1;
    const add = (col, val) => {
        sets.push(`${col} = $${idx}`);
        params.push(val);
        idx += 1;
    };
    if (data.seedingDate !== undefined)
        add('seeding_date', data.seedingDate);
    if (data.cropId !== undefined)
        add('crop_id', data.cropId || null);
    if (data.varietyId !== undefined)
        add('variety_id', data.varietyId || null);
    if (data.seedBatch !== undefined)
        add('seed_batch', data.seedBatch || null);
    if (data.breederId !== undefined)
        add('breeder_id', data.breederId || null);
    if (data.seedsPerCell !== undefined)
        add('seeds_per_cell', toNum(data.seedsPerCell));
    if (data.trayType !== undefined)
        add('tray_type', data.trayType || null);
    if (data.trayCount !== undefined)
        add('tray_count', toNum(data.trayCount));
    if (data.growingMediaBrand !== undefined)
        add('growing_media_brand', data.growingMediaBrand || null);
    if (data.mediaComponents !== undefined)
        add('media_components', JSON.stringify(data.mediaComponents || {}));
    if (data.seedlingCount !== undefined)
        add('seedling_count', toNum(data.seedlingCount));
    if (data.germinationPct !== undefined)
        add('germination_pct', toNum(data.germinationPct));
    if (data.readyToTransplantDate !== undefined)
        add('ready_to_transplant_date', data.readyToTransplantDate || null);
    if (data.releaseDate !== undefined)
        add('release_date', data.releaseDate || null);
    if (data.seedlingsPlanted !== undefined)
        add('seedlings_planted', toNum(data.seedlingsPlanted));
    if (sets.length === 0) {
        return res.status(400).json({ success: false, error: { message: 'Nothing to update' } });
    }
    sets.push('updated_at = NOW()');
    params.push(id, orgId);
    const result = await client_1.dbPool.query(`UPDATE nursery_sowing_records SET ${sets.join(', ')}
     WHERE id = $${idx}::uuid AND organization_id = $${idx + 1}::uuid
     RETURNING id`, params);
    if (!result.rowCount) {
        return res.status(404).json({ success: false, error: { message: 'Not found' } });
    }
    const full = await client_1.dbPool.query(`SELECT nsr.*, c.name AS crop_name, cv.name AS variety_name, b.name AS breeder_name
     FROM nursery_sowing_records nsr
     LEFT JOIN crops c ON c.id = nsr.crop_id
     LEFT JOIN crop_varieties cv ON cv.id = nsr.variety_id
     LEFT JOIN breeders b ON b.id = nsr.breeder_id
     WHERE nsr.id = $1 AND nsr.organization_id = $2`, [id, orgId]);
    res.json({ success: true, data: mapRow(full.rows[0]) });
}));
exports.nurserySowingRecordRouter.post('/bulk', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const schema = zod_1.z.object({ entries: zod_1.z.array(recordSchema).min(1) });
    const { entries } = schema.parse(req.body);
    const orgId = (0, tenant_1.requireOrgId)(req);
    let created = 0;
    const client = await client_1.dbPool.connect();
    try {
        await client.query('BEGIN');
        for (const e of entries) {
            await client.query(`INSERT INTO nursery_sowing_records (
           organization_id, site_id, seeding_date, crop_id, variety_id, seed_batch, breeder_id,
           seeds_per_cell, tray_type, tray_count, growing_media_brand, media_components,
           seedling_count, germination_pct, ready_to_transplant_date, release_date, seedlings_planted
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`, [
                orgId, e.siteId, e.seedingDate, e.cropId || null, e.varietyId || null,
                e.seedBatch || null, e.breederId || null,
                toNum(e.seedsPerCell), e.trayType || null, toNum(e.trayCount),
                e.growingMediaBrand || null, JSON.stringify(e.mediaComponents || {}),
                toNum(e.seedlingCount), toNum(e.germinationPct),
                e.readyToTransplantDate || null, e.releaseDate || null, toNum(e.seedlingsPlanted),
            ]);
            created += 1;
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
    res.json({ success: true, data: { created, total: entries.length } });
}));
exports.nurserySowingRecordRouter.delete('/:id', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const orgId = (0, tenant_1.requireOrgId)(req);
    const result = await client_1.dbPool.query(`DELETE FROM nursery_sowing_records WHERE id = $1::uuid AND organization_id = $2::uuid`, [req.params.id, orgId]);
    if (!result.rowCount) {
        return res.status(404).json({ success: false, error: { message: 'Not found' } });
    }
    res.json({ success: true, data: { deleted: true } });
}));
