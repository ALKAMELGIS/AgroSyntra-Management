import type { PoolClient } from 'pg';
import { dbPool } from '../db/client';
import { pushNotificationService } from './push-notification.service';
import { deductByName } from './inventory.service';
import { logger } from '../utils/logger';
import { IpmActor, resolveInitialApproval } from '../utils/ipmAccess';
import { AppError, NotFoundError } from '../utils/errors';
import { checkAndNotifyFieldHarvestConflicts } from './phiAuditLog.service';
import { FARM_TIMEZONE, phiEndIso } from '../utils/harvestPhiPreview';
import { assertFieldDateWritable } from './seasons.service';
import { MAX_PRODUCTS_PER_MIXTURE, assertMixtureSizes, mixtureTooLarge } from '../utils/mixtureGroups';
import { getPestCatalog } from './scouting.service';
import {
  expandCatalogIdsForQuery,
  justificationLabelsForIds,
} from '../utils/pestCatalogMatch';

export type BumbleBeeInspectionUpdateOptions = {
  skipDeployTotalCheck?: boolean;
};

const CATALOG_TYPE_PESTICIDE = 'pesticide_product';

// ─── Pesticide Products ───────────────────────────────────────────

export async function listPesticideProducts(activeOnly = true): Promise<any[]> {
  const where = activeOnly ? 'WHERE is_active = true' : '';
  const result = await dbPool.query(
    `SELECT * FROM pesticide_products ${where} ORDER BY name`
  );
  return result.rows;
}

export async function listFoundationPesticideProducts(activeOnly = true): Promise<any[]> {
  const activeClause = activeOnly ? 'AND is_active = true' : '';
  const result = await dbPool.query(
    `SELECT * FROM pesticide_products WHERE organization_id IS NULL ${activeClause} ORDER BY name`,
  );
  return result.rows;
}

export async function listActivePesticideProducts(organizationId: string, activeOnly = true): Promise<any[]> {
  const activeClause = activeOnly ? 'AND pp.is_active = true' : '';
  const result = await dbPool.query(
    `SELECT pp.*
     FROM pesticide_products pp
     WHERE (
       pp.organization_id = $1
       OR (
         pp.organization_id IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM org_catalog_hidden h
           WHERE h.organization_id = $1
             AND h.catalog_type = '${CATALOG_TYPE_PESTICIDE}'
             AND h.item_id = pp.id
         )
         AND NOT EXISTS (
           SELECT 1 FROM pesticide_products ov
           WHERE ov.organization_id = $1 AND ov.source_product_id = pp.id
         )
       )
     )
     ${activeClause}
     ORDER BY pp.name`,
    [organizationId],
  );
  return result.rows;
}

export async function getPesticideProductById(id: string): Promise<any | null> {
  const result = await dbPool.query('SELECT * FROM pesticide_products WHERE id = $1', [id]);
  return result.rows[0] || null;
}

export async function addPesticideFromFoundation(
  organizationId: string,
  foundationId: string,
  createdBy?: string,
): Promise<any> {
  const foundation = await getPesticideProductById(foundationId);
  if (!foundation || foundation.organization_id !== null) {
    throw new AppError('Foundation product not found', 'NOT_FOUND', 404);
  }

  const existing = await dbPool.query(
    `SELECT * FROM pesticide_products WHERE organization_id = $1 AND source_product_id = $2`,
    [organizationId, foundationId],
  );
  if (existing.rows.length > 0) return existing.rows[0];

  await dbPool.query(
    `DELETE FROM org_catalog_hidden
     WHERE organization_id = $1 AND catalog_type = $2 AND item_id = $3`,
    [organizationId, CATALOG_TYPE_PESTICIDE, foundationId],
  );

  const result = await dbPool.query(
    `INSERT INTO pesticide_products (
       name, active_ingredient, formulation_type, phi_days, manufacturer, registration_number,
       target_pests, safety_notes, organization_id, created_by, source_product_id,
       target_crops, max_individual_dose, max_total_dose, max_applications,
       growth_stage, spray_interval, phi_text, re_entry_interval,
       bumble_bee_interval, chemical_category, has_label_msds, is_active
     )
     SELECT name, active_ingredient, formulation_type, phi_days, manufacturer, registration_number,
            target_pests, safety_notes, $1, $2, id,
            target_crops, max_individual_dose, max_total_dose, max_applications,
            growth_stage, spray_interval, phi_text, re_entry_interval,
            bumble_bee_interval, chemical_category, has_label_msds, is_active
     FROM pesticide_products WHERE id = $3 AND organization_id IS NULL
     RETURNING *`,
    [organizationId, createdBy ?? null, foundationId],
  );
  if (result.rows.length === 0) {
    throw new AppError('Foundation product not found', 'NOT_FOUND', 404);
  }
  return result.rows[0];
}

export async function updatePesticideProductForOrg(
  id: string,
  organizationId: string,
  data: any,
  createdBy?: string,
): Promise<any> {
  const existing = await getPesticideProductById(id);
  if (!existing) throw new AppError('Product not found', 'NOT_FOUND', 404);

  if (existing.organization_id === null) {
    const override = await dbPool.query(
      `SELECT id FROM pesticide_products WHERE organization_id = $1 AND source_product_id = $2`,
      [organizationId, id],
    );
    if (override.rows.length > 0) {
      return updatePesticideProduct(override.rows[0].id, data);
    }
    const cloned = await addPesticideFromFoundation(organizationId, id, createdBy);
    return updatePesticideProduct(cloned.id, data);
  }

  if (existing.organization_id !== organizationId) {
    throw new AppError('Product not found in organization', 'FORBIDDEN', 403);
  }
  return updatePesticideProduct(id, data);
}

export async function deletePesticideProductForOrg(id: string, organizationId: string): Promise<void> {
  const existing = await getPesticideProductById(id);
  if (!existing) throw new AppError('Product not found', 'NOT_FOUND', 404);

  if (existing.organization_id === null) {
    await dbPool.query(
      `INSERT INTO org_catalog_hidden (organization_id, catalog_type, item_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (organization_id, catalog_type, item_id) DO NOTHING`,
      [organizationId, CATALOG_TYPE_PESTICIDE, id],
    );
    return;
  }

  if (existing.organization_id !== organizationId) {
    throw new AppError('Product not found in organization', 'FORBIDDEN', 403);
  }
  await deletePesticideProduct(id);
}

export async function createPesticideProduct(data: any): Promise<any> {
  const result = await dbPool.query(
    `INSERT INTO pesticide_products
       (name, active_ingredient, formulation_type, phi_days, manufacturer, registration_number,
        target_pests, safety_notes, organization_id, created_by,
        target_crops, max_individual_dose, max_total_dose, max_applications,
        growth_stage, spray_interval, phi_text, re_entry_interval,
        bumble_bee_interval, chemical_category, has_label_msds)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
             $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21) RETURNING *`,
    [data.name, data.activeIngredient, data.formulationType, data.phiDays || 0,
     data.manufacturer, data.registrationNumber, JSON.stringify(data.targetPests || []),
     data.safetyNotes, data.organizationId, data.createdBy,
     data.targetCrops || null, data.maxIndividualDose || null, data.maxTotalDose || null,
     data.maxApplications || null, data.growthStage || null, data.sprayInterval || null,
     data.phiText || null, data.reEntryInterval || null, data.bumbleBeeInterval || null,
     data.chemicalCategory || null, data.hasLabelMsds ?? false]
  );
  return result.rows[0];
}

