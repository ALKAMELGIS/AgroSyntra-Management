import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { auth, authorizeFieldStaffRead, AuthRequest } from '../middleware/auth';
import { requireOrgId } from '../middleware/tenant';
import { asyncHandler } from '../../utils/asyncHandler';
import { assertFieldInOrganization, assertSiteInOrganization } from '../../utils/tenantValidation';
import { AppError, NotFoundError } from '../../utils/errors';
import { dbPool } from '../../db/client';
import {
  canImportBio,
  canManageBio,
  canProposeBioCells,
  isIpmAdminEmail,
} from '../../utils/ipmAccess';
import * as bioService from '../../services/bioRecord.service';
import { logAuditEvent } from '../../services/auditLog.service';
import { notifyUser, notifyUsersByRoles } from '../../services/userNotify.service';
import { UserRole } from '../../models/user.model';

const BIO_PAGE_PATH = '/ipm/biological-control-record';

async function loadSeasonForSite(
  seasonId: string,
  siteId: string | undefined,
  orgId: string | null,
) {
  const result = await dbPool.query(
    `SELECT s.id, s.site_id, s.start_date, s.end_date, s.planned_end_date,
            EXTRACT(YEAR FROM s.start_date)::int AS start_year
     FROM seasons s
     WHERE s.id = $1
       AND ($2::uuid IS NULL OR s.organization_id IS NULL OR s.organization_id = $2)
       AND ($3::uuid IS NULL OR s.site_id = $3)`,
    [seasonId, orgId, siteId || null],
  );
  if (!result.rows[0]) {
    throw new AppError('Season not found for this site', 'VALIDATION_ERROR', 400);
  }
  return result.rows[0];
}

const { loadSeasonForField } = bioService;

export const bioRecordRouter = Router();
bioRecordRouter.use(auth);
// Reads stay open to field staff and operators. Every write below carries its own
// role check: the router-level guard alone would let any field-staff role write.
bioRecordRouter.use(authorizeFieldStaffRead);

const getOrgId = (req: AuthRequest) => (req as any).user?.organizationId || null;
const getUserId = (req: AuthRequest) => req.user!.userId;

type BioActor = { email: string; role: UserRole };

function requireBio(check: (actor: BioActor) => boolean, message: string) {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user || !check(req.user)) {
      next(new AppError(message, 'FORBIDDEN', 403));
      return;
    }
    next();
  };
}