export async function updatePesticideProduct(id: string, data: any): Promise<any> {
  const sets: string[] = [];
  const params: any[] = [];

  if (data.name !== undefined) { params.push(data.name); sets.push(`name = $${params.length}`); }
  if (data.activeIngredient !== undefined) { params.push(data.activeIngredient); sets.push(`active_ingredient = $${params.length}`); }
  if (data.formulationType !== undefined) { params.push(data.formulationType); sets.push(`formulation_type = $${params.length}`); }
  if (data.phiDays !== undefined) { params.push(data.phiDays); sets.push(`phi_days = $${params.length}`); }
  if (data.manufacturer !== undefined) { params.push(data.manufacturer); sets.push(`manufacturer = $${params.length}`); }
  if (data.registrationNumber !== undefined) { params.push(data.registrationNumber); sets.push(`registration_number = $${params.length}`); }
  if (data.targetPests !== undefined) { params.push(JSON.stringify(data.targetPests)); sets.push(`target_pests = $${params.length}`); }
  if (data.safetyNotes !== undefined) { params.push(data.safetyNotes); sets.push(`safety_notes = $${params.length}`); }
  if (data.isActive !== undefined) { params.push(data.isActive); sets.push(`is_active = $${params.length}`); }
  if (data.targetCrops !== undefined) { params.push(data.targetCrops); sets.push(`target_crops = $${params.length}`); }
  if (data.maxIndividualDose !== undefined) { params.push(data.maxIndividualDose); sets.push(`max_individual_dose = $${params.length}`); }
  if (data.maxTotalDose !== undefined) { params.push(data.maxTotalDose); sets.push(`max_total_dose = $${params.length}`); }
  if (data.maxApplications !== undefined) { params.push(data.maxApplications); sets.push(`max_applications = $${params.length}`); }
  if (data.growthStage !== undefined) { params.push(data.growthStage); sets.push(`growth_stage = $${params.length}`); }
  if (data.sprayInterval !== undefined) { params.push(data.sprayInterval); sets.push(`spray_interval = $${params.length}`); }
  if (data.phiText !== undefined) { params.push(data.phiText); sets.push(`phi_text = $${params.length}`); }
  if (data.reEntryInterval !== undefined) { params.push(data.reEntryInterval); sets.push(`re_entry_interval = $${params.length}`); }
  if (data.bumbleBeeInterval !== undefined) { params.push(data.bumbleBeeInterval); sets.push(`bumble_bee_interval = $${params.length}`); }
  if (data.chemicalCategory !== undefined) { params.push(data.chemicalCategory); sets.push(`chemical_category = $${params.length}`); }
  if (data.hasLabelMsds !== undefined) { params.push(data.hasLabelMsds); sets.push(`has_label_msds = $${params.length}`); }

  sets.push('updated_at = NOW()');
  params.push(id);

  const result = await dbPool.query(
    `UPDATE pesticide_products SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  );
  return result.rows[0];
}

export async function deletePesticideProduct(id: string): Promise<void> {
  await dbPool.query('UPDATE pesticide_products SET is_active = false, updated_at = NOW() WHERE id = $1', [id]);
}

// ─── Pesticide Applications ──────────────────────────────────────

export async function listPesticideApplications(opts: {
  fieldId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  /** When true, include apps whose PHI overlaps [startDate, endDate], not only application_date in range */
  calendarDateWindow?: boolean;
  search?: string;
  variety?: string;
  justification?: string;
  templateId?: string;
  siteId?: string;
  organizationId: string;
  page?: number;
  limit?: number;
}): Promise<{ items: any[]; meta: any }> {
  const page = opts.page || 1;
  const limit = Math.min(opts.limit || 500, 2000);
  const offset = (page - 1) * limit;
  let where = 'WHERE 1=1';
  let extraJoin = '';
  const params: any[] = [];

  params.push(opts.organizationId);
  where += ` AND COALESCE(pa.organization_id, f.organization_id) = $${params.length}`;

  if (opts.siteId) {
    params.push(opts.siteId);
    extraJoin = ' JOIN farm_areas fa ON fa.id = f.farm_area_id';
    where += ` AND fa.site_id = $${params.length}`;
  }
  if (opts.fieldId) { params.push(opts.fieldId); where += ` AND pa.field_id = $${params.length}`; }
  if (opts.status) { params.push(opts.status); where += ` AND pa.approval_status = $${params.length}`; }
  if (opts.calendarDateWindow && opts.startDate && opts.endDate) {
    params.push(opts.endDate);
    const endIdx = params.length;
    params.push(opts.startDate);
    const startIdx = params.length;
    where += ` AND pa.application_date <= $${endIdx} AND COALESCE(pa.phi_end_date, pa.application_date) >= $${startIdx}`;
  } else {
    if (opts.startDate) { params.push(opts.startDate); where += ` AND pa.application_date >= $${params.length}`; }
    if (opts.endDate) { params.push(opts.endDate); where += ` AND pa.application_date <= $${params.length}`; }
  }
  if (opts.templateId) { params.push(opts.templateId); where += ` AND pa.template_id = $${params.length}`; }
  if (opts.search) {
    params.push(`%${opts.search}%`);
    where += ` AND (pa.crop_name ILIKE $${params.length} OR pa.variety ILIKE $${params.length} OR pa.justification ILIKE $${params.length} OR pa.operator_name ILIKE $${params.length})`;
  }
  const variety = opts.variety?.trim();
  if (variety) {
    params.push(`%${variety}%`);
    where += ` AND pa.variety ILIKE $${params.length}`;
  }
  const justification = opts.justification?.trim();
  if (justification) {
    const catalog = await getPestCatalog(opts.organizationId);
    const linkResult = await dbPool.query(
      `SELECT member_id, group_id FROM pest_catalog_group_members
       WHERE member_id = ANY($1::uuid[]) OR group_id = ANY($1::uuid[])`,
      [catalog.map((row) => row.id)],
    );
    const expandedIds = expandCatalogIdsForQuery(
      justification,
      catalog,
      linkResult.rows.map((row) => ({ memberId: row.member_id, groupId: row.group_id })),
    );
    const labels = justificationLabelsForIds(expandedIds, catalog);
    params.push(`%${justification}%`);
    const likeIdx = params.length;
    let clause = ` AND (pa.justification ILIKE $${likeIdx}`;
    if (expandedIds.length) {
      params.push(expandedIds);
      clause += ` OR pa.justification_catalog_id = ANY($${params.length}::uuid[])`;
    }
    if (labels.length) {
      params.push(labels);
      clause += ` OR pa.justification = ANY($${params.length}::text[])`;
    }
    clause += ')';
    where += clause;
  }

  const countResult = await dbPool.query(
    `SELECT COUNT(*) FROM pesticide_applications pa LEFT JOIN fields f ON f.id = pa.field_id${extraJoin} ${where}`,
    params
  );
  const total = parseInt(countResult.rows[0].count, 10);

  params.push(limit);
  const lIdx = params.length;
  params.push(offset);
  const oIdx = params.length;

  const result = await dbPool.query(
    `SELECT pa.*, f.name AS field_name, pp.name AS product_name, pp.phi_days,
            pp.active_ingredient AS product_active_ingredient,
            c.name AS field_crop_name,
            auth_u.name AS authorized_by_name, cr_u.name AS created_by_name
     FROM pesticide_applications pa
     LEFT JOIN fields f ON f.id = pa.field_id
     ${extraJoin}
     LEFT JOIN pesticide_products pp ON pp.id = pa.product_id
     LEFT JOIN crops c ON c.id = f.current_crop_id
     LEFT JOIN users auth_u ON auth_u.id = pa.authorized_by
     LEFT JOIN users cr_u ON cr_u.id = pa.created_by
     ${where}
     ORDER BY pa.application_date DESC, pa.created_at DESC
     LIMIT $${lIdx} OFFSET $${oIdx}`,
    params
  );

  return { items: result.rows, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
}

/**
 * Resolve PHI days for a product+crop combination on a given site.
 * Priority: site_product_crop_phi override > pesticide_products.phi_days default.
 */
export async function getPhiForSiteProductCrop(siteId: string | null, productId: string, cropName: string | null): Promise<number> {
  if (siteId && cropName) {
    const override = await dbPool.query(
      `SELECT phi_days FROM site_product_crop_phi WHERE site_id = $1 AND product_id = $2 AND LOWER(crop_name) = LOWER($3)`,
      [siteId, productId, cropName]
    );
    if (override.rows.length > 0) return override.rows[0].phi_days;
  }
  const product = await dbPool.query('SELECT phi_days FROM pesticide_products WHERE id = $1', [productId]);
  return product.rows[0]?.phi_days || 0;
}

/**
 * Batch-resolve PHI for multiple product+crop pairs on a site.
 * Returns a map: `${productId}|${cropName}` -> phi_days
 */
export async function batchGetPhiForSite(siteId: string | null, pairs: Array<{ productId: string; cropName: string | null }>): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (!siteId || pairs.length === 0) return result;

  const overrides = await dbPool.query(
    `SELECT product_id, crop_name, phi_days FROM site_product_crop_phi WHERE site_id = $1`,
    [siteId]
  );
  for (const row of overrides.rows) {
    result.set(`${row.product_id}|${(row.crop_name || '').toLowerCase()}`, row.phi_days);
  }
  return result;
}

const APPLICATION_METHODS = new Set(['spray', 'drench', 'fog', 'granule', 'other']);

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function ymd(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** Only spray/drench/fog/granule/other. Excel machinery stays out of this CHECK column. */
export function resolveApplicationMethod(method?: unknown, machinery?: unknown): string | null {
  for (const raw of [method, machinery]) {
    const normalized = String(raw ?? '').trim().toLowerCase();
    if (APPLICATION_METHODS.has(normalized)) return normalized;
  }
  return null;
}

export function optionalSqlDate(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return ymd(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  const trimmed = String(value).trim();
  if (!trimmed) return null;

  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (iso) return ymd(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const dmy = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (dmy) {
    const first = Number(dmy[1]);
    const second = Number(dmy[2]);
    const year = Number(dmy[3]);
    const asDayFirst = ymd(year, second, first);
    if (asDayFirst) return asDayFirst;
    return ymd(year, first, second);
  }

  return null;
}

export function resolveApplicationDate(value: string | null | undefined): string {
  const parsed = optionalSqlDate(value);
  if (parsed) return parsed;
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Refuses a row joining a tank-mix group that already holds MAX_PRODUCTS_PER_MIXTURE products. */
async function assertRoomInMixture(groupId: string | null | undefined, excludeId?: string): Promise<void> {
  if (!groupId) return;
  const result = await dbPool.query(
    `SELECT COUNT(*)::int AS n FROM pesticide_applications
     WHERE group_id = $1 AND ($2::uuid IS NULL OR id <> $2::uuid)`,
    [groupId, excludeId || null],
  );
  if ((result.rows[0]?.n || 0) >= MAX_PRODUCTS_PER_MIXTURE) throw mixtureTooLarge();
}

export async function createPesticideApplication(data: any, actor: IpmActor, siteId?: string | null): Promise<any> {
  await assertRoomInMixture(data.groupId);
  const applicationDate = resolveApplicationDate(data.applicationDate);
  await assertFieldDateWritable(data.fieldId, applicationDate);
  let product: any = null;
  let phiDays = 0;
  let productName = 'Unknown';
  let productIngredient = '';

  if (data.productId) {
    const productResult = await dbPool.query(
      'SELECT phi_days, name, active_ingredient FROM pesticide_products WHERE id = $1',
      [data.productId]
    );
    product = productResult.rows[0];
    phiDays = product?.phi_days || 0;
    productName = product?.name || 'Unknown';
    productIngredient = product?.active_ingredient || '';

    if (siteId && data.cropName) {
      phiDays = await getPhiForSiteProductCrop(siteId, data.productId, data.cropName);
    }
  }

  const phiEndDate = phiEndIso(applicationDate, data.applicationStartTime, data.applicationEndTime, phiDays);

  let cost = data.cost ? Number(data.cost) : null;
  let unitPrice = data.unitPrice != null ? data.unitPrice : null;
  if (unitPrice == null && siteId && data.productId) {
    const priceResult = await dbPool.query(
      'SELECT unit_price FROM site_pesticide_products WHERE site_id = $1 AND product_id = $2',
      [siteId, data.productId],
    );
    if (priceResult.rows[0]?.unit_price != null) {
      unitPrice = priceResult.rows[0].unit_price;
    }
  }
  if (!cost && data.totalQuantityApplied && unitPrice) {
    cost = (Number(data.totalQuantityApplied) * Number(unitPrice)) / 1000;
  }
  if (!cost && data.ratePerHa && unitPrice) {
    cost = Number(data.ratePerHa) * Number(unitPrice);
  }

  const approval = resolveInitialApproval(actor);
  const approvedAt = approval.status === 'approved' ? new Date().toISOString() : null;
  const createdBy = actor.userId;

  const result = await dbPool.query(
    `INSERT INTO pesticide_applications
       (field_id, product_id, application_date, phi_end_date, dosage, dosage_unit, concentration,
        application_method, target_pest, operator_name, weather_conditions, ppe_used,
        notes, approval_status, organization_id, created_by,
        crop_name, variety, segment_id, scouting_date, justification, percent_seen,
        application_start_time, application_end_time, active_ingredient,
        rate_per_ha, unit_price, cost, uom, total_quantity_applied,
        machinery_used, verified_by, template_id, total_water_qty,
        group_id, is_mixture_child, authorized_by, approved_at, justification_catalog_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
             $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39)
     RETURNING *`,
    [
      data.fieldId || null, data.productId || null, applicationDate,
      phiEndDate,
      data.dosage, data.dosageUnit || data.uom || 'ml/L', data.concentration,
      resolveApplicationMethod(data.applicationMethod, data.machineryUsed), data.targetPest || data.justification,
      data.operatorName, data.weatherConditions, JSON.stringify(data.ppeUsed || []),
      data.notes, approval.status, data.organizationId, createdBy,
      data.cropName || null,
      data.variety || null,
      data.segmentId || null,
      optionalSqlDate(data.scoutingDate),
      data.justification || data.targetPest || null,
      data.percentSeen || null,
      data.applicationStartTime || null,
      data.applicationEndTime || null,
      data.activeIngredient || productIngredient || null,
      data.ratePerHa != null ? data.ratePerHa : null,
      unitPrice != null ? unitPrice : null,
      cost,
      data.uom || data.dosageUnit || null,
      data.totalQuantityApplied != null ? data.totalQuantityApplied : null,
      data.machineryUsed || data.applicationMethod || null,
      data.verifiedBy || null,
      data.templateId || null,
      data.totalWaterQty != null ? data.totalWaterQty : null,
      data.groupId || null,
      data.isMixtureChild || false,
      approval.authorizedBy,
      approvedAt,
      data.justificationCatalogId || null,
    ]
  );

  const application = result.rows[0];

  if (approval.status === 'approved') {
    await schedulePHINotifications(application);
    checkAndNotifyFieldHarvestConflicts(application.field_id).catch(() => {});
  }

  // Auto-create cost entry if cost is provided and we have enough context
  const finalCost = cost || (data.cost ? Number(data.cost) : 0);
  if (finalCost > 0 && data.fieldId) {
    await dbPool.query(
      `INSERT INTO cost_entries (field_id, category, amount, currency, description, date, created_by, ipm_application_id)
       VALUES ($1, 'pesticide', $2, $3, $4, $5, $6, $7)`,
      [
        data.fieldId, finalCost, data.currency || 'AED',
        `Pesticide: ${productName} - ${data.dosage || ''} ${data.uom || data.dosageUnit || 'ml/L'}`,
        applicationDate, createdBy, application.id,
      ]
    );
  }

  // Auto-deduct from inventory (best-effort)
  if (data.totalQuantityApplied && Number(data.totalQuantityApplied) > 0 && productName !== 'Unknown') {
    deductByName(productName, 'pesticide', Number(data.totalQuantityApplied), 'pesticide_application', application.id, createdBy)
      .catch((err) => logger.warn({ err, productName }, 'Inventory deduction failed for pesticide'));
  }

  return application;
}

export async function bulkCreatePesticideApplications(rows: any[], actor: IpmActor, siteId?: string | null): Promise<{ inserted: number; productsCreated: number }> {
  if (!rows || rows.length === 0) return { inserted: 0, productsCreated: 0 };
  assertMixtureSizes(rows.map((r) => r.groupId));

  const approval = resolveInitialApproval(actor);
  const approvedAt = approval.status === 'approved' ? new Date().toISOString() : null;
  const createdBy = actor.userId;

  // Pre-fetch all unique products in one query
  const productIds = [...new Set(rows.map(r => r.productId).filter(Boolean))];
  const productMap: Record<string, any> = {};
  if (productIds.length > 0) {
    const prodResult = await dbPool.query(
      `SELECT id, phi_days, name, active_ingredient FROM pesticide_products WHERE id = ANY($1::uuid[])`,
      [productIds]
    );
    for (const p of prodResult.rows) productMap[p.id] = p;
  }

  // Auto-create products that have a name but no productId
  let productsCreated = 0;
  const missingProducts = rows.filter(r => !r.productId && r.productName);
  const uniqueNames = [...new Set(missingProducts.map(r => (r.productName as string).trim().toLowerCase()))];

  if (uniqueNames.length > 0) {
    const existingResult = await dbPool.query(
      `SELECT id, name, LOWER(name) AS lname, phi_days, active_ingredient FROM pesticide_products WHERE LOWER(name) = ANY($1::text[])`,
      [uniqueNames]
    );
    const existingByName: Record<string, any> = {};
    for (const p of existingResult.rows) existingByName[p.lname] = p;

    for (const uName of uniqueNames) {
      if (existingByName[uName]) continue;
      const sample = missingProducts.find(r => (r.productName as string).trim().toLowerCase() === uName);
      const insertResult = await dbPool.query(
        `INSERT INTO pesticide_products (name, active_ingredient, organization_id, created_by, is_active)
         VALUES ($1, $2, $3, $4, TRUE) RETURNING id, name, phi_days, active_ingredient`,
        [sample.productName.trim(), sample.activeIngredient || null, sample.organizationId || null, createdBy]
      );
      existingByName[uName] = insertResult.rows[0];
      productsCreated++;
    }

    // Link all newly resolved products to the site catalog
    if (siteId) {
      for (const uName of uniqueNames) {
        const prod = existingByName[uName];
        if (!prod) continue;
        const sampleRow = missingProducts.find(r => (r.productName as string).trim().toLowerCase() === uName);
        await dbPool.query(
          `INSERT INTO site_pesticide_products (site_id, product_id, unit_price) VALUES ($1, $2, $3) ON CONFLICT (site_id, product_id) DO NOTHING`,
          [siteId, prod.id, sampleRow?.unitPrice || null]
        );
      }
    }

    // Resolve productId for all rows that were missing it
    for (const row of rows) {
      if (!row.productId && row.productName) {
        const lname = (row.productName as string).trim().toLowerCase();
        const resolved = existingByName[lname];
        if (resolved) {
          row.productId = resolved.id;
          productMap[resolved.id] = resolved;
        }
      }
    }
  }

  // Batch-fetch crop-specific PHI overrides for this site
  const cropPhiMap = await batchGetPhiForSite(siteId || null, rows.filter(r => r.productId && r.cropName).map(r => ({ productId: r.productId, cropName: r.cropName })));

  const COLS = [
    'field_id', 'product_id', 'application_date', 'phi_end_date', 'dosage', 'dosage_unit', 'concentration',
    'application_method', 'target_pest', 'operator_name', 'weather_conditions', 'ppe_used',
    'notes', 'approval_status', 'organization_id', 'created_by',
    'crop_name', 'variety', 'segment_id', 'scouting_date', 'justification', 'percent_seen',
    'application_start_time', 'application_end_time', 'active_ingredient',
    'rate_per_ha', 'unit_price', 'cost', 'uom', 'total_quantity_applied',
    'machinery_used', 'verified_by', 'template_id', 'total_water_qty',
    'group_id', 'is_mixture_child', 'authorized_by', 'approved_at', 'justification_catalog_id',
  ];
  const COLS_PER_ROW = COLS.length;

  const params: any[] = [];
  const valueClauses: string[] = [];

  for (const data of rows) {
    const applicationDate = resolveApplicationDate(data.applicationDate);
    const product = data.productId ? productMap[data.productId] : null;
    const cropPhiKey = data.productId && data.cropName ? `${data.productId}|${(data.cropName as string).toLowerCase()}` : '';
    const phiDays = cropPhiMap.get(cropPhiKey) ?? product?.phi_days ?? 0;
    const productName = product?.name || 'Unknown';
    const productIngredient = product?.active_ingredient || '';

    const phiEndDate = phiEndIso(applicationDate, data.applicationStartTime, data.applicationEndTime, phiDays);

    let cost = data.cost ? Number(data.cost) : null;
    if (!cost && data.totalQuantityApplied && data.unitPrice) {
      cost = (Number(data.totalQuantityApplied) * Number(data.unitPrice)) / 1000;
    }
    if (!cost && data.ratePerHa && data.unitPrice) {
      cost = Number(data.ratePerHa) * Number(data.unitPrice);
    }

    const base = params.length;
    const placeholders = Array.from({ length: COLS_PER_ROW }, (_, i) => `$${base + i + 1}`);
    valueClauses.push(`(${placeholders.join(', ')})`);

    params.push(
      data.fieldId || null,
      data.productId || null,
      applicationDate,
      phiEndDate,
      data.dosage != null ? data.dosage : null,
      data.dosageUnit || data.uom || 'ml/L',
      data.concentration || null,
      resolveApplicationMethod(data.applicationMethod, data.machineryUsed),
      data.targetPest || data.justification || null,
      data.operatorName || null,
      data.weatherConditions || null,
      JSON.stringify(data.ppeUsed || []),
      data.notes || null,
      approval.status,
      data.organizationId || null,
      createdBy,
      data.cropName || null,
      data.variety || null,
      data.segmentId || null,
      optionalSqlDate(data.scoutingDate),
      data.justification || data.targetPest || null,
      data.percentSeen || null,
      data.applicationStartTime || null,
      data.applicationEndTime || null,
      data.activeIngredient || productIngredient || null,
      data.ratePerHa != null ? data.ratePerHa : null,
      data.unitPrice != null ? data.unitPrice : null,
      cost,
      data.uom || data.dosageUnit || null,
      data.totalQuantityApplied != null ? data.totalQuantityApplied : null,
      data.machineryUsed || data.applicationMethod || null,
      data.verifiedBy || null,
      data.templateId || null,
      data.totalWaterQty != null ? data.totalWaterQty : null,
      data.groupId || null,
      data.isMixtureChild || false,
      approval.authorizedBy,
      approvedAt,
      data.justificationCatalogId || null,
    );
  }

  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');

    const insertResult = await client.query(
      `INSERT INTO pesticide_applications (${COLS.join(', ')})
       VALUES ${valueClauses.join(', ')}
       RETURNING *`,
      params
    );

    // Batch-insert cost entries for rows that have cost > 0
    const costRows = insertResult.rows.filter(r => r.cost > 0 && r.field_id && r.application_date);
    if (costRows.length > 0) {
      const costParams: any[] = [];
      const costValues: string[] = [];
      for (const app of costRows) {
        const base = costParams.length;
        costValues.push(`($${base + 1}, 'pesticide', $${base + 2}, 'AED', 'Bulk import', $${base + 3}, $${base + 4}, $${base + 5})`);
        costParams.push(app.field_id, app.cost, app.application_date, createdBy, app.id);
      }
      await client.query(
        `INSERT INTO cost_entries (field_id, category, amount, currency, description, date, created_by, ipm_application_id)
         VALUES ${costValues.join(', ')}`,
        costParams
      );
    }

    await client.query('COMMIT');

    return { inserted: insertResult.rowCount || 0, productsCreated };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function updatePesticideApplication(id: string, data: any, updatedBy: string, siteId?: string | null): Promise<any> {
  const existing = await dbPool.query(
    'SELECT field_id, application_date, application_start_time, application_end_time, group_id FROM pesticide_applications WHERE id = $1',
    [id],
  );
  const current = existing.rows[0];
  if (data.groupId && data.groupId !== current?.group_id) await assertRoomInMixture(data.groupId, id);
  await assertFieldDateWritable(
    data.fieldId || current?.field_id,
    resolveApplicationDate(data.applicationDate || current?.application_date),
  );
  const productResult = data.productId
    ? await dbPool.query('SELECT phi_days, active_ingredient FROM pesticide_products WHERE id = $1', [data.productId])
    : { rows: [] };
  const product = productResult.rows[0];
  let phiDays = product?.phi_days || data.phiDays || 0;

  if (siteId && data.productId && data.cropName) {
    phiDays = await getPhiForSiteProductCrop(siteId, data.productId, data.cropName);
  }

  const applicationDate = resolveApplicationDate(data.applicationDate || current?.application_date);
  const phiEndDate = phiEndIso(
    applicationDate,
    data.applicationStartTime ?? current?.application_start_time,
    data.applicationEndTime ?? current?.application_end_time,
    phiDays,
  );

  let cost = data.cost ? Number(data.cost) : null;
  if (!cost && data.totalQuantityApplied && data.unitPrice) {
    cost = (Number(data.totalQuantityApplied) * Number(data.unitPrice)) / 1000;
  }

  const result = await dbPool.query(
    `UPDATE pesticide_applications SET
       field_id = COALESCE($1, field_id),
       product_id = COALESCE($2, product_id),
       application_date = COALESCE($3, application_date),
       phi_end_date = COALESCE($4, phi_end_date),
       dosage = COALESCE($5, dosage),
       uom = COALESCE($6, uom),
       crop_name = COALESCE($7, crop_name),
       variety = COALESCE($8, variety),
       segment_id = COALESCE($9, segment_id),
       scouting_date = $10,
       justification = COALESCE($11, justification),
       percent_seen = $12,
       application_start_time = $13,
       application_end_time = $14,
       active_ingredient = COALESCE($15, active_ingredient),
       unit_price = $16,
       cost = $17,
       total_quantity_applied = $18,
       machinery_used = $19,
       weather_conditions = $20,
       operator_name = $21,
       verified_by = $22,
       template_id = COALESCE($23, template_id),
       total_water_qty = $24,
       rate_per_ha = $25,
       application_method = COALESCE($26, application_method),
       group_id = COALESCE($27, group_id),
       is_mixture_child = COALESCE($28, is_mixture_child),
       justification_catalog_id = COALESCE($30, justification_catalog_id),
       updated_at = NOW()
     WHERE id = $29
     RETURNING *`,
    [
      data.fieldId || null,
      data.productId || null,
      optionalSqlDate(data.applicationDate),
      phiEndDate,
      data.dosage || null,
      data.uom || null,
      data.cropName || null,
      data.variety || null,
      data.segmentId || null,
      optionalSqlDate(data.scoutingDate),
      data.justification || null,
      data.percentSeen || null,
      data.applicationStartTime || null,
      data.applicationEndTime || null,
      data.activeIngredient || product?.active_ingredient || null,
      data.unitPrice != null ? Number(data.unitPrice) : null,
      cost,
      data.totalQuantityApplied != null ? Number(data.totalQuantityApplied) : null,
      data.machineryUsed || null,
      data.weatherConditions || null,
      data.operatorName || null,
      data.verifiedBy || null,
      data.templateId || null,
      data.totalWaterQty != null ? Number(data.totalWaterQty) : null,
      data.ratePerHa != null ? Number(data.ratePerHa) : null,
      data.applicationMethod || null,
      data.groupId || null,
      data.isMixtureChild != null ? data.isMixtureChild : null,
      id,
      data.justificationCatalogId || null,
    ]
  );
  return result.rows[0];
}

export async function deletePesticideApplication(id: string): Promise<void> {
  await dbPool.query('DELETE FROM cost_entries WHERE ipm_application_id = $1', [id]);
  await dbPool.query('DELETE FROM pesticide_applications WHERE id = $1', [id]);
}

const ORG_SCOPE = `COALESCE(pa.organization_id, (SELECT f.organization_id FROM fields f WHERE f.id = pa.field_id))`;

export async function bulkDeletePesticideApplications(ids: string[], organizationId: string): Promise<number> {
  const unique = [...new Set(ids)];
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const match = await client.query(
      `SELECT pa.id FROM pesticide_applications pa
       WHERE pa.id = ANY($1::uuid[]) AND ${ORG_SCOPE} = $2`,
      [unique, organizationId],
    );
    const matchedIds = match.rows.map((r) => r.id);
    if (matchedIds.length === 0) {
      await client.query('COMMIT');
      return 0;
    }
    await client.query('DELETE FROM cost_entries WHERE ipm_application_id = ANY($1::uuid[])', [matchedIds]);
    const deleted = await client.query(
      'DELETE FROM pesticide_applications WHERE id = ANY($1::uuid[])',
      [matchedIds],
    );
    await client.query('COMMIT');
    return deleted.rowCount || 0;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

const CREATED_TODAY_SQL = `(timezone('${FARM_TIMEZONE}', pa.created_at))::date = (timezone('${FARM_TIMEZONE}', NOW()))::date`;

function createdTodayFromWhere(opts: {
  organizationId: string;
  siteId: string;
  templateId?: string | null;
}): { fromSql: string; whereSql: string; params: string[] } {
  const params: string[] = [opts.organizationId, opts.siteId];
  let whereSql = `WHERE COALESCE(pa.organization_id, f.organization_id) = $1
    AND fa.site_id = $2
    AND ${CREATED_TODAY_SQL}`;
  if (opts.templateId) {
    params.push(opts.templateId);
    whereSql += ` AND pa.template_id = $${params.length}`;
  }
  return {
    fromSql: `FROM pesticide_applications pa
      LEFT JOIN fields f ON f.id = pa.field_id
      JOIN farm_areas fa ON fa.id = f.farm_area_id`,
    whereSql,
    params,
  };
}

export async function countPesticideApplicationsCreatedToday(opts: {
  organizationId: string;
  siteId: string;
  templateId?: string | null;
}): Promise<number> {
  const { fromSql, whereSql, params } = createdTodayFromWhere(opts);
  const result = await dbPool.query(`SELECT COUNT(*) ${fromSql} ${whereSql}`, params);
  return parseInt(result.rows[0].count, 10);
}

export async function deletePesticideApplicationsCreatedToday(opts: {
  organizationId: string;
  siteId: string;
  templateId?: string | null;
}): Promise<number> {
  const { fromSql, whereSql, params } = createdTodayFromWhere(opts);
  const idsResult = await dbPool.query(`SELECT pa.id ${fromSql} ${whereSql}`, params);
  const ids = idsResult.rows.map((row: { id: string }) => row.id);
  if (ids.length === 0) return 0;
  return bulkDeletePesticideApplications(ids, opts.organizationId);
}

export async function bulkApprovePesticideApplications(
  ids: string[],
  agronomistId: string,
  organizationId: string,
): Promise<number> {
  const unique = [...new Set(ids)];
  const result = await dbPool.query(
    `UPDATE pesticide_applications pa
     SET approval_status = 'approved', authorized_by = $1, approved_at = NOW(), updated_at = NOW()
     WHERE pa.id = ANY($2::uuid[])
       AND pa.approval_status = 'pending'
       AND ${ORG_SCOPE} = $3`,
    [agronomistId, unique, organizationId],
  );
  return result.rowCount || 0;
}

export async function approvePesticideApplication(id: string, agronomistId: string): Promise<any> {
  const result = await dbPool.query(
    `UPDATE pesticide_applications
     SET approval_status = 'approved', authorized_by = $1, approved_at = NOW(), updated_at = NOW()
     WHERE id = $2 RETURNING *`,
    [agronomistId, id]
  );

  const app = result.rows[0];
  if (app) {
    // Schedule PHI notifications
    await schedulePHINotifications(app);
    checkAndNotifyFieldHarvestConflicts(app.field_id).catch(() => {});
  }

  return app;
}

export async function rejectPesticideApplication(id: string, agronomistId: string, reason: string): Promise<any> {
  const result = await dbPool.query(
    `UPDATE pesticide_applications
     SET approval_status = 'rejected', authorized_by = $1, rejection_reason = $2, updated_at = NOW()
     WHERE id = $3 RETURNING *`,
    [agronomistId, reason, id]
  );
  return result.rows[0];
}

// ─── PHI Notification Scheduling ─────────────────────────────────

export async function schedulePHINotifications(application: any): Promise<void> {
  try {
    const fieldResult = await dbPool.query('SELECT name FROM fields WHERE id = $1', [application.field_id]);
    const fieldName = fieldResult.rows[0]?.name || 'Unknown Field';

    const productResult = await dbPool.query('SELECT name FROM pesticide_products WHERE id = $1', [application.product_id]);
    const productName = productResult.rows[0]?.name || 'Unknown Product';

    const phiEnd = new Date(application.phi_end_date);
    const dayBefore = new Date(phiEnd);
    dayBefore.setDate(dayBefore.getDate() - 1);

    const notifyRoles = ['operation_manager', 'farm_manager', 'ceo'];
    const rolePlaceholders = notifyRoles.map((_, i) => `$${i + 1}`).join(',');
    const usersResult = await dbPool.query(
      `SELECT id FROM users WHERE role IN (${rolePlaceholders}) AND is_active = true`,
      notifyRoles
    );

    // Create alert events for PHI
    // Day before PHI ends
    const dayBeforeAlert = await dbPool.query(
      `INSERT INTO alert_events (entity_type, entity_id, field_id, severity, title, message)
       VALUES ('phi_warning', $1, $2, 'warning', $3, $4) RETURNING *`,
      [
        application.id, application.field_id,
        `PHI for ${productName} on ${fieldName} ends tomorrow`,
        `Prepare for harvest: PHI restriction on ${fieldName} (${productName}) ends ${phiEnd.toLocaleDateString()}. Safe to harvest from tomorrow.`,
      ]
    );

    // Day PHI ends
    const clearAlert = await dbPool.query(
      `INSERT INTO alert_events (entity_type, entity_id, field_id, severity, title, message)
       VALUES ('phi_cleared', $1, $2, 'info', $3, $4) RETURNING *`,
      [
        application.id, application.field_id,
        `PHI cleared for ${fieldName}`,
        `PHI restriction has ended for ${fieldName}. ${productName} pre-harvest interval of ${application.phi_end_date} has passed. Safe to harvest now.`,
      ]
    );

    // Create notifications for all target users
    for (const user of usersResult.rows) {
      // Day before notification
      await dbPool.query(
        `INSERT INTO user_notifications (user_id, alert_event_id, title, message, severity)
         VALUES ($1, $2, $3, $4, 'warning')`,
        [user.id, dayBeforeAlert.rows[0].id, dayBeforeAlert.rows[0].title, dayBeforeAlert.rows[0].message]
      );

      // PHI cleared notification
      await dbPool.query(
        `INSERT INTO user_notifications (user_id, alert_event_id, title, message, severity)
         VALUES ($1, $2, $3, $4, 'info')`,
        [user.id, clearAlert.rows[0].id, clearAlert.rows[0].title, clearAlert.rows[0].message]
      );

      // Push notifications
      pushNotificationService.sendToUser(user.id, {
        title: dayBeforeAlert.rows[0].title,
        body: dayBeforeAlert.rows[0].message,
        type: 'warning',
        data: { applicationId: application.id, fieldId: application.field_id, type: 'phi_warning' },
      }).catch(() => {});
    }
  } catch (error) {
    console.error('Failed to schedule PHI notifications:', error);
  }
}

// ─── PHI Status ──────────────────────────────────────────────────

export async function getPHIStatus(organizationId: string, fieldId?: string, siteId?: string): Promise<any[]> {
  let where = `WHERE pa.approval_status = 'approved' AND pa.phi_end_date > NOW()`;
  let extraJoin = '';
  const params: any[] = [organizationId];

  where += ` AND COALESCE(pa.organization_id, f.organization_id) = $1`;

  if (siteId) {
    params.push(siteId);
    extraJoin = ' JOIN farm_areas fa ON fa.id = f.farm_area_id';
    where += ` AND fa.site_id = $${params.length}`;
  }
  if (fieldId) {
    params.push(fieldId);
    where += ` AND pa.field_id = $${params.length}`;
  }

  const result = await dbPool.query(
    `SELECT pa.*, f.name AS field_name, pp.name AS product_name, pp.phi_days,
            GREATEST(0, (pa.phi_end_date::date - CURRENT_DATE))::int AS days_remaining
     FROM pesticide_applications pa
     LEFT JOIN fields f ON f.id = pa.field_id
     ${extraJoin}
     LEFT JOIN pesticide_products pp ON pp.id = pa.product_id
     ${where}
     ORDER BY pa.phi_end_date ASC`,
    params
  );

  return result.rows;
}

// ─── Crop-Specific PHI Management ─────────────────────────────────

export async function listSiteProductCropPhi(siteId: string): Promise<any[]> {
  const result = await dbPool.query(
    `SELECT spc.*, pp.name AS product_name, pp.phi_days AS default_phi_days, pp.active_ingredient
     FROM site_product_crop_phi spc
     JOIN pesticide_products pp ON pp.id = spc.product_id
     WHERE spc.site_id = $1
     ORDER BY pp.name, spc.crop_name`,
    [siteId]
  );
  return result.rows;
}

export async function upsertSiteProductCropPhi(siteId: string, productId: string, cropName: string, phiDays: number, userId: string): Promise<any> {
  const result = await dbPool.query(
    `INSERT INTO site_product_crop_phi (site_id, product_id, crop_name, phi_days, created_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (site_id, product_id, crop_name)
     DO UPDATE SET phi_days = EXCLUDED.phi_days
     RETURNING *`,
    [siteId, productId, cropName, phiDays, userId]
  );
  return result.rows[0];
}

/** Delete a crop-specific PHI row, only when its site belongs to `organizationId`. */
export async function deleteSiteProductCropPhi(id: string, organizationId: string): Promise<void> {
  const result = await dbPool.query(
    `DELETE FROM site_product_crop_phi spc
     USING sites s
     WHERE spc.id = $1 AND s.id = spc.site_id AND s.organization_id = $2`,
    [id, organizationId],
  );
  if (!result.rowCount) throw new NotFoundError('Crop PHI entry not found');
}

export async function bulkCopySiteProductCropPhi(siteId: string, entries: Array<{ productId: string; cropName: string; phiDays: number }>, userId: string): Promise<number> {
  let copied = 0;
  for (const entry of entries) {
    await dbPool.query(
      `INSERT INTO site_product_crop_phi (site_id, product_id, crop_name, phi_days, created_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (site_id, product_id, crop_name) DO NOTHING`,
      [siteId, entry.productId, entry.cropName, entry.phiDays, userId]
    );
    copied++;
  }
  return copied;
}

export async function getOtherSitesCropPhi(productId: string, excludeSiteId: string, organizationId: string): Promise<any[]> {
  const result = await dbPool.query(
    `SELECT spc.*, s.name AS site_name
     FROM site_product_crop_phi spc
     JOIN sites s ON s.id = spc.site_id
     WHERE spc.product_id = $1 AND spc.site_id != $2 AND s.organization_id = $3
     ORDER BY s.name, spc.crop_name`,
    [productId, excludeSiteId, organizationId]
  );
  return result.rows;
}

// ─── Bio Control Products ────────────────────────────────────────

export async function listBioProducts(activeOnly = true): Promise<any[]> {
  const where = activeOnly ? 'WHERE is_active = true' : '';
  const result = await dbPool.query(`SELECT * FROM bio_control_products ${where} ORDER BY name`);
  return result.rows;
}

export async function createBioProduct(data: any): Promise<any> {
  const result = await dbPool.query(
    `INSERT INTO bio_control_products (name, agent_type, form_type, target_pests, application_rate_guide, organization_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [data.name, data.agentType, data.formType, JSON.stringify(data.targetPests || []),
     data.applicationRateGuide, data.organizationId, data.createdBy]
  );
  return result.rows[0];
}

export async function updateBioProduct(id: string, data: any): Promise<any> {
  const sets: string[] = [];
  const params: any[] = [];

  if (data.name !== undefined) { params.push(data.name); sets.push(`name = $${params.length}`); }
  if (data.agentType !== undefined) { params.push(data.agentType); sets.push(`agent_type = $${params.length}`); }
  if (data.formType !== undefined) { params.push(data.formType); sets.push(`form_type = $${params.length}`); }
  if (data.targetPests !== undefined) { params.push(JSON.stringify(data.targetPests)); sets.push(`target_pests = $${params.length}`); }
  if (data.applicationRateGuide !== undefined) { params.push(data.applicationRateGuide); sets.push(`application_rate_guide = $${params.length}`); }
  if (data.isActive !== undefined) { params.push(data.isActive); sets.push(`is_active = $${params.length}`); }

  sets.push('updated_at = NOW()');
  params.push(id);

  const result = await dbPool.query(
    `UPDATE bio_control_products SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  );
  return result.rows[0];
}

// ─── Bio Control Releases ────────────────────────────────────────

export async function listBioReleases(opts: {
  fieldId?: string;
  productId?: string;
  startDate?: string;
  endDate?: string;
  siteId?: string;
  organizationId: string;
  page?: number;
  limit?: number;
}): Promise<{ items: any[]; meta: any }> {
  const page = opts.page || 1;
  const limit = Math.min(opts.limit || 20, 100);
  const offset = (page - 1) * limit;
  let where = 'WHERE 1=1';
  let extraJoin = '';
  const params: any[] = [];

  params.push(opts.organizationId);
  where += ` AND COALESCE(br.organization_id, f.organization_id) = $${params.length}`;

  if (opts.siteId) {
    params.push(opts.siteId);
    extraJoin = ' JOIN farm_areas fa ON fa.id = f.farm_area_id';
    where += ` AND fa.site_id = $${params.length}`;
  }
  if (opts.fieldId) { params.push(opts.fieldId); where += ` AND br.field_id = $${params.length}`; }
  if (opts.productId) { params.push(opts.productId); where += ` AND br.product_id = $${params.length}`; }
  if (opts.startDate) { params.push(opts.startDate); where += ` AND br.release_date >= $${params.length}`; }
  if (opts.endDate) { params.push(opts.endDate); where += ` AND br.release_date <= $${params.length}`; }

  const countResult = await dbPool.query(
    `SELECT COUNT(*) FROM bio_control_releases br LEFT JOIN fields f ON f.id = br.field_id${extraJoin} ${where}`,
    params
  );
  const total = parseInt(countResult.rows[0].count, 10);

  params.push(limit);
  const lIdx = params.length;
  params.push(offset);
  const oIdx = params.length;

  const result = await dbPool.query(
    `SELECT br.*, f.name AS field_name, bp.name AS product_name, bp.agent_type, bp.form_type AS product_form_type,
            u.name AS created_by_name
     FROM bio_control_releases br
     LEFT JOIN fields f ON f.id = br.field_id
     ${extraJoin}
     LEFT JOIN bio_control_products bp ON bp.id = br.product_id
     LEFT JOIN users u ON u.id = br.created_by
     ${where}
     ORDER BY br.release_date DESC
     LIMIT $${lIdx} OFFSET $${oIdx}`,
    params
  );

  return { items: result.rows, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
}

export async function createBioRelease(data: any, createdBy: string): Promise<any> {
  const result = await dbPool.query(
    `INSERT INTO bio_control_releases (field_id, product_id, release_date, quantity, form_type, target_pest, pre_release_pest_pct, notes, organization_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [data.fieldId, data.productId, data.releaseDate || new Date().toISOString().split('T')[0],
     data.quantity, data.formType, data.targetPest, data.preReleasePestPct,
     data.notes, data.organizationId, createdBy]
  );

  const release = result.rows[0];

  // Auto-create cost entry if cost is provided
  if (data.cost && Number(data.cost) > 0) {
    // Get product name for description
    const prodResult = await dbPool.query('SELECT name FROM bio_control_products WHERE id = $1', [data.productId]);
    const prodName = prodResult.rows[0]?.name || 'Bio agent';

    await dbPool.query(
      `INSERT INTO cost_entries (field_id, category, amount, currency, description, date, created_by, ipm_application_id)
       VALUES ($1, 'biological', $2, $3, $4, $5, $6, $7)`,
      [
        data.fieldId, data.cost, data.currency || 'AED',
        `Biological: ${prodName} x${data.quantity} (${data.formType || 'unit'})`,
        data.releaseDate || new Date().toISOString().split('T')[0], createdBy, release.id,
      ]
    );

    // Auto-deduct from inventory (best-effort)
    deductByName(prodName, 'biological', Number(data.quantity), 'bio_release', release.id, createdBy)
      .catch((err) => logger.warn({ err, prodName }, 'Inventory deduction failed for bio release'));
  } else {
    // Still try to deduct even if no cost — get product name
    const prodResult = await dbPool.query('SELECT name FROM bio_control_products WHERE id = $1', [data.productId]);
    const prodName = prodResult.rows[0]?.name || 'Bio agent';
    deductByName(prodName, 'biological', Number(data.quantity), 'bio_release', release.id, createdBy)
      .catch((err) => logger.warn({ err, prodName }, 'Inventory deduction failed for bio release'));
  }

  return release;
}

export async function getBioReleaseEffectiveness(releaseId: string): Promise<any> {
  // Get the release details
  const releaseResult = await dbPool.query(
    `SELECT br.*, bp.name AS product_name FROM bio_control_releases br
     LEFT JOIN bio_control_products bp ON bp.id = br.product_id
     WHERE br.id = $1`,
    [releaseId]
  );
  const release = releaseResult.rows[0];
  if (!release) return null;

  // Get scouting reports for this field after the release date
  const scoutingResult = await dbPool.query(
    `SELECT report_date, infestation_pct, severity
     FROM scouting_reports
     WHERE field_id = $1 AND report_date >= $2
     ORDER BY report_date ASC`,
    [release.field_id, release.release_date]
  );

  const preReleasePct = release.pre_release_pest_pct || 0;
  const postReadings = scoutingResult.rows;

  // Calculate days to first reduction and final reduction
  let daysToReduce = null;
  let finalPct = preReleasePct;

  for (const reading of postReadings) {
    if (reading.infestation_pct < preReleasePct && daysToReduce === null) {
      const releaseDate = new Date(release.release_date);
      const readingDate = new Date(reading.report_date);
      daysToReduce = Math.ceil((readingDate.getTime() - releaseDate.getTime()) / (1000 * 60 * 60 * 24));
    }
    finalPct = reading.infestation_pct;
  }

  return {
    release,
    preReleasePct,
    postReadings,
    daysToReduce,
    finalPct,
    percentageReduction: preReleasePct - finalPct,
    totalReadings: postReadings.length,
  };
}

// ─── Bumble Bee Deployments ──────────────────────────────────────
//
// Every bumble-bee write has an `apply*` form that runs on a caller's
// transaction client. The pest agronomist's live writes wrap it in their own
// transaction; approving a scouter's change request runs the same function on
// the review transaction, so the change request and the stock move commit (or
// roll back) together.

/** A pool or a transaction client: anything that can run a query. */
export type BumbleBeeDb = {
  query: (text: string, params?: any[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
};

async function inTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function resolveFieldSiteAndOrg(
  fieldId: string,
  db: BumbleBeeDb = dbPool,
): Promise<{ siteId: string; organizationId: string; fieldName: string | null }> {
  const result = await db.query(
    `SELECT fa.site_id, f.organization_id, f.name AS field_name
     FROM fields f
     JOIN farm_areas fa ON fa.id = f.farm_area_id
     WHERE f.id = $1`,
    [fieldId],
  );
  const row = result.rows[0];
  if (!row?.site_id) {
    throw new AppError('Field not found or has no site', 'VALIDATION_ERROR', 400);
  }
  return { siteId: row.site_id, organizationId: row.organization_id, fieldName: row.field_name ?? null };
}

async function getOrCreateSiteInventory(siteId: string, organizationId: string, db: BumbleBeeDb = dbPool) {
  const existing = await db.query(
    'SELECT * FROM bumble_bee_site_inventory WHERE site_id = $1',
    [siteId],
  );
  if (existing.rows[0]) return existing.rows[0];
  const inserted = await db.query(
    `INSERT INTO bumble_bee_site_inventory (site_id, organization_id, quantity_on_hand)
     VALUES ($1, $2, 0)
     ON CONFLICT (site_id) DO NOTHING
     RETURNING *`,
    [siteId, organizationId],
  );
  if (inserted.rows[0]) return inserted.rows[0];
  const again = await db.query('SELECT * FROM bumble_bee_site_inventory WHERE site_id = $1', [siteId]);
  return again.rows[0];
}

export async function getBumbleBeeLastForField(fieldId: string, db: BumbleBeeDb = dbPool): Promise<any | null> {
  const result = await db.query(
    `SELECT bb.*
     FROM bumble_bee_deployments bb
     WHERE bb.field_id = $1
     ORDER BY bb.date_placed DESC, bb.created_at DESC
     LIMIT 1`,
    [fieldId],
  );
  return result.rows[0] || null;
}

export async function listBumbleBeeDeployments(opts: {
  fieldId?: string;
  activeOnly?: boolean;
  siteId?: string;
  organizationId: string;
  page?: number;
  limit?: number;
}): Promise<{ items: any[]; meta: any }> {
  const page = opts.page || 1;
  const limit = Math.min(opts.limit || 100, 500);
  const offset = (page - 1) * limit;
  let where = 'WHERE 1=1';
  let extraJoin = '';
  const params: any[] = [];

  params.push(opts.organizationId);
  where += ` AND COALESCE(bb.organization_id, f.organization_id) = $${params.length}`;

  if (opts.siteId) {
    params.push(opts.siteId);
    extraJoin = ' JOIN farm_areas fa ON fa.id = f.farm_area_id';
    where += ` AND fa.site_id = $${params.length}`;
  }
  if (opts.fieldId) { params.push(opts.fieldId); where += ` AND bb.field_id = $${params.length}`; }
  if (opts.activeOnly) { where += ' AND bb.date_removed IS NULL'; }

  const countResult = await dbPool.query(
    `SELECT COUNT(*) FROM bumble_bee_deployments bb LEFT JOIN fields f ON f.id = bb.field_id${extraJoin} ${where}`,
    params,
  );
  const total = parseInt(countResult.rows[0].count, 10);

  params.push(limit);
  const lIdx = params.length;
  params.push(offset);
  const oIdx = params.length;

  const result = await dbPool.query(
    `SELECT bb.*, f.name AS field_name,
            COALESCE(bb.box_count_total, bb.box_count, 0) AS display_box_total,
            (SELECT (bb.date_placed - prev.date_placed)
             FROM bumble_bee_deployments prev
             WHERE prev.field_id = bb.field_id
               AND (prev.date_placed < bb.date_placed
                    OR (prev.date_placed = bb.date_placed AND prev.created_at < bb.created_at))
             ORDER BY prev.date_placed DESC, prev.created_at DESC
             LIMIT 1) AS days_since_last,
            u.name AS created_by_name
     FROM bumble_bee_deployments bb
     LEFT JOIN fields f ON f.id = bb.field_id
     ${extraJoin}
     LEFT JOIN users u ON u.id = bb.created_by
     ${where}
     ORDER BY bb.date_placed DESC, bb.created_at DESC
     LIMIT $${lIdx} OFFSET $${oIdx}`,
    params,
  );

  return { items: result.rows, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
}

/** Deployment numbers as the page sends them (legacy boxCount = boxes added). */
export function parseBumbleBeeDeploymentNumbers(data: any) {
  const boxesRemoved = Math.max(0, Number(data.boxesRemoved) || 0);
  const boxesAdded = Math.max(0, Number(data.boxesAdded) || 0);
  const legacyBoxCount = data.boxCount != null ? Number(data.boxCount) : null;
  const added = legacyBoxCount != null && data.boxesAdded == null ? legacyBoxCount : boxesAdded;
  const rawBefore = data.boxesBefore != null && data.boxesBefore !== '' ? Number(data.boxesBefore) : null;
  const boxesBefore = rawBefore == null || Number.isNaN(rawBefore) ? null : rawBefore;
  return { boxesRemoved, added, boxesBefore };
}

export type BumbleBeeApplyOptions = {
  /** HTTP status for "not enough boxes" and similar stock failures (409 at approval time). */
  stockConflictStatus?: number;
  /**
   * Approval only: the field's latest deployment when the scouter proposed this
   * one. If another deployment landed since, the proposed "before" count is stale.
   */
  expectedLastDeploymentId?: string | null;
  /** Approval only: the organization the change request belongs to. */
  organizationId?: string;
};

function stockError(message: string, opts?: BumbleBeeApplyOptions): AppError {
  const status = opts?.stockConflictStatus ?? 400;
  return new AppError(message, status === 409 ? 'CONFLICT' : 'VALIDATION_ERROR', status);
}

/** Insert a deployment and take its added boxes out of the site's stock, on `client`'s transaction. */
export async function applyBumbleBeeDeploymentCreate(
  client: BumbleBeeDb,
  data: any,
  createdBy: string,
  opts?: BumbleBeeApplyOptions,
): Promise<any> {
  const { boxesRemoved, added, boxesBefore: proposedBefore } = parseBumbleBeeDeploymentNumbers(data);
  if (!data.fieldId || !data.datePlaced) {
    throw new AppError('fieldId and datePlaced are required', 'VALIDATION_ERROR', 400);
  }

  const { siteId, organizationId: fieldOrgId } = await resolveFieldSiteAndOrg(data.fieldId, client);
  if (opts?.organizationId && fieldOrgId && fieldOrgId !== opts.organizationId) {
    throw new NotFoundError('Field not found');
  }
  const orgId = data.organizationId || fieldOrgId;

  const last = await getBumbleBeeLastForField(data.fieldId, client);
  if (opts?.expectedLastDeploymentId !== undefined && (last?.id ?? null) !== (opts.expectedLastDeploymentId ?? null)) {
    throw new AppError(
      'Another deployment was logged on this field after this one was proposed, so its "before visit" count is out of date. Reject it and ask the scouter to resubmit.',
      'CONFLICT',
      409,
    );
  }
  const boxesBefore = proposedBefore ?? (last ? Number(last.box_count_total ?? last.box_count ?? 0) : 0);

  const boxCountTotal = boxesBefore - boxesRemoved + added;
  if (boxCountTotal < 0) {
    throw new AppError('Total boxes on field cannot be negative', 'VALIDATION_ERROR', 400);
  }

  await getOrCreateSiteInventory(siteId, orgId, client);

  const invLock = await client.query(
    'SELECT quantity_on_hand FROM bumble_bee_site_inventory WHERE site_id = $1 FOR UPDATE',
    [siteId],
  );
  const onHand = Number(invLock.rows[0]?.quantity_on_hand) || 0;
  if (added > onHand) {
    throw stockError(`Not enough boxes in stock (${onHand} on hand, ${added} requested)`, opts);
  }

  const insertResult = await client.query(
    `INSERT INTO bumble_bee_deployments (
       field_id, date_placed, box_count, boxes_before, boxes_removed, boxes_added,
       box_count_total, notes, organization_id, created_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      data.fieldId,
      data.datePlaced,
      boxCountTotal,
      boxesBefore,
      boxesRemoved,
      added,
      boxCountTotal,
      data.notes || null,
      orgId,
      createdBy,
    ],
  );
  const deployment = insertResult.rows[0];

  let quantityAfter = onHand;
  if (added > 0) {
    const upd = await client.query(
      `UPDATE bumble_bee_site_inventory
       SET quantity_on_hand = quantity_on_hand - $1, updated_at = NOW(), updated_by = $2
       WHERE site_id = $3
       RETURNING quantity_on_hand`,
      [added, createdBy, siteId],
    );
    quantityAfter = upd.rows[0].quantity_on_hand;
    await client.query(
      `INSERT INTO bumble_bee_inventory_adjustments
       (site_id, organization_id, delta, reason, reference_id, quantity_after, created_by)
       VALUES ($1, $2, $3, 'deploy', $4, $5, $6)`,
      [siteId, orgId, -added, deployment.id, quantityAfter, createdBy],
    );
  }

  return { ...deployment, inventory_on_hand_after: quantityAfter };
}

export async function createBumbleBeeDeployment(data: any, createdBy: string): Promise<any> {
  return inTransaction((client) => applyBumbleBeeDeploymentCreate(client, data, createdBy));
}

/** One deployment in the organization (legacy rows fall back to the field's organization). */
export async function getBumbleBeeDeployment(
  id: string,
  organizationId: string,
  db: BumbleBeeDb = dbPool,
  forUpdate = false,
): Promise<any> {
  const result = await db.query(
    `SELECT bb.*, f.name AS field_name, fa.site_id
     FROM bumble_bee_deployments bb
     LEFT JOIN fields f ON f.id = bb.field_id
     LEFT JOIN farm_areas fa ON fa.id = f.farm_area_id
     WHERE bb.id = $1 AND COALESCE(bb.organization_id, f.organization_id) = $2
     ${forUpdate ? 'FOR UPDATE OF bb' : ''}`,
    [id, organizationId],
  );
  if (!result.rows[0]) throw new NotFoundError('Deployment not found');
  return result.rows[0];
}

export async function updateBumbleBeeDeployment(
  id: string,
  data: any,
  organizationId: string,
  db: BumbleBeeDb = dbPool,
): Promise<any> {
  await getBumbleBeeDeployment(id, organizationId, db, db !== dbPool);

  const sets: string[] = [];
  const params: any[] = [];

  if (data.boxCount !== undefined) { params.push(data.boxCount); sets.push(`box_count = $${params.length}`); }
  if (data.dateRemoved !== undefined) { params.push(data.dateRemoved || null); sets.push(`date_removed = $${params.length}`); }
  if (data.notes !== undefined) { params.push(data.notes || null); sets.push(`notes = $${params.length}`); }

  sets.push('updated_at = NOW()');
  params.push(id);

  const result = await db.query(
    `UPDATE bumble_bee_deployments SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params,
  );
  return result.rows[0];
}

export async function getBumbleBeeInventory(siteId: string, organizationId: string) {
  const inv = await getOrCreateSiteInventory(siteId, organizationId);
  const incoming = await dbPool.query(
    `SELECT * FROM bumble_bee_incoming_orders
     WHERE site_id = $1 AND organization_id = $2 AND status = 'pending'
     ORDER BY expected_delivery_date ASC`,
    [siteId, organizationId],
  );
  const pendingQty = incoming.rows.reduce((s, r) => s + Number(r.quantity_expected), 0);
  return {
    quantityOnHand: Number(inv.quantity_on_hand) || 0,
    incoming: incoming.rows,
    pendingIncomingTotal: pendingQty,
    projectedTotal: (Number(inv.quantity_on_hand) || 0) + pendingQty,
  };
}

/** Current boxes on hand at a site (0 when the site has no inventory row yet). */
export async function getBumbleBeeOnHand(siteId: string, db: BumbleBeeDb = dbPool): Promise<number> {
  const result = await db.query(
    'SELECT quantity_on_hand FROM bumble_bee_site_inventory WHERE site_id = $1',
    [siteId],
  );
  return Number(result.rows[0]?.quantity_on_hand) || 0;
}

function assertValidOnHand(quantityOnHand: number) {
  if (!Number.isFinite(quantityOnHand) || !Number.isInteger(quantityOnHand) || quantityOnHand < 0) {
    throw new AppError('Quantity on hand must be a whole number of 0 or more', 'VALIDATION_ERROR', 400);
  }
}

/**
 * Set the site's boxes on hand on `client`'s transaction and log the real change
 * in the ledger. `expectedCurrent` (approval) refuses the count if stock moved
 * since it was proposed, so a stale count never overwrites deliveries or deployments.
 */
export async function applyBumbleBeeInventorySet(
  client: BumbleBeeDb,
  siteId: string,
  organizationId: string,
  quantityOnHand: number,
  userId: string,
  opts?: { expectedCurrent?: number },
) {
  assertValidOnHand(quantityOnHand);
  await getOrCreateSiteInventory(siteId, organizationId, client);
  const current = await client.query(
    'SELECT quantity_on_hand FROM bumble_bee_site_inventory WHERE site_id = $1 FOR UPDATE',
    [siteId],
  );
  const before = Number(current.rows[0]?.quantity_on_hand) || 0;
  if (opts?.expectedCurrent !== undefined && before !== Number(opts.expectedCurrent)) {
    throw new AppError(
      `Boxes on hand changed from ${opts.expectedCurrent} to ${before} since this count was proposed. Reject it and ask for a new count.`,
      'CONFLICT',
      409,
    );
  }
  const result = await client.query(
    `UPDATE bumble_bee_site_inventory
     SET quantity_on_hand = $1, updated_at = NOW(), updated_by = $2
     WHERE site_id = $3
     RETURNING *`,
    [quantityOnHand, userId, siteId],
  );
  const row = result.rows[0];
  await client.query(
    `INSERT INTO bumble_bee_inventory_adjustments
     (site_id, organization_id, delta, reason, quantity_after, created_by)
     VALUES ($1, $2, $3, 'manual_set', $4, $5)`,
    [siteId, organizationId, quantityOnHand - before, quantityOnHand, userId],
  );
  return row;
}

export async function setBumbleBeeInventory(
  siteId: string,
  organizationId: string,
  quantityOnHand: number,
  userId: string,
) {
  return inTransaction((client) => applyBumbleBeeInventorySet(client, siteId, organizationId, quantityOnHand, userId));
}

export async function listBumbleBeeIncomingOrders(siteId: string, organizationId: string) {
  const result = await dbPool.query(
    `SELECT * FROM bumble_bee_incoming_orders
     WHERE site_id = $1 AND organization_id = $2
     ORDER BY expected_delivery_date ASC, created_at DESC`,
    [siteId, organizationId],
  );
  return result.rows;
}

/** The page sends expectedDeliveryDate; older callers sent expectedDate. */
export function orderExpectedDate(data: any): string | null {
  const value = data?.expectedDeliveryDate ?? data?.expectedDate;
  return value ? String(value) : null;
}

export function validateBumbleBeeOrderCreate(data: any): void {
  const qty = Number(data?.quantityExpected);
  if (!Number.isInteger(qty) || qty < 1) {
    throw new AppError('Boxes ordered must be a whole number of 1 or more', 'VALIDATION_ERROR', 400);
  }
  if (!orderExpectedDate(data)) {
    throw new AppError('Expected delivery date is required', 'VALIDATION_ERROR', 400);
  }
  if (!data?.siteId) {
    throw new AppError('siteId is required', 'VALIDATION_ERROR', 400);
  }
}

export async function createBumbleBeeIncomingOrder(data: any, createdBy: string, db: BumbleBeeDb = dbPool) {
  validateBumbleBeeOrderCreate(data);
  const orderDate = data.orderDate || new Date().toISOString().split('T')[0];
  const result = await db.query(
    `INSERT INTO bumble_bee_incoming_orders
     (site_id, organization_id, quantity_expected, expected_delivery_date, order_date, notes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      data.siteId,
      data.organizationId,
      Number(data.quantityExpected),
      orderExpectedDate(data),
      orderDate,
      data.notes || null,
      createdBy,
    ],
  );
  return result.rows[0];
}

export async function getBumbleBeeIncomingOrder(
  id: string,
  organizationId: string,
  db: BumbleBeeDb = dbPool,
  forUpdate = false,
) {
  const result = await db.query(
    `SELECT * FROM bumble_bee_incoming_orders WHERE id = $1 AND organization_id = $2${forUpdate ? ' FOR UPDATE' : ''}`,
    [id, organizationId],
  );
  if (!result.rows[0]) throw new NotFoundError('Order not found');
  return result.rows[0];
}

function assertOrderStillOpen(order: any) {
  if (order.status !== 'pending') {
    throw new AppError(
      `This order is already ${order.status}; it can no longer be changed.`,
      'CONFLICT',
      409,
    );
  }
}

/** Column updates for an order edit; `status` may only cancel it. */
function orderUpdateSets(data: any) {
  const sets: string[] = [];
  const params: any[] = [];
  if (data.quantityExpected !== undefined) {
    const qty = Number(data.quantityExpected);
    if (!Number.isInteger(qty) || qty < 1) {
      throw new AppError('Boxes ordered must be a whole number of 1 or more', 'VALIDATION_ERROR', 400);
    }
    params.push(qty);
    sets.push(`quantity_expected = $${params.length}`);
  }
  const expected = data.expectedDeliveryDate !== undefined ? data.expectedDeliveryDate : data.expectedDate;
  if (expected !== undefined) {
    if (!expected) throw new AppError('Expected delivery date is required', 'VALIDATION_ERROR', 400);
    params.push(expected);
    sets.push(`expected_delivery_date = $${params.length}`);
  }
  if (data.notes !== undefined) {
    params.push(data.notes || null);
    sets.push(`notes = $${params.length}`);
  }
  if (data.orderDate !== undefined && data.orderDate) {
    params.push(data.orderDate);
    sets.push(`order_date = $${params.length}`);
  }
  if (data.status !== undefined) {
    if (data.status !== 'cancelled') {
      throw new AppError('An order can only be cancelled here; receive it to mark it received', 'VALIDATION_ERROR', 400);
    }
    params.push(data.status);
    sets.push(`status = $${params.length}`);
  }
  return { sets, params };
}

/** Edit or cancel an order that has not been received yet. */
export async function updateBumbleBeeIncomingOrder(
  id: string,
  data: any,
  organizationId: string,
  db: BumbleBeeDb = dbPool,
) {
  const order = await getBumbleBeeIncomingOrder(id, organizationId, db, db !== dbPool);
  assertOrderStillOpen(order);
  const { sets, params } = orderUpdateSets(data);
  if (sets.length === 0) return order;
  params.push(id, organizationId);
  const result = await db.query(
    `UPDATE bumble_bee_incoming_orders SET ${sets.join(', ')}
     WHERE id = $${params.length - 1} AND organization_id = $${params.length} AND status = 'pending'
     RETURNING *`,
    params,
  );
  if (!result.rows[0]) {
    throw new AppError('This order was received or cancelled in the meantime', 'CONFLICT', 409);
  }
  return result.rows[0];
}

export type BumbleBeeReceiveInput = {
  receivedDate?: string;
  quantityReceived?: number;
  /** Corrections to the order made in the same step (boxes ordered, dates). */
  quantityExpected?: number;
  orderDate?: string;
  expectedDeliveryDate?: string;
};

/** Receive a pending order into the site's stock on `client`'s transaction. */
export async function applyBumbleBeeOrderReceive(
  client: BumbleBeeDb,
  id: string,
  organizationId: string,
  userId: string,
  input?: BumbleBeeReceiveInput,
) {
  const order = await getBumbleBeeIncomingOrder(id, organizationId, client, true);
  assertOrderStillOpen(order);

  const edits: Record<string, unknown> = {};
  if (input?.quantityExpected != null && Number(input.quantityExpected) !== Number(order.quantity_expected)) {
    edits.quantityExpected = input.quantityExpected;
  }
  if (input?.orderDate) edits.orderDate = input.orderDate;
  if (input?.expectedDeliveryDate) edits.expectedDeliveryDate = input.expectedDeliveryDate;
  if (Object.keys(edits).length > 0) {
    const { sets, params } = orderUpdateSets(edits);
    params.push(id);
    await client.query(
      `UPDATE bumble_bee_incoming_orders SET ${sets.join(', ')} WHERE id = $${params.length}`,
      params,
    );
  }

  const expectedQty = edits.quantityExpected != null ? Number(edits.quantityExpected) : Number(order.quantity_expected);
  const qtyReceived = input?.quantityReceived != null ? Number(input.quantityReceived) : expectedQty;
  if (!Number.isInteger(qtyReceived) || qtyReceived <= 0) {
    throw new AppError('Boxes received must be a whole number of 1 or more', 'VALIDATION_ERROR', 400);
  }

  const receivedDate = input?.receivedDate || new Date().toISOString().split('T')[0];

  await getOrCreateSiteInventory(order.site_id, order.organization_id, client);
  const beforeRes = await client.query(
    'SELECT quantity_on_hand FROM bumble_bee_site_inventory WHERE site_id = $1 FOR UPDATE',
    [order.site_id],
  );
  const quantityBefore = Number(beforeRes.rows[0]?.quantity_on_hand) || 0;

  const upd = await client.query(
    `UPDATE bumble_bee_site_inventory
     SET quantity_on_hand = quantity_on_hand + $1, updated_at = NOW(), updated_by = $2
     WHERE site_id = $3
     RETURNING quantity_on_hand`,
    [qtyReceived, userId, order.site_id],
  );
  const quantityAfter = upd.rows[0].quantity_on_hand;

  await client.query(
    `UPDATE bumble_bee_incoming_orders
     SET status = 'received',
         received_at = $2::date,
         quantity_received = $3,
         quantity_on_hand_before = $4,
         quantity_on_hand_after = $5
     WHERE id = $1`,
    [id, receivedDate, qtyReceived, quantityBefore, quantityAfter],
  );

  await client.query(
    `INSERT INTO bumble_bee_inventory_adjustments
     (site_id, organization_id, delta, reason, reference_id, quantity_after, created_by)
     VALUES ($1, $2, $3, 'order_received', $4, $5, $6)`,
    [order.site_id, order.organization_id, qtyReceived, id, quantityAfter, userId],
  );

  return { quantityOnHand: quantityAfter, quantityBefore, quantityReceived: qtyReceived };
}

export async function receiveBumbleBeeIncomingOrder(
  id: string,
  userId: string,
  input: BumbleBeeReceiveInput | undefined,
  organizationId: string,
) {
  return inTransaction((client) => applyBumbleBeeOrderReceive(client, id, organizationId, userId, input));
}

export async function listBumbleBeeInspections(opts: {
  siteId: string;
  organizationId: string;
  limit?: number;
}): Promise<any[]> {
  const limit = Math.min(opts.limit || 500, 500);
  const params: any[] = [opts.organizationId, opts.siteId, limit];
  const result = await dbPool.query(
    `SELECT bi.*, f.name AS field_name, u.name AS created_by_name,
            (SELECT COALESCE(bb.box_count_total, bb.box_count)
             FROM bumble_bee_deployments bb
             WHERE bb.field_id = bi.field_id
             ORDER BY bb.date_placed DESC, bb.created_at DESC
             LIMIT 1) AS deploy_total
     FROM bumble_bee_box_inspections bi
     JOIN fields f ON f.id = bi.field_id
     JOIN farm_areas fa ON fa.id = f.farm_area_id
     LEFT JOIN users u ON u.id = bi.created_by
     WHERE bi.organization_id = $1 AND fa.site_id = $2
     ORDER BY bi.inspection_date DESC, bi.created_at DESC
     LIMIT $3`,
    params,
  );
  return result.rows;
}

async function getBumbleBeeInspectionRow(id: string, db: BumbleBeeDb = dbPool, organizationId?: string) {
  const result = organizationId
    ? await db.query('SELECT * FROM bumble_bee_box_inspections WHERE id = $1 AND organization_id = $2', [id, organizationId])
    : await db.query('SELECT * FROM bumble_bee_box_inspections WHERE id = $1', [id]);
  if (result.rows.length === 0) {
    throw new NotFoundError('Inspection not found');
  }
  return result.rows[0];
}

async function validateBumbleBeeInspectionPayload(
  fieldId: string,
  data: {
    boxes100: number; boxes80: number; boxes60: number; boxes40: number; boxes20: number; boxes0: number;
  },
  opts?: BumbleBeeInspectionUpdateOptions,
  db: BumbleBeeDb = dbPool,
) {
  const totalBoxes = data.boxes100 + data.boxes80 + data.boxes60 + data.boxes40 + data.boxes20 + data.boxes0;
  if (totalBoxes < 1) {
    throw new AppError('Inspection must count at least one box', 'VALIDATION_ERROR', 400);
  }
  if (opts?.skipDeployTotalCheck) {
    return totalBoxes;
  }
  const last = await getBumbleBeeLastForField(fieldId, db);
  if (!last) {
    throw new AppError(
      'No deployment on this field — log a deployment total before saving an inspection',
      'VALIDATION_ERROR',
      400,
    );
  }
  const deployTotal = Number(last.box_count_total ?? last.box_count);
  if (totalBoxes !== deployTotal) {
    throw new AppError(
      `Inspection total ${totalBoxes} does not match last deployment on field (${deployTotal}). Update the deployment on the Bumble Bees tab first, or submit a change request if the field count differs.`,
      'VALIDATION_ERROR',
      400,
    );
  }
  return totalBoxes;
}

export async function validateBumbleBeeInspectionProposedPayload(
  fieldId: string,
  proposed: Record<string, unknown>,
): Promise<void> {
  const buckets = parseInspectionBucketData(proposed);
  await validateBumbleBeeInspectionPayload(fieldId, buckets);
}

function parseInspectionBucketData(data: any) {
  return {
    boxes100: Math.max(0, Number(data.boxes100) || 0),
    boxes80: Math.max(0, Number(data.boxes80) || 0),
    boxes60: Math.max(0, Number(data.boxes60) || 0),
    boxes40: Math.max(0, Number(data.boxes40) || 0),
    boxes20: Math.max(0, Number(data.boxes20) || 0),
    boxes0: Math.max(0, Number(data.boxes0) || 0),
  };
}

/** One inspection; pass `organizationId` to treat another organization's row as not found. */
export async function getBumbleBeeBoxInspection(id: string, organizationId?: string) {
  const row = await getBumbleBeeInspectionRow(id, dbPool, organizationId);
  const fieldName = await dbPool.query('SELECT name FROM fields WHERE id = $1', [row.field_id]);
  return { ...row, field_name: fieldName.rows[0]?.name };
}

export async function updateBumbleBeeBoxInspection(
  id: string,
  data: any,
  opts?: BumbleBeeInspectionUpdateOptions,
  db: BumbleBeeDb = dbPool,
): Promise<any> {
  const existing = await getBumbleBeeInspectionRow(id, db);
  const buckets = parseInspectionBucketData(data);
  const inspectionDate = data.inspectionDate || existing.inspection_date;
  if (!inspectionDate) {
    throw new AppError('inspectionDate is required', 'VALIDATION_ERROR', 400);
  }
  const totalBoxes = await validateBumbleBeeInspectionPayload(existing.field_id, buckets, opts, db);

  const result = await db.query(
    `UPDATE bumble_bee_box_inspections
     SET inspection_date = $1,
         boxes_100 = $2, boxes_80 = $3, boxes_60 = $4, boxes_40 = $5, boxes_20 = $6, boxes_0 = $7,
         total_boxes = $8, notes = $9
     WHERE id = $10
     RETURNING *`,
    [
      inspectionDate,
      buckets.boxes100,
      buckets.boxes80,
      buckets.boxes60,
      buckets.boxes40,
      buckets.boxes20,
      buckets.boxes0,
      totalBoxes,
      data.notes !== undefined ? (data.notes || null) : existing.notes,
      id,
    ],
  );
  const row = result.rows[0];
  const fieldName = await db.query('SELECT name FROM fields WHERE id = $1', [row.field_id]);
  return { ...row, field_name: fieldName.rows[0]?.name };
}

export async function deleteBumbleBeeBoxInspection(id: string, db: BumbleBeeDb = dbPool): Promise<void> {
  const result = await db.query('DELETE FROM bumble_bee_box_inspections WHERE id = $1 RETURNING id', [id]);
  if (result.rows.length === 0) {
    throw new NotFoundError('Inspection not found');
  }
}

export async function createBumbleBeeBoxInspection(data: any, createdBy: string): Promise<any> {
  const buckets = parseInspectionBucketData(data);

  if (!data.fieldId || !data.inspectionDate) {
    throw new AppError('fieldId and inspectionDate are required', 'VALIDATION_ERROR', 400);
  }
  const totalBoxes = await validateBumbleBeeInspectionPayload(data.fieldId, buckets);

  const { organizationId: fieldOrgId } = await resolveFieldSiteAndOrg(data.fieldId);
  const orgId = data.organizationId || fieldOrgId;

  const result = await dbPool.query(
    `INSERT INTO bumble_bee_box_inspections (
       field_id, organization_id, inspection_date,
       boxes_100, boxes_80, boxes_60, boxes_40, boxes_20, boxes_0,
       total_boxes, notes, created_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      data.fieldId,
      orgId,
      data.inspectionDate,
      buckets.boxes100,
      buckets.boxes80,
      buckets.boxes60,
      buckets.boxes40,
      buckets.boxes20,
      buckets.boxes0,
      totalBoxes,
      data.notes || null,
      createdBy,
    ],
  );
  const row = result.rows[0];
  const fieldName = await dbPool.query('SELECT name FROM fields WHERE id = $1', [data.fieldId]);
  return { ...row, field_name: fieldName.rows[0]?.name };
}

// ─── Field Overview Aggregates ───────────────────────────────────

export async function getFieldOverview(organizationId: string, siteId?: string, dateFrom?: string, dateTo?: string): Promise<any[]> {
  const params: any[] = [organizationId];
  let siteFilter = 'AND f.organization_id = $1';
  if (siteId) {
    params.push(siteId);
    siteFilter += ` AND f.farm_area_id IN (SELECT id FROM farm_areas WHERE site_id = $${params.length})`;
  }

  // Date range params for filtering (fallback to current date logic)
  params.push(dateTo || null);
  const dateToIdx = params.length;
  params.push(dateFrom || null);
  const dateFromIdx = params.length;

  const refDate = `COALESCE($${dateToIdx}::date, CURRENT_DATE)`;
  const rangeStart = `COALESCE($${dateFromIdx}::date, ${refDate} - INTERVAL '7 days')`;

  const result = await dbPool.query(
    `SELECT
       f.id, f.name, f.area,
       f.current_crop_id,
       ft.name AS field_type_name,
       c.name AS crop_name,
       -- PHI status (only sprays whose PHI end date is still in the future)
       (SELECT COUNT(*) FROM pesticide_applications pa
        WHERE pa.field_id = f.id AND pa.approval_status = 'approved'
          AND pa.phi_end_date >= ${refDate}
          AND pa.application_date <= ${refDate}
       ) AS active_phi_count,
       (SELECT MIN(pa.phi_end_date) FROM pesticide_applications pa
        WHERE pa.field_id = f.id AND pa.approval_status = 'approved'
          AND pa.phi_end_date >= ${refDate}
          AND pa.application_date <= ${refDate}
       ) AS nearest_phi_end,
       -- Per-segment PHI details
       (SELECT json_agg(json_build_object(
          'segment', pa.segment_id,
          'product', pp.name,
          'days', CEIL(EXTRACT(EPOCH FROM (pa.phi_end_date - ${refDate})) / 86400)
        ))
        FROM pesticide_applications pa
        LEFT JOIN pesticide_products pp ON pp.id = pa.product_id
        WHERE pa.field_id = f.id AND pa.approval_status = 'approved'
          AND pa.phi_end_date >= ${refDate}
          AND pa.application_date <= ${refDate}
       ) AS active_phi_details,
       -- Latest EC/PH within date range
       (SELECT json_build_object('ec_in', vr.ec_in, 'ec_out', vr.ec, 'ph_in', vr.ph_in, 'ph_out', vr.ph, 'date', e.date)
        FROM ecph_entries e
        LEFT JOIN ecph_valve_readings vr ON vr.ecph_entry_id = e.id
        WHERE e.field_id = f.id
          AND ($${dateFromIdx}::date IS NULL OR e.date >= $${dateFromIdx}::date)
          AND ($${dateToIdx}::date IS NULL OR e.date <= $${dateToIdx}::date)
        ORDER BY e.date DESC LIMIT 1) AS latest_ecph,
       -- Harvest in date range
       (SELECT COALESCE(SUM(h.total_quantity), 0) FROM harvests h
        WHERE h.field_id = f.id AND h.date >= ${rangeStart} AND h.date <= ${refDate}) AS harvest_this_week,
       -- Water in date range
       (SELECT COALESCE(SUM(fe.daily_water), 0) FROM fertigation_entries fe
        WHERE fe.field_id = f.id AND fe.date >= ${rangeStart} AND fe.date <= ${refDate}) AS water_this_week,
       -- Latest scouting within date range
       (SELECT json_build_object('id', sr.id, 'pest', COALESCE(pdc.name, sr.custom_pest_name), 'pct', sr.infestation_pct, 'status', sr.status, 'date', sr.report_date)
        FROM scouting_reports sr
        LEFT JOIN pest_disease_catalog pdc ON pdc.id = sr.pest_disease_id
        WHERE sr.field_id = f.id AND sr.status != 'resolved'
          AND ($${dateFromIdx}::date IS NULL OR sr.report_date >= $${dateFromIdx}::date)
          AND ($${dateToIdx}::date IS NULL OR sr.report_date <= $${dateToIdx}::date)
        ORDER BY sr.report_date DESC LIMIT 1) AS latest_scouting,
       -- Latest bumble bee box inspection
       (SELECT json_build_object(
          'inspection_date', bi.inspection_date,
          'boxes_100', bi.boxes_100,
          'boxes_80', bi.boxes_80,
          'boxes_60', bi.boxes_60,
          'boxes_40', bi.boxes_40,
          'boxes_20', bi.boxes_20,
          'boxes_0', bi.boxes_0,
          'total_boxes', bi.total_boxes
        )
        FROM bumble_bee_box_inspections bi
        WHERE bi.field_id = f.id
        ORDER BY bi.inspection_date DESC, bi.created_at DESC
        LIMIT 1) AS last_bumble_bee_inspection,
       -- Spray today only (same day)
       (SELECT json_build_object('id', pa2.id, 'product', pp.name)
        FROM pesticide_applications pa2
        LEFT JOIN pesticide_products pp ON pp.id = pa2.product_id
        WHERE pa2.field_id = f.id
          AND pa2.application_date = ${refDate}
        ORDER BY pa2.created_at DESC LIMIT 1) AS spray_today
     FROM fields f
     LEFT JOIN field_types ft ON ft.id = f.field_type_id
     LEFT JOIN crops c ON c.id = f.current_crop_id
     WHERE f.deleted_at IS NULL ${siteFilter}
     ORDER BY f.name
     LIMIT 500`,
    params
  );

  return result.rows;
}