/** Setup, catalog, UOM, deletes, approvals: pest agronomist or IPM admin. */
const requireBioManager = requireBio(
  canManageBio,
  'Only the pest agronomist can change biological control setup, catalog or approvals',
);
/** Weekly cells: the bio manager (live) or a scouter (pending). */
const requireBioCellWriter = requireBio(
  (actor) => canManageBio(actor) || canProposeBioCells(actor),
  'Only the pest agronomist or a scouter can enter biological control values',
);
/** Excel import: the bio manager (live) or a data-entry worker (pending). */
const requireBioImporter = requireBio(
  canImportBio,
  'Only the pest agronomist or a data-entry worker can import biological control records',
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function writeModeFor(req: AuthRequest): bioService.BioWriteMode {
  return canManageBio(req.user!) ? 'manager' : 'proposer';
}

function notifyBioManagers(orgId: string, count: number, setupId: string, where: string) {
  if (count <= 0) return;
  notifyUsersByRoles(['pest_agronomist'], {
    title: 'Biological control approval needed',
    message: `${count} biological-control value${count === 1 ? '' : 's'} waiting for approval${where ? ` (${where})` : ''}.`,
    severity: 'info',
    entityType: 'bio_record',
    entityId: setupId,
    path: BIO_PAGE_PATH,
    organizationId: orgId,
  }).catch(() => {});
}

/**
 * A catalog product the caller may change: their organization's own rows, or a
 * shared (organization-less) row only for the IPM admin.
 */
async function loadCatalogProductForWrite(req: AuthRequest, id: string) {
  const orgId = requireOrgId(req);
  if (!UUID_RE.test(String(id || ''))) throw new NotFoundError('Catalog product not found');
  const result = await dbPool.query(
    `SELECT id, organization_id FROM bio_products_catalog WHERE id = $1`,
    [id],
  );
  const row = result.rows[0];
  if (!row || (row.organization_id && row.organization_id !== orgId)) {
    throw new NotFoundError('Catalog product not found');
  }
  if (!row.organization_id && !isIpmAdminEmail(req.user!.email)) {
    throw new AppError('Only the IPM admin can change shared catalog products', 'FORBIDDEN', 403);
  }
  return row;
}

async function assertSiteForWrite(req: AuthRequest, siteId: string) {
  const orgId = requireOrgId(req);
  if (!UUID_RE.test(String(siteId || ''))) throw new NotFoundError('Site not found');
  await assertSiteInOrganization(siteId, orgId);
  return orgId;
}

async function listFieldSetups(
  orgId: string | null,
  cropId: string,
  seasonId: string,
  siteId?: string,
) {
  const params: any[] = [orgId, cropId, seasonId];
  let siteFilter = '';
  if (siteId) {
    params.push(siteId);
    siteFilter = ` AND fa.site_id = $${params.length}`;
  }
  return dbPool.query(
    `SELECT bs.*, f.name AS field_name, fa.name AS farm_area_name,
            (SELECT COUNT(*)::int FROM bio_record_entries pe
              WHERE pe.field_setup_id = bs.id AND pe.pending_at IS NOT NULL) AS pending_count
     FROM bio_record_field_setup bs
     JOIN fields f ON f.id = bs.field_id
     LEFT JOIN farm_areas fa ON fa.id = f.farm_area_id
     WHERE (bs.organization_id IS NULL OR bs.organization_id = $1)
       AND bs.crop_id = $2 AND bs.season_id = $3${siteFilter}
     ORDER BY f.name`,
    params,
  );
}

function loadFieldProducts(setupId: string) {
  return dbPool.query(
    `${fieldProductsSelect} WHERE fp.field_setup_id = $1 ORDER BY fp.sort_order`,
    [setupId],
  );
}

const fieldProductsSelect = `
SELECT fp.id, fp.field_setup_id, fp.product_catalog_id, fp.item_code, fp.product_name, fp.sort_order,
       COALESCE(fp.per_package, bp.per_package) AS per_package,
       COALESCE(fp.uom_id, bp.uom_id) AS uom_id,
       COALESCE(ou.name, cu.name) AS uom_name,
       CASE
         WHEN fp.price_per_package IS NOT NULL AND fp.price_per_package <> 0 THEN fp.price_per_package
         ELSE site_price.price
       END AS price_per_package
FROM bio_record_field_products fp
JOIN bio_record_field_setup bs ON bs.id = fp.field_setup_id
JOIN fields f ON f.id = bs.field_id
LEFT JOIN farm_areas fa ON fa.id = f.farm_area_id
LEFT JOIN bio_products_catalog bp ON bp.id = fp.product_catalog_id
LEFT JOIN bio_uom ou ON ou.id = fp.uom_id
LEFT JOIN bio_uom cu ON cu.id = bp.uom_id
LEFT JOIN LATERAL (
  SELECT sbp.price_per_package AS price
  FROM site_bio_products sbp
  JOIN bio_products_catalog c ON c.id = sbp.product_id
  WHERE fa.site_id IS NOT NULL
    AND sbp.site_id = fa.site_id
    AND sbp.price_per_package IS NOT NULL
    AND sbp.price_per_package <> 0
    AND (
      (fp.product_catalog_id IS NOT NULL AND sbp.product_id = fp.product_catalog_id)
      OR (fp.item_code IS NOT NULL AND lower(trim(c.item_code)) = lower(trim(fp.item_code)))
    )
  ORDER BY CASE WHEN fp.product_catalog_id IS NOT NULL AND sbp.product_id = fp.product_catalog_id THEN 0 ELSE 1 END
  LIMIT 1
) site_price ON TRUE
`;

const resolvedPackPriceSql = `
  CASE
    WHEN fp.price_per_package IS NOT NULL AND fp.price_per_package <> 0 THEN fp.price_per_package
    ELSE (
      SELECT sbp.price_per_package
      FROM site_bio_products sbp
      JOIN bio_products_catalog c ON c.id = sbp.product_id
      JOIN fields rf ON rf.id = bs.field_id
      JOIN farm_areas rfa ON rfa.id = rf.farm_area_id AND rfa.site_id = sbp.site_id
      WHERE sbp.price_per_package IS NOT NULL AND sbp.price_per_package <> 0
        AND (
          (fp.product_catalog_id IS NOT NULL AND sbp.product_id = fp.product_catalog_id)
          OR (fp.item_code IS NOT NULL AND lower(trim(c.item_code)) = lower(trim(fp.item_code)))
        )
      ORDER BY CASE WHEN fp.product_catalog_id IS NOT NULL AND sbp.product_id = fp.product_catalog_id THEN 0 ELSE 1 END
      LIMIT 1
    )
  END
`;

// ──────────────────────── UOM ────────────────────────

bioRecordRouter.get(
  '/uom',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const orgId = getOrgId(req);
    const result = await dbPool.query(
      `SELECT id, name, organization_id
       FROM bio_uom
       WHERE organization_id IS NULL OR organization_id = $1
       ORDER BY lower(name)`,
      [orgId],
    );
    res.json({ success: true, data: result.rows });
  }),
);

bioRecordRouter.post(
  '/uom',
  requireBioManager,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const orgId = requireOrgId(req);
    const name = String(z.object({ name: z.string() }).parse(req.body).name || '').trim();
    if (!name) {
      throw new AppError('UOM name is required', 'VALIDATION_ERROR', 400);
    }
    const existing = await dbPool.query(
      `SELECT id, name, organization_id
       FROM bio_uom
       WHERE lower(name) = lower($1)
         AND (organization_id IS NULL OR organization_id = $2)
       ORDER BY organization_id NULLS FIRST
       LIMIT 1`,
      [name, orgId],
    );
    if (existing.rows[0]) {
      return res.json({ success: true, data: existing.rows[0] });
    }
    const inserted = await dbPool.query(
      `INSERT INTO bio_uom (organization_id, name) VALUES ($1, $2) RETURNING id, name, organization_id`,
      [orgId, name],
    );
    res.status(201).json({ success: true, data: inserted.rows[0] });
  }),
);

// ──────────────────────── Product Catalog ────────────────────────

bioRecordRouter.post(
  '/catalog/import',
  requireBioManager,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const orgId = requireOrgId(req);
    const { products } = z.object({
      products: z.array(z.object({
        itemCode: z.string().min(1),
        itemName: z.string().min(1),
      })),
    }).parse(req.body);

    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');
      let inserted = 0;
      for (const p of products) {
        const r = await client.query(
          `INSERT INTO bio_products_catalog (item_code, item_name, organization_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (organization_id, item_code) DO UPDATE SET item_name = EXCLUDED.item_name
           RETURNING id`,
          [p.itemCode.trim(), p.itemName.trim(), orgId],
        );
        if (r.rowCount && r.rowCount > 0) inserted++;
      }
      await client.query('COMMIT');
      res.json({ success: true, data: { imported: inserted } });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }),
);

bioRecordRouter.get(
  '/catalog',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const orgId = getOrgId(req);
    const search = (req.query.search as string || '').trim();
    const siteId = (req.query.site_id as string || '').trim() || null;
    const all = req.query.all === 'true';
    const limit = all ? 5000 : Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = all ? 0 : (parseInt(req.query.offset as string) || 0);

    const catalogSelect = `SELECT bp.*, u.name AS uom_name,
              CASE
                WHEN sbp.price_per_package IS NOT NULL AND sbp.price_per_package <> 0 THEN sbp.price_per_package
                ELSE NULL
              END AS site_price
       FROM bio_products_catalog bp
       LEFT JOIN bio_uom u ON u.id = bp.uom_id
       LEFT JOIN site_bio_products sbp ON sbp.product_id = bp.id AND $SITE::uuid IS NOT NULL AND sbp.site_id = $SITE`;

    let query: string;
    let params: any[];
    if (search) {
      query = `${catalogSelect.replace(/\$SITE/g, '$5')}
               WHERE (bp.organization_id IS NULL OR bp.organization_id = $1)
                 AND (bp.item_code ILIKE $2 OR bp.item_name ILIKE $2)
               ORDER BY bp.item_code
               LIMIT $3 OFFSET $4`;
      params = [orgId, `%${search}%`, limit, offset, siteId];
    } else {
      query = `${catalogSelect.replace(/\$SITE/g, '$4')}
               WHERE bp.organization_id IS NULL OR bp.organization_id = $1
               ORDER BY bp.item_code
               LIMIT $2 OFFSET $3`;
      params = [orgId, limit, offset, siteId];
    }
    const result = await dbPool.query(query, params);
    res.json({ success: true, data: result.rows });
  }),
);

bioRecordRouter.post(
  '/catalog/single',
  requireBioManager,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const orgId = requireOrgId(req);
    const data = z.object({
      itemCode: z.string().min(1),
      itemName: z.string().min(1),
      perPackage: z.number().int().optional().nullable(),
      pricePerPackage: z.number().optional().nullable(),
      uomId: z.string().uuid().optional().nullable(),
    }).parse(req.body);

    const result = await dbPool.query(
      `INSERT INTO bio_products_catalog (item_code, item_name, per_package, price_per_package, uom_id, organization_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (organization_id, item_code) DO UPDATE SET
         item_name = EXCLUDED.item_name, per_package = EXCLUDED.per_package,
         price_per_package = EXCLUDED.price_per_package, uom_id = COALESCE(EXCLUDED.uom_id, bio_products_catalog.uom_id)
       RETURNING *`,
      [data.itemCode.trim(), data.itemName.trim(), data.perPackage ?? null, data.pricePerPackage ?? null, data.uomId ?? null, orgId],
    );
    res.json({ success: true, data: result.rows[0] });
  }),
);

bioRecordRouter.put(
  '/catalog/:id',
  requireBioManager,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    await loadCatalogProductForWrite(req, id);
    const data = z.object({
      itemCode: z.string().min(1).optional(),
      itemName: z.string().min(1).optional(),
      perPackage: z.number().int().optional().nullable(),
      pricePerPackage: z.number().optional().nullable(),
      uomId: z.string().uuid().optional().nullable(),
    }).parse(req.body);

    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (data.itemCode !== undefined) { sets.push(`item_code = $${idx++}`); params.push(data.itemCode.trim()); }
    if (data.itemName !== undefined) { sets.push(`item_name = $${idx++}`); params.push(data.itemName.trim()); }
    if (data.perPackage !== undefined) { sets.push(`per_package = $${idx++}`); params.push(data.perPackage); }
    if (data.pricePerPackage !== undefined) { sets.push(`price_per_package = $${idx++}`); params.push(data.pricePerPackage); }
    if (data.uomId !== undefined) { sets.push(`uom_id = $${idx++}`); params.push(data.uomId); }

    if (sets.length === 0) {
      return res.json({ success: true, data: null });
    }

    params.push(id);
    const result = await dbPool.query(
      `UPDATE bio_products_catalog SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params,
    );
    res.json({ success: true, data: result.rows[0] || null });
  }),
);

bioRecordRouter.delete(
  '/catalog/:id',
  requireBioManager,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    await loadCatalogProductForWrite(req, id);
    await dbPool.query(`DELETE FROM bio_products_catalog WHERE id = $1`, [id]);
    res.json({ success: true });
  }),
);

bioRecordRouter.post(
  '/catalog/sync-from-fields',
  requireBioManager,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const orgId = requireOrgId(req);
    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');
      const uniqueProducts = await client.query(
        `SELECT DISTINCT ON (LOWER(TRIM(fp.product_name)))
           fp.item_code, fp.product_name, fp.per_package, fp.price_per_package
         FROM bio_record_field_products fp
         JOIN bio_record_field_setup bs ON bs.id = fp.field_setup_id
         WHERE bs.organization_id IS NULL OR bs.organization_id = $1
         ORDER BY LOWER(TRIM(fp.product_name)), fp.item_code NULLS LAST`,
        [orgId],
      );
      let added = 0;
      for (const p of uniqueProducts.rows) {
        const code = (p.item_code || p.product_name.substring(0, 20).replace(/\s+/g, '-').toUpperCase()).trim();
        const r = await client.query(
          `INSERT INTO bio_products_catalog (item_code, item_name, per_package, price_per_package, organization_id)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (organization_id, item_code) DO UPDATE SET
             item_name = EXCLUDED.item_name,
             per_package = COALESCE(EXCLUDED.per_package, bio_products_catalog.per_package),
             price_per_package = COALESCE(EXCLUDED.price_per_package, bio_products_catalog.price_per_package)
           RETURNING id`,
          [code, p.product_name.trim(), p.per_package ?? null, p.price_per_package ?? null, orgId],
        );
        if (r.rowCount && r.rowCount > 0) added++;
      }
      await client.query('COMMIT');
      res.json({ success: true, data: { synced: added } });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }),
);

// ──────────────────────── Site-Scoped Bio Catalog ────────────────────────

bioRecordRouter.get(
  '/catalog/site/:siteId',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { siteId } = req.params;
    const orgId = getOrgId(req);
    if (orgId) {
      if (!UUID_RE.test(String(siteId || ''))) throw new NotFoundError('Site not found');
      await assertSiteInOrganization(siteId, orgId);
    }
    const search = (req.query.search as string || '').trim();

    let where = `(bp.organization_id IS NULL OR bp.organization_id = $1) AND sbp.site_id = $2`;
    const params: any[] = [orgId, siteId];
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (bp.item_code ILIKE $3 OR bp.item_name ILIKE $3)`;
    }

    const result = await dbPool.query(
      `SELECT bp.id, bp.item_code, bp.item_name, bp.per_package, bp.uom_id, u.name AS uom_name, bp.is_active,
              sbp.price_per_package AS site_price, sbp.is_active AS site_active, sbp.id AS site_product_id
       FROM site_bio_products sbp
       JOIN bio_products_catalog bp ON bp.id = sbp.product_id
       LEFT JOIN bio_uom u ON u.id = bp.uom_id
       WHERE ${where}
       ORDER BY bp.item_code`,
      params,
    );
    res.json({ success: true, data: result.rows });
  }),
);

bioRecordRouter.get(
  '/catalog/browse',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const orgId = getOrgId(req);
    const result = await dbPool.query(
      `SELECT bp.id, bp.item_code, bp.item_name, bp.per_package, bp.price_per_package, bp.uom_id, u.name AS uom_name, bp.is_active
       FROM bio_products_catalog bp
       LEFT JOIN bio_uom u ON u.id = bp.uom_id
       WHERE (bp.organization_id IS NULL OR bp.organization_id = $1) AND bp.is_active = TRUE
       ORDER BY bp.item_code`,
      [orgId],
    );
    res.json({ success: true, data: result.rows });
  }),
);

bioRecordRouter.post(
  '/catalog/site/:siteId/assign',
  requireBioManager,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { siteId } = req.params;
    const orgId = await assertSiteForWrite(req, siteId);
    const { productIds, pricePerPackage } = z.object({
      productIds: z.array(z.string().uuid()),
      pricePerPackage: z.number().optional().nullable(),
    }).parse(req.body);
    const uniqueIds = [...new Set(productIds)];
    if (uniqueIds.length) {
      const visible = await dbPool.query(
        `SELECT id FROM bio_products_catalog
         WHERE id = ANY($1::uuid[]) AND (organization_id IS NULL OR organization_id = $2)`,
        [uniqueIds, orgId],
      );
      if (visible.rows.length !== uniqueIds.length) {
        throw new NotFoundError('Catalog product not found');
      }
    }

    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');
      let added = 0;
      for (const pid of productIds) {
        const r = await client.query(
          `INSERT INTO site_bio_products (site_id, product_id, price_per_package)
           VALUES ($1, $2, $3)
           ON CONFLICT (site_id, product_id) DO NOTHING
           RETURNING id`,
          [siteId, pid, pricePerPackage ?? null],
        );
        if (r.rowCount && r.rowCount > 0) added++;
      }
      await client.query('COMMIT');
      res.json({ success: true, data: { added } });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }),
);

bioRecordRouter.put(
  '/catalog/site/:siteId/:productId',
  requireBioManager,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { siteId, productId } = req.params;
    await assertSiteForWrite(req, siteId);
    const { pricePerPackage } = z.object({
      pricePerPackage: z.number().optional().nullable(),
    }).parse(req.body);

    const result = await dbPool.query(
      `UPDATE site_bio_products SET price_per_package = $1
       WHERE site_id = $2 AND product_id = $3 RETURNING *`,
      [pricePerPackage ?? null, siteId, productId],
    );
    res.json({ success: true, data: result.rows[0] || null });
  }),
);

bioRecordRouter.delete(
  '/catalog/site/:siteId/:productId',
  requireBioManager,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { siteId, productId } = req.params;
    await assertSiteForWrite(req, siteId);
    await dbPool.query(
      `DELETE FROM site_bio_products WHERE site_id = $1 AND product_id = $2`,
      [siteId, productId],
    );
    res.json({ success: true });
  }),
);

// ──────────────────────── Crop / Field listing ────────────────────────

bioRecordRouter.get(
  '/crops',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const orgId = getOrgId(req);
    const seasonId = req.query.season_id as string | undefined;
    const siteId = req.query.site_id as string | undefined;
    if (!seasonId) {
      throw new AppError('season_id is required', 'VALIDATION_ERROR', 400);
    }
    if (siteId && orgId) await assertSiteInOrganization(siteId, orgId);
    await loadSeasonForSite(seasonId, siteId, orgId);

    let siteFilter = '';
    const params: any[] = [orgId, seasonId];
    if (siteId) {
      params.push(siteId);
      siteFilter = ` AND f.farm_area_id IN (SELECT id FROM farm_areas WHERE site_id = $${params.length})`;
    }

    const result = await dbPool.query(
      `SELECT DISTINCT c.id, c.name
       FROM bio_record_field_setup bs
       JOIN crops c ON c.id = bs.crop_id
       JOIN fields f ON f.id = bs.field_id
       WHERE (bs.organization_id IS NULL OR bs.organization_id = $1)
         AND bs.season_id = $2${siteFilter}
       ORDER BY c.name`,
      params,
    );
    res.json({ success: true, data: result.rows });
  }),
);

bioRecordRouter.get(
  '/fields/:cropId',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const orgId = getOrgId(req);
    const { cropId } = req.params;
    const seasonId = req.query.season_id as string | undefined;
    const siteId = req.query.site_id as string | undefined;
    if (!seasonId) {
      throw new AppError('season_id is required', 'VALIDATION_ERROR', 400);
    }
    if (siteId && orgId) await assertSiteInOrganization(siteId, orgId);
    await loadSeasonForSite(seasonId, siteId, orgId);

    const result = await listFieldSetups(orgId, cropId, seasonId, siteId);
    res.json({ success: true, data: result.rows });
  }),
);

// ──────────────────────── Field Setup + Full data ────────────────────────

bioRecordRouter.get(
  '/field-setup/:id',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const setup = await bioService.loadBioSetupInOrg(dbPool, id, getOrgId(req));

    const products = await loadFieldProducts(id);

    // per_m2 / units are the approved values; pending_* and rejected_* travel with
    // them so the grid can show what is waiting and what was sent back.
    const entries = await dbPool.query(
      `SELECT e.*, pu.name AS pending_by_name, ru.name AS rejected_by_name
       FROM bio_record_entries e
       LEFT JOIN users pu ON pu.id = e.pending_by
       LEFT JOIN users ru ON ru.id = e.rejected_by
       WHERE e.field_setup_id = $1`,
      [id],
    );

    res.json({
      success: true,
      data: {
        setup,
        products: products.rows,
        entries: entries.rows,
      },
    });
  }),
);

const fieldSetupSchema = z.object({
  fieldId: z.string().uuid(),
  cropId: z.string().uuid(),
  seasonId: z.string().uuid(),
  year: z.coerce.number().int().optional(),
  surfaceM2: z.number().optional().nullable(),
  plantsPerM2: z.number().optional().nullable(),
  numberOfPlants: z.coerce.number().int().optional().nullable(),
  startWeek: z.coerce.number().int().optional().nullable(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  weekCount: z.coerce.number().int().min(1).max(53).optional().nullable(),
});

const addProductSchema = z.object({
  productCatalogId: z.string().uuid().optional().nullable(),
  itemCode: z.string().optional().nullable(),
  productName: z.string().min(1),
  perPackage: z.coerce.number().int().optional().nullable(),
  pricePerPackage: z.coerce.number().optional().nullable(),
  uomId: z.string().uuid().optional().nullable(),
});

bioRecordRouter.post(
  '/field-setup',
  requireBioManager,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const orgId = requireOrgId(req);
    const userId = getUserId(req);
    const data = fieldSetupSchema.parse(req.body);
    await assertFieldInOrganization(data.fieldId, orgId);
    const season = await loadSeasonForField(data.seasonId, data.fieldId, orgId);
    const year = Number(season.start_year);

    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');

      const upsert = await client.query(
        `INSERT INTO bio_record_field_setup
           (organization_id, field_id, crop_id, year, season_id, surface_m2, plants_per_m2, number_of_plants,
            start_week, start_date, week_count, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, 1), $10, COALESCE($11, 36), $12)
         ON CONFLICT (field_id, crop_id, season_id) DO UPDATE SET
           surface_m2 = EXCLUDED.surface_m2,
           plants_per_m2 = EXCLUDED.plants_per_m2,
           number_of_plants = EXCLUDED.number_of_plants,
           start_week = COALESCE($9, bio_record_field_setup.start_week),
           start_date = COALESCE($10, bio_record_field_setup.start_date),
           week_count = COALESCE($11, bio_record_field_setup.week_count),
           year = EXCLUDED.year,
           updated_at = NOW()
         RETURNING *`,
        [orgId, data.fieldId, data.cropId, year, data.seasonId,
         data.surfaceM2 ?? null, data.plantsPerM2 ?? null,
         data.numberOfPlants ?? null, data.startWeek ?? null,
         data.startDate ?? null, data.weekCount ?? null, userId],
      );
      const setupId = upsert.rows[0].id;

      {
        const existingProducts = await client.query(
          `SELECT COUNT(*) FROM bio_record_field_products WHERE field_setup_id = $1`, [setupId],
        );
        if (parseInt(existingProducts.rows[0].count) === 0) {
          let copied = false;
          const prevSetup = await client.query(
            `SELECT bs.id FROM bio_record_field_setup bs
             JOIN seasons s ON s.id = bs.season_id
             WHERE bs.field_id = $1 AND s.start_date < $2
             ORDER BY s.start_date DESC LIMIT 1`,
            [data.fieldId, season.start_date],
          );
          if (prevSetup.rows.length > 0) {
            const prevProducts = await client.query(
              `SELECT product_catalog_id, item_code, product_name, per_package, price_per_package, uom_id, sort_order
               FROM bio_record_field_products WHERE field_setup_id = $1 ORDER BY sort_order`,
              [prevSetup.rows[0].id],
            );
            if (prevProducts.rows.length > 0) {
              for (const p of prevProducts.rows) {
                await client.query(
                  `INSERT INTO bio_record_field_products
                     (field_setup_id, product_catalog_id, item_code, product_name, per_package, price_per_package, uom_id, sort_order)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                  [setupId, p.product_catalog_id, p.item_code,
                   p.product_name, p.per_package, p.price_per_package, p.uom_id, p.sort_order],
                );
              }
              copied = true;
            }
          }

          if (!copied) {
            const catalog = await client.query(
              `SELECT id, item_code, item_name, per_package, price_per_package, uom_id
               FROM bio_products_catalog
               WHERE (organization_id IS NULL OR organization_id = $1) AND (is_active IS NULL OR is_active = true)
               ORDER BY item_code`,
              [orgId],
            );
            for (let i = 0; i < catalog.rows.length; i++) {
              const c = catalog.rows[i];
              await client.query(
                `INSERT INTO bio_record_field_products
                   (field_setup_id, product_catalog_id, item_code, product_name, per_package, price_per_package, uom_id, sort_order)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [setupId, c.id, c.item_code, c.item_name, c.per_package ?? null, c.price_per_package ?? null, c.uom_id ?? null, i],
              );
            }
          }
        }
      }

      await client.query('COMMIT');

      const products = await loadFieldProducts(setupId);

      res.json({ success: true, data: { setup: upsert.rows[0], products: products.rows } });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }),
);

bioRecordRouter.post(
  '/field-setup/:id/products',
  requireBioManager,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const orgId = requireOrgId(req);
    await bioService.loadBioSetupInOrg(dbPool, id, orgId);
    const data = addProductSchema.parse(req.body);
    const sort = await dbPool.query(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort
       FROM bio_record_field_products WHERE field_setup_id = $1`,
      [id],
    );
    let uomId = data.uomId || null;
    if (data.productCatalogId) {
      const catalog = await dbPool.query(
        `SELECT uom_id FROM bio_products_catalog
         WHERE id = $1 AND (organization_id IS NULL OR organization_id = $2)`,
        [data.productCatalogId, orgId],
      );
      if (!catalog.rows[0]) throw new NotFoundError('Catalog product not found');
      if (!uomId) uomId = catalog.rows[0].uom_id || null;
    }
    const inserted = await dbPool.query(
      `INSERT INTO bio_record_field_products
         (field_setup_id, product_catalog_id, item_code, product_name, per_package, price_per_package, uom_id, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [id, data.productCatalogId || null, data.itemCode || null,
       data.productName, data.perPackage || null, data.pricePerPackage || null,
       uomId, sort.rows[0].next_sort],
    );
    const products = await loadFieldProducts(id);
    res.status(201).json({ success: true, data: { product: inserted.rows[0], products: products.rows } });
  }),
);

bioRecordRouter.delete(
  '/field-setup/:id/products/:productId',
  requireBioManager,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id, productId } = req.params;
    await bioService.loadBioSetupInOrg(dbPool, id, requireOrgId(req));
    if (!UUID_RE.test(String(productId || ''))) throw new NotFoundError('Product column not found');
    await dbPool.query(
      `DELETE FROM bio_record_field_products WHERE id = $1 AND field_setup_id = $2`,
      [productId, id],
    );
    const products = await loadFieldProducts(id);
    res.json({ success: true, data: { products: products.rows } });
  }),
);

// ──────────────────────── Delete field setup ────────────────────────
// Only the bio manager deletes directly. Scouters and workers ask through a
// change request (entity type bio_field_setup) that the pest agronomist reviews.

bioRecordRouter.delete(
  '/field-setup/:id',
  requireBioManager,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const orgId = requireOrgId(req);
    const client = await dbPool.connect();
    let setup: Record<string, unknown>;
    try {
      await client.query('BEGIN');
      setup = await bioService.loadBioSetupInOrg(client, id, orgId, { lock: true });
      await bioService.deleteBioFieldSetup(client, id);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    await logAuditEvent({
      userId: getUserId(req),
      action: 'DELETE',
      entity: 'bio_field_setup',
      entityId: id,
      metadata: {
        field_name: setup.field_name ?? null,
        crop_name: setup.crop_name ?? null,
        season_name: setup.season_name ?? null,
      },
    });
    res.json({ success: true });
  }),
);

// ──────────────────────── Weekly cells ────────────────────────

const cellSchema = z.object({
  productColumnId: z.string().uuid(),
  weekNumber: z.coerce.number().int().min(1).max(53),
  perM2: z.number().nullable().optional(),
  units: z.number().nullable().optional(),
});

/**
 * Save ONLY the cells that changed, for one field table.
 * Bio manager: approved values (clears any pending proposal on those cells).
 * Scouter: pending values only; approved values stay counted until approved.
 */
bioRecordRouter.put(
  '/entries/bulk',
  requireBioCellWriter,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const orgId = requireOrgId(req);
    const userId = getUserId(req);
    const mode = writeModeFor(req);
    const { fieldSetupId, entries } = z.object({
      fieldSetupId: z.string().uuid(),
      entries: z.array(cellSchema).max(5000),
    }).parse(req.body);

    const client = await dbPool.connect();
    let saved: { written: number; pending: number };
    let setup: Record<string, any>;
    try {
      await client.query('BEGIN');
      setup = await bioService.loadBioSetupInOrg(client, fieldSetupId, orgId, { lock: true });
      await bioService.assertProductColumnsInSetup(
        client, fieldSetupId, entries.map((e) => e.productColumnId),
      );
      saved = await bioService.saveBioCells(client, {
        setupId: fieldSetupId,
        cells: entries,
        mode,
        actorId: userId,
      });
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    await logAuditEvent({
      userId,
      action: 'UPDATE',
      entity: 'bio_record',
      entityId: fieldSetupId,
      metadata: {
        type: mode === 'manager' ? 'bio_cells_saved' : 'bio_cells_proposed',
        cells: saved.written,
        pending: saved.pending,
      },
    });
    if (mode === 'proposer') {
      notifyBioManagers(orgId, saved.pending, fieldSetupId, String(setup.field_name || ''));
    }
    res.json({
      success: true,
      data: { upserted: saved.written, written: saved.written, pending: saved.pending, mode },
    });
  }),
);

const reviewSchema = z.object({
  fieldSetupId: z.string().uuid(),
  cells: z.array(z.object({
    productColumnId: z.string().uuid(),
    weekNumber: z.coerce.number().int().min(1).max(53),
  })).max(5000).optional(),
  reason: z.string().max(2000).optional().nullable(),
});

async function reviewPendingCells(req: AuthRequest, res: Response, decision: 'approve' | 'reject') {
  const orgId = requireOrgId(req);
  const userId = getUserId(req);
  const body = reviewSchema.parse(req.body);
  const reason = (body.reason || '').trim();
  if (decision === 'reject' && !reason) {
    throw new AppError('A reason is required to reject values', 'VALIDATION_ERROR', 400);
  }

  const client = await dbPool.connect();
  let result: { count: number; proposers: string[] };
  let setup: Record<string, any>;
  try {
    await client.query('BEGIN');
    setup = await bioService.loadBioSetupInOrg(client, body.fieldSetupId, orgId, { lock: true });
    result = await bioService.reviewBioCells(client, {
      setupId: body.fieldSetupId,
      cells: body.cells,
      decision,
      reason,
      actorId: userId,
    });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  await logAuditEvent({
    userId,
    action: decision === 'approve' ? 'APPROVE' : 'UPDATE',
    entity: 'bio_record',
    entityId: body.fieldSetupId,
    metadata: {
      type: decision === 'approve' ? 'bio_cells_approved' : 'bio_cells_rejected',
      cells: result.count,
      reason: decision === 'reject' ? reason : undefined,
    },
  });

  if (decision === 'reject') {
    const where = String(setup.field_name || 'a biological control table');
    for (const proposer of result.proposers) {
      notifyUser(proposer, {
        title: 'Biological control values rejected',
        message: `Values you entered on ${where} were rejected. Reason: ${reason}`,
        severity: 'warning',
        entityType: 'bio_record',
        entityId: body.fieldSetupId,
        path: BIO_PAGE_PATH,
      }).catch(() => {});
    }
  }

  res.json({ success: true, data: { [decision === 'approve' ? 'approved' : 'rejected']: result.count } });
}

bioRecordRouter.post(
  '/entries/approve',
  requireBioManager,
  asyncHandler(async (req: AuthRequest, res: Response) => reviewPendingCells(req, res, 'approve')),
);

bioRecordRouter.post(
  '/entries/reject',
  requireBioManager,
  asyncHandler(async (req: AuthRequest, res: Response) => reviewPendingCells(req, res, 'reject')),
);

// ──────────────────────── Excel import (bulk) ────────────────────────
// Never deletes: adds missing tables / product columns / weeks and writes only the
// cells in the file. Bio manager -> approved values; worker -> pending values.

bioRecordRouter.post(
  '/import-excel',
  requireBioImporter,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const orgId = requireOrgId(req);
    const userId = getUserId(req);
    const mode = writeModeFor(req);
    const { seasonId, sheets } = z.object({
      seasonId: z.string().uuid(),
      year: z.coerce.number().int().optional(),
      sheets: z.array(z.object({
        fieldId: z.string().uuid(),
        cropId: z.string().uuid(),
        surfaceM2: z.number().optional().nullable(),
        plantsPerM2: z.number().optional().nullable(),
        numberOfPlants: z.number().int().optional().nullable(),
        startWeek: z.number().int().optional().nullable(),
        weekCount: z.coerce.number().int().min(1).max(53).optional().nullable(),
        products: z.array(z.object({
          itemCode: z.string().optional().nullable(),
          productName: z.string().min(1),
          perPackage: z.number().int().optional().nullable(),
          pricePerPackage: z.number().optional().nullable(),
        })),
        entries: z.array(z.object({
          weekNumber: z.number().int(),
          productIndex: z.number().int(),
          perM2: z.number().nullable().optional(),
          units: z.number().nullable().optional(),
        })),
      })),
    }).parse(req.body);

    const client = await dbPool.connect();
    let result: Awaited<ReturnType<typeof bioService.importBioSheets>>;
    try {
      await client.query('BEGIN');
      result = await bioService.importBioSheets(client, {
        orgId,
        actorId: userId,
        seasonId,
        sheets,
        mode,
      });
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    await logAuditEvent({
      userId,
      action: 'IMPORT',
      entity: 'bio_record',
      entityId: result.setupIds[0],
      metadata: {
        type: mode === 'manager' ? 'bio_import' : 'bio_import_pending',
        sheets: result.sheets,
        cells: result.entries,
        pending: result.pending,
        setupIds: result.setupIds,
      },
    });
    if (mode === 'proposer' && result.setupIds[0]) {
      notifyBioManagers(orgId, result.pending, result.setupIds[0], 'Excel import');
    }
    res.json({
      success: true,
      data: { sheets: result.sheets, entries: result.entries, pending: result.pending, mode },
    });
  }),
);

// ──────────────────────── Summary ────────────────────────
// Approved values only: sums read per_m2 / units, never pending_* (a pending-only
// row has NULL per_m2 / units, which SUM ignores).

bioRecordRouter.get(
  '/summary/:cropId',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const orgId = getOrgId(req);
    const { cropId } = req.params;
    const seasonId = req.query.season_id as string | undefined;
    const siteId = req.query.site_id as string | undefined;
    if (!seasonId) {
      throw new AppError('season_id is required', 'VALIDATION_ERROR', 400);
    }

    if (siteId && orgId) await assertSiteInOrganization(siteId, orgId);
    await loadSeasonForSite(seasonId, siteId, orgId);

    const setups = await listFieldSetups(orgId, cropId, seasonId, siteId);
    const setupIds = setups.rows.map((row) => row.id);
    if (setupIds.length === 0) {
      return res.json({ success: true, data: { fields: [], productTotals: [] } });
    }

    const result = await dbPool.query(
      `SELECT bs.id AS setup_id, f.name AS field_name, bs.surface_m2, bs.number_of_plants,
              bs.plants_per_m2, bs.start_week,
              COALESCE(SUM(e.units), 0) AS total_units,
              COALESCE(SUM(e.units * price.resolved), 0) AS total_cost
       FROM bio_record_field_setup bs
       JOIN fields f ON f.id = bs.field_id
       LEFT JOIN bio_record_field_products fp ON fp.field_setup_id = bs.id
       LEFT JOIN LATERAL (
         SELECT (${resolvedPackPriceSql}) AS resolved
       ) price ON TRUE
       LEFT JOIN bio_record_entries e ON e.product_column_id = fp.id
       WHERE bs.id = ANY($1::uuid[])
       GROUP BY bs.id, f.name, bs.surface_m2, bs.number_of_plants, bs.plants_per_m2, bs.start_week
       ORDER BY f.name`,
      [setupIds],
    );

    const productTotals = await dbPool.query(
      `SELECT fp.product_name, fp.item_code,
              SUM(e.per_m2) AS total_per_m2, SUM(e.units) AS total_units,
              COALESCE(SUM(e.units * price.resolved), 0) AS total_cost
       FROM bio_record_field_setup bs
       JOIN bio_record_field_products fp ON fp.field_setup_id = bs.id
       LEFT JOIN LATERAL (
         SELECT (${resolvedPackPriceSql}) AS resolved
       ) price ON TRUE
       LEFT JOIN bio_record_entries e ON e.product_column_id = fp.id
       WHERE bs.id = ANY($1::uuid[])
       GROUP BY fp.product_name, fp.item_code
       ORDER BY fp.product_name`,
      [setupIds],
    );

    res.json({
      success: true,
      data: { fields: result.rows, productTotals: productTotals.rows },
    });
  }),
);
