import type { PoolClient } from 'pg';
import { dbPool } from '../db/client';
import { AppError, NotFoundError } from '../utils/errors';
import {
  applyInfestationToObservations,
  deriveHeadlineFromObservations,
} from '../utils/scoutingInfestation';
import { pushNotificationService } from './push-notification.service';
import { emitAlert } from '../websocket';
import { assertFieldDateWritable } from './seasons.service';
import { notifyUser, notifyUsersByRoles } from './userNotify.service';
import {
  catalogJustificationLabel,
  findExistingCatalogEntry,
  hideCatalogStrategy,
} from '../utils/pestCatalogMatch';

const CATALOG_TYPE_PEST = 'pest_catalog';

/**
 * WHERE fragment limiting a statement on `scouting_reports` to one organization.
 * Mirrors getScoutingReportById: older rows without organization_id fall back
 * to their field's organization.
 */
function reportOrgScope(param: string): string {
  return `COALESCE(scouting_reports.organization_id,
    (SELECT f.organization_id FROM fields f WHERE f.id = scouting_reports.field_id)) = ${param}`;
}

// ─── Types ────────────────────────────────────────────────────────

export interface ScoutingObservationInput {
  pestDiseaseId?: string;
  pestName: string;
  category: 'insect' | 'disease';
  samplingUnit?: string;
  samplingMethod?: string;
  count1?: number;
  count2?: number;
  count3?: number;
  count4?: number;
  count5?: number;
  count6?: number;
  count7?: number;
  count8?: number;
  count9?: number;
  count10?: number;
  total?: number;
  average?: number;
  percent?: number;
}

export interface ScoutingGrowthStageInput {
  numberOfTrusses?: number;
  numberOfStems?: number;
  stemThickness?: number;
  avgFruitWeight?: number;
  fruitsPerPlant?: number;
}

export interface ScoutingTrapCardInput {
  cardNumber: number;
  insectType?: string;
  trapLocation?: string;
  monday?: number;
  tuesday?: number;
  wednesday?: number;
  thursday?: number;
  friday?: number;
  saturday?: number;
  sunday?: number;
  total?: number;
}

export interface ScoutingReportInput {
  fieldId: string;
  reportDate?: string;
  reportTime?: string;
  cropName?: string;
  variety?: string;
  areaVariety?: string;
  densityPerArea?: number;
  cropHeight?: number;
  soilCondition?: 'wet' | 'dry';
  weather?: 'sunny' | 'cloudy' | 'rainy';
  wind?: 'none' | 'light' | 'strong';
  bedCode?: string;
  columnCode?: string;
  bayCode?: string;
  valveCode?: string;
  side?: 'fan' | 'wet_pad';
  previousReportId?: string;
  comments?: string;
  // Legacy single-observation fields (kept for back-compat with older clients)
  pestDiseaseId?: string;
  customPestName?: string;
  infestationPct?: number;
  severity?: string;
  notes?: string;
  gpsLat?: number;
  gpsLng?: number;
  // New child collections
  observations?: ScoutingObservationInput[];
  growthStage?: ScoutingGrowthStageInput;
  trapCards?: ScoutingTrapCardInput[];
}

export interface ScoutingPhotoInput {
  filePath: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  gpsLat?: number;
  gpsLng?: number;
  caption?: string;
}

// ─── Pest / Disease Catalog ───────────────────────────────────────

export async function getPestCatalog(
  organizationId: string,
  category?: string,
  includeInactive = false,
): Promise<any[]> {
  let query = `
    SELECT pdc.*
    FROM pest_disease_catalog pdc
    WHERE (
        pdc.organization_id = $1
        OR (
          pdc.organization_id IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM org_catalog_hidden h
            WHERE h.organization_id = $1
              AND h.catalog_type = 'pest_catalog'
              AND h.item_id = pdc.id
          )
          AND NOT EXISTS (
            SELECT 1 FROM pest_disease_catalog ov
            WHERE ov.organization_id = $1 AND ov.source_pest_id = pdc.id
          )
        )
      )`;
  const params: any[] = [organizationId];

  if (!includeInactive) {
    query += ' AND pdc.is_active = true';
  }

  if (category) {
    params.push(category);
    query += ` AND pdc.category = $${params.length}`;
  }

  query += ' ORDER BY pdc.category, pdc.sort_order, pdc.name';
  const result = await dbPool.query(query, params);
  return attachPestCatalogGroups(result.rows);
}

export async function getBiologicalControlSummaryCatalog(organizationId: string): Promise<any[]> {
  const result = await dbPool.query(
    `SELECT pdc.*
     FROM pest_disease_catalog pdc
     WHERE pdc.is_active = true
       AND pdc.category = 'biological_control'
       AND pdc.include_in_summary = true
       AND (
         pdc.organization_id = $1
         OR (
           pdc.organization_id IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM org_catalog_hidden h
             WHERE h.organization_id = $1
               AND h.catalog_type = 'pest_catalog'
               AND h.item_id = pdc.id
           )
         )
       )
     ORDER BY pdc.sort_order, pdc.name`,
    [organizationId],
  );
  return result.rows;
}

export async function createPestCatalogEntry(data: {
  name: string;
  category: string;
  description?: string;
  recommendedAction?: string;
  isCustom?: boolean;
  createdBy?: string;
  organizationId?: string;
  warningThreshold?: number;
  criticalThreshold?: number;
  matchPattern?: string;
  sortOrder?: number;
  includeInSummary?: boolean;
  groupIds?: string[];
}): Promise<any> {
  if (data.organizationId) {
    const existingRows = await dbPool.query(
      `SELECT pdc.*
       FROM pest_disease_catalog pdc
       WHERE pdc.is_active = true
         AND (
           pdc.organization_id = $1
           OR (
             pdc.organization_id IS NULL
             AND NOT EXISTS (
               SELECT 1 FROM org_catalog_hidden h
               WHERE h.organization_id = $1
                 AND h.catalog_type = '${CATALOG_TYPE_PEST}'
                 AND h.item_id = pdc.id
             )
           )
         )`,
      [data.organizationId],
    );
    const existing = findExistingCatalogEntry(data.name, existingRows.rows, {
      organizationId: data.organizationId,
      category: data.category,
    });
    if (existing) {
      if (data.groupIds?.length) {
        await setPestCatalogGroups(existing.id, data.groupIds, data.organizationId);
      }
      const [withGroups] = await attachPestCatalogGroups([existing]);
      return withGroups;
    }
  }

  const isBio = data.category === 'biological_control';
  const result = await dbPool.query(
    `INSERT INTO pest_disease_catalog (
       name, category, description, recommended_action, is_custom, created_by, organization_id,
       warning_threshold, critical_threshold, match_pattern, sort_order, include_in_summary
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
    [
      data.name,
      data.category,
      data.description || null,
      data.recommendedAction || null,
      data.isCustom ?? true,
      data.createdBy || null,
      data.organizationId || null,
      isBio ? null : (data.warningThreshold ?? 20),
      isBio ? null : (data.criticalThreshold ?? 50),
      data.matchPattern || null,
      data.sortOrder ?? 0,
      isBio ? Boolean(data.includeInSummary) : false,
    ],
  );
  const created = result.rows[0];
  if (data.groupIds?.length && data.organizationId) {
    await setPestCatalogGroups(created.id, data.groupIds, data.organizationId);
  }
  const [withGroups] = await attachPestCatalogGroups([created]);
  return withGroups;
}

export type PestCatalogUpdate = Partial<{
  name: string;
  category: string;
  description: string;
  recommendedAction: string;
  isActive: boolean;
  warningThreshold: number;
  criticalThreshold: number;
  matchPattern: string;
  sortOrder: number;
  includeInSummary: boolean;
}>;

/**
 * The catalog row `organizationId` may change when it asks to change `id`:
 * its own row, its existing copy of a shared (foundation) row, or `null` when
 * the id is a shared row the organization has not copied yet. Rows owned by
 * another organization (or missing) are reported as not found.
 */
async function resolveOrgPestCatalogRow(
  id: string,
  organizationId: string,
): Promise<{ row: any; ownId: string | null }> {
  const loaded = await dbPool.query('SELECT * FROM pest_disease_catalog WHERE id = $1', [id]);
  const row = loaded.rows[0];
  if (!row) throw new NotFoundError('Pest catalog entry not found');
  const strategy = hideCatalogStrategy(row, organizationId);
  if (strategy === 'forbidden') throw new NotFoundError('Pest catalog entry not found');
  if (strategy === 'deactivate') return { row, ownId: row.id };
  const override = await dbPool.query(
    `SELECT id FROM pest_disease_catalog
     WHERE organization_id = $1 AND source_pest_id = $2
     ORDER BY created_at
     LIMIT 1`,
    [organizationId, id],
  );
  return { row, ownId: override.rows[0]?.id ?? null };
}

/**
 * Copy a shared (foundation) catalog row into `organizationId`, linked back via
 * source_pest_id, so the organization can change it without touching the shared
 * row every other organization sees. Group links of the shared row are copied.
 */
async function clonePestCatalogEntryForOrg(
  foundationId: string,
  organizationId: string,
  createdBy?: string,
): Promise<string> {
  const result = await dbPool.query(
    `INSERT INTO pest_disease_catalog (
       name, category, description, recommended_action, is_custom, is_active,
       organization_id, created_by, warning_threshold, critical_threshold,
       abbreviation, match_pattern, sort_order, include_in_summary, source_pest_id
     )
     SELECT name, category, description, recommended_action, is_custom, is_active,
            $1, $2, warning_threshold, critical_threshold,
            abbreviation, match_pattern, sort_order, include_in_summary, id
     FROM pest_disease_catalog
     WHERE id = $3 AND organization_id IS NULL
     RETURNING id`,
    [organizationId, createdBy ?? null, foundationId],
  );
  const cloneId = result.rows[0]?.id;
  if (!cloneId) throw new NotFoundError('Pest catalog entry not found');
  await dbPool.query(
    `INSERT INTO pest_catalog_group_members (member_id, group_id)
     SELECT $1, m.group_id
     FROM pest_catalog_group_members m
     WHERE m.member_id = $2 AND m.group_id <> $1
     ON CONFLICT (member_id, group_id) DO NOTHING`,
    [cloneId, foundationId],
  );
  return cloneId;
}

/**
 * Update a catalog entry for one organization. The organization's own rows are
 * updated in place; a shared (foundation) row is copied into the organization
 * first (or its existing copy is updated) so other organizations are unaffected.
 * Another organization's row is not found. Returns the row that was changed,
 * whose id differs from `id` when a shared row was copied.
 */
export async function updatePestCatalogEntry(
  id: string,
  organizationId: string,
  data: PestCatalogUpdate,
  createdBy?: string,
): Promise<any> {
  const { ownId } = await resolveOrgPestCatalogRow(id, organizationId);
  const targetId = ownId ?? await clonePestCatalogEntryForOrg(id, organizationId, createdBy);
  return applyPestCatalogUpdate(targetId, organizationId, data);
}

async function applyPestCatalogUpdate(
  id: string,
  organizationId: string,
  data: PestCatalogUpdate,
): Promise<any> {
  const sets: string[] = [];
  const params: any[] = [];

  if (data.name !== undefined) { params.push(data.name); sets.push(`name = $${params.length}`); }
  if (data.category !== undefined) { params.push(data.category); sets.push(`category = $${params.length}`); }
  if (data.description !== undefined) { params.push(data.description); sets.push(`description = $${params.length}`); }
  if (data.recommendedAction !== undefined) { params.push(data.recommendedAction); sets.push(`recommended_action = $${params.length}`); }
  if (data.isActive !== undefined) { params.push(data.isActive); sets.push(`is_active = $${params.length}`); }
  if (data.warningThreshold !== undefined) { params.push(data.warningThreshold); sets.push(`warning_threshold = $${params.length}`); }
  if (data.criticalThreshold !== undefined) { params.push(data.criticalThreshold); sets.push(`critical_threshold = $${params.length}`); }
  if (data.matchPattern !== undefined) { params.push(data.matchPattern); sets.push(`match_pattern = $${params.length}`); }
  if (data.sortOrder !== undefined) { params.push(data.sortOrder); sets.push(`sort_order = $${params.length}`); }
  if (data.includeInSummary !== undefined) { params.push(data.includeInSummary); sets.push(`include_in_summary = $${params.length}`); }

  sets.push('updated_at = NOW()');
  params.push(id);
  const idParam = params.length;
  params.push(organizationId);

  const result = await dbPool.query(
    `UPDATE pest_disease_catalog SET ${sets.join(', ')}
     WHERE id = $${idParam} AND organization_id = $${params.length}
     RETURNING *`,
    params
  );
  const updated = result.rows[0];
  if (!updated) throw new NotFoundError('Pest catalog entry not found');
  const [withGroups] = await attachPestCatalogGroups([updated]);
  return withGroups;
}

/**
 * Remove a catalog entry for one organization: its own row is deactivated, a
 * shared (foundation) row is hidden for this organization only (and its copy,
 * if any, deactivated). Another organization's row is not found.
 */
export async function deletePestCatalogEntry(id: string, organizationId: string): Promise<void> {
  const { row, ownId } = await resolveOrgPestCatalogRow(id, organizationId);
  if (ownId) {
    await dbPool.query(
      `UPDATE pest_disease_catalog SET is_active = false, updated_at = NOW()
       WHERE id = $1 AND organization_id = $2`,
      [ownId, organizationId],
    );
  }
  if (row.organization_id == null) {
    await dbPool.query(
      `INSERT INTO org_catalog_hidden (organization_id, catalog_type, item_id)
       VALUES ($1, '${CATALOG_TYPE_PEST}', $2)
       ON CONFLICT (organization_id, catalog_type, item_id) DO NOTHING`,
      [organizationId, id],
    );
  }
}

async function attachPestCatalogGroups(rows: any[]): Promise<any[]> {
  if (!rows.length) return rows;
  const ids = rows.map((row) => row.id).filter(Boolean);
  const result = await dbPool.query(
    `SELECT m.member_id, g.id, g.name, g.category
     FROM pest_catalog_group_members m
     JOIN pest_disease_catalog g ON g.id = m.group_id
     WHERE m.member_id = ANY($1::uuid[])
     ORDER BY g.name`,
    [ids],
  );
  const groupsByMember = new Map<string, { id: string; name: string; category: string }[]>();
  for (const row of result.rows) {
    const list = groupsByMember.get(row.member_id) || [];
    list.push({ id: row.id, name: row.name, category: row.category });
    groupsByMember.set(row.member_id, list);
  }
  return rows.map((row) => ({ ...row, groups: groupsByMember.get(row.id) || [] }));
}

export async function setPestCatalogGroups(
  memberId: string,
  groupIds: string[],
  organizationId: string,
): Promise<void> {
  const unique = [...new Set((groupIds || []).filter((id) => id && id !== memberId))];
  if (unique.length > 0) {
    const visible = await dbPool.query(
      `SELECT pdc.id
       FROM pest_disease_catalog pdc
       WHERE pdc.id = ANY($1::uuid[])
         AND pdc.is_active = true
         AND (
           pdc.organization_id = $2
           OR (
             pdc.organization_id IS NULL
             AND NOT EXISTS (
               SELECT 1 FROM org_catalog_hidden h
               WHERE h.organization_id = $2
                 AND h.catalog_type = '${CATALOG_TYPE_PEST}'
                 AND h.item_id = pdc.id
             )
           )
         )`,
      [unique, organizationId],
    );
    const allowed = new Set(visible.rows.map((row) => row.id));
    const missing = unique.filter((id) => !allowed.has(id));
    if (missing.length) {
      throw new AppError('One or more groups were not found in the catalog', 'VALIDATION_ERROR', 400);
    }
  }

  await dbPool.query('DELETE FROM pest_catalog_group_members WHERE member_id = $1', [memberId]);
  if (!unique.length) return;
  await dbPool.query(
    `INSERT INTO pest_catalog_group_members (member_id, group_id)
     SELECT $1, x
     FROM unnest($2::uuid[]) AS x`,
    [memberId, unique],
  );
}

export async function mergePestCatalogEntry(
  sourceId: string,
  targetId: string,
  organizationId: string,
): Promise<any> {
  if (sourceId === targetId) {
    throw new AppError('Choose a different catalog name to match', 'VALIDATION_ERROR', 400);
  }

  const loaded = await dbPool.query(
    'SELECT * FROM pest_disease_catalog WHERE id = ANY($1::uuid[])',
    [[sourceId, targetId]],
  );
  const source = loaded.rows.find((row) => row.id === sourceId);
  const target = loaded.rows.find((row) => row.id === targetId);
  if (!source || !target) throw new NotFoundError('Pest catalog entry not found');
  if (target.organization_id != null && target.organization_id !== organizationId) {
    throw new NotFoundError('Pest catalog entry not found');
  }

  const hide = hideCatalogStrategy(source, organizationId);
  if (hide === 'forbidden') {
    throw new AppError('Pest catalog entry not found in organization', 'FORBIDDEN', 403);
  }

  const oldLabel = catalogJustificationLabel(source);
  const oldName = String(source.name || '').trim();
  const newLabel = catalogJustificationLabel(target);

  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const apps = await client.query(
      `UPDATE pesticide_applications pa
       SET justification = $1,
           justification_catalog_id = $2,
           target_pest = CASE
             WHEN pa.target_pest IS NULL THEN pa.target_pest
             WHEN lower(trim(pa.target_pest)) IN (lower(trim($3)), lower(trim($4))) THEN $1
             ELSE pa.target_pest
           END,
           updated_at = NOW()
       WHERE COALESCE(pa.organization_id, (SELECT f.organization_id FROM fields f WHERE f.id = pa.field_id)) = $5
         AND (
           pa.justification_catalog_id = $6
           OR lower(trim(pa.justification)) IN (lower(trim($3)), lower(trim($4)))
         )`,
      [newLabel, targetId, oldLabel, oldName, organizationId, sourceId],
    );
    const workOrders = await client.query(
      `UPDATE spray_work_orders
       SET justification = $1, updated_at = NOW()
       WHERE organization_id = $2
         AND lower(trim(justification)) IN (lower(trim($3)), lower(trim($4)))`,
      [newLabel, organizationId, oldLabel, oldName],
    );
    await client.query(
      `UPDATE scouting_reports
       SET pest_disease_id = $1, updated_at = NOW()
       WHERE pest_disease_id = $2 AND organization_id = $3`,
      [targetId, sourceId, organizationId],
    );
    await client.query(
      `INSERT INTO pest_catalog_group_members (member_id, group_id)
       SELECT $1, m.group_id
       FROM pest_catalog_group_members m
       WHERE m.member_id = $2
         AND m.group_id <> $1
       ON CONFLICT (member_id, group_id) DO NOTHING`,
      [targetId, sourceId],
    );
    await client.query(
      `INSERT INTO pest_catalog_group_members (member_id, group_id)
       SELECT m.member_id, $1
       FROM pest_catalog_group_members m
       WHERE m.group_id = $2
         AND m.member_id <> $1
       ON CONFLICT (member_id, group_id) DO NOTHING`,
      [targetId, sourceId],
    );
    await client.query(
      'DELETE FROM pest_catalog_group_members WHERE member_id = $1 OR group_id = $1',
      [sourceId],
    );

    switch (hide) {
      case 'deactivate':
        await client.query(
          `UPDATE pest_disease_catalog
           SET is_active = false, updated_at = NOW()
           WHERE id = $1 AND organization_id = $2`,
          [sourceId, organizationId],
        );
        break;
      case 'org_hidden':
        await client.query(
          `INSERT INTO org_catalog_hidden (organization_id, catalog_type, item_id)
           VALUES ($1, '${CATALOG_TYPE_PEST}', $2)
           ON CONFLICT (organization_id, catalog_type, item_id) DO NOTHING`,
          [organizationId, sourceId],
        );
        break;
      default: {
        const _exhaustive: never = hide;
        throw new AppError(`Unhandled hide strategy: ${_exhaustive}`, 'INTERNAL_ERROR', 500);
      }
    }

    await client.query('COMMIT');
    const [withGroups] = await attachPestCatalogGroups([target]);
    return {
      ...withGroups,
      rewrittenApplications: apps.rowCount || 0,
      rewrittenWorkOrders: workOrders.rowCount || 0,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Scouting Reports ─────────────────────────────────────────────

export async function listScoutingReports(opts: {
  fieldId?: string;
  siteId?: string;
  pestDiseaseId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  organizationId: string;
  page?: number;
  limit?: number;
}): Promise<{ items: any[]; meta: any }> {
  const page = opts.page || 1;
  const limit = Math.min(opts.limit || 20, 100);
  const offset = (page - 1) * limit;

  let where = 'WHERE 1=1';
  const params: any[] = [];
  let siteJoinSql = ' LEFT JOIN fields f ON f.id = sr.field_id';

  params.push(opts.organizationId);
  where += ` AND COALESCE(sr.organization_id, f.organization_id) = $${params.length}`;

  if (opts.siteId) {
    siteJoinSql += ' JOIN farm_areas fa ON fa.id = f.farm_area_id';
    params.push(opts.siteId);
    where += ` AND fa.site_id = $${params.length}`;
  }

  if (opts.fieldId) { params.push(opts.fieldId); where += ` AND sr.field_id = $${params.length}`; }
  if (opts.pestDiseaseId) { params.push(opts.pestDiseaseId); where += ` AND sr.pest_disease_id = $${params.length}`; }
  if (opts.status) { params.push(opts.status); where += ` AND sr.status = $${params.length}`; }
  if (opts.startDate) { params.push(opts.startDate); where += ` AND sr.report_date >= $${params.length}`; }
  if (opts.endDate) { params.push(opts.endDate); where += ` AND sr.report_date <= $${params.length}`; }

  const countJoinSql = siteJoinSql;
  const countResult = await dbPool.query(
    `SELECT COUNT(*) FROM scouting_reports sr${countJoinSql} ${where}`, params
  );
  const total = parseInt(countResult.rows[0].count, 10);

  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const result = await dbPool.query(
    `SELECT sr.*,
            f.name AS field_name,
            u.name AS scout_name,
            pdc.name AS pest_disease_name,
            pdc.category AS pest_disease_category,
            (SELECT json_agg(json_build_object(
              'id', sp.id,
              'filePath', sp.file_path,
              'fileName', sp.file_name,
              'caption', sp.caption
            )) FROM scouting_photos sp WHERE sp.scouting_report_id = sr.id) AS photos
     FROM scouting_reports sr
     ${siteJoinSql}
     LEFT JOIN users u ON u.id = sr.scout_user_id
     LEFT JOIN pest_disease_catalog pdc ON pdc.id = sr.pest_disease_id
     ${where}
     ORDER BY sr.report_date DESC, sr.created_at DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  );

  return {
    items: result.rows,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
}

export async function getScoutingReportById(id: string, organizationId: string): Promise<any> {
  const result = await dbPool.query(
    `SELECT sr.*,
            f.name AS field_name,
            u.name AS scout_name,
            pdc.name AS pest_disease_name,
            pdc.category AS pest_disease_category,
            rv.name AS reviewer_name,
            (SELECT json_agg(json_build_object(
              'id', sp.id,
              'filePath', sp.file_path,
              'fileName', sp.file_name,
              'fileSize', sp.file_size,
              'mimeType', sp.mime_type,
              'gpsLat', sp.gps_lat,
              'gpsLng', sp.gps_lng,
              'caption', sp.caption
            )) FROM scouting_photos sp WHERE sp.scouting_report_id = sr.id) AS photos,
            (SELECT json_agg(json_build_object(
              'id', so.id,
              'pestDiseaseId', so.pest_disease_id,
              'pestName', so.pest_name,
              'category', so.category,
              'samplingUnit', so.sampling_unit,
              'samplingMethod', so.sampling_method,
              'count1', so.count_1,
              'count2', so.count_2,
              'count3', so.count_3,
              'count4', so.count_4,
              'count5', so.count_5,
              'count6', so.count_6,
              'count7', so.count_7,
              'count8', so.count_8,
              'count9', so.count_9,
              'count10', so.count_10,
              'total', so.total,
              'average', so.average,
              'percent', so.percent
            ) ORDER BY so.category, so.pest_name)
              FROM scouting_observations so
              WHERE so.scouting_report_id = sr.id) AS observations,
            (SELECT row_to_json(g) FROM (
              SELECT number_of_trusses   AS "numberOfTrusses",
                     number_of_stems     AS "numberOfStems",
                     stem_thickness      AS "stemThickness",
                     avg_fruit_weight    AS "avgFruitWeight",
                     fruits_per_plant    AS "fruitsPerPlant"
              FROM scouting_growth_stage
              WHERE scouting_report_id = sr.id
            ) g) AS growth_stage,
            (SELECT json_agg(json_build_object(
              'id', stc.id,
              'cardNumber', stc.card_number,
              'insectType', stc.insect_type,
              'trapLocation', stc.trap_location,
              'monday', stc.monday,
              'tuesday', stc.tuesday,
              'wednesday', stc.wednesday,
              'thursday', stc.thursday,
              'friday', stc.friday,
              'saturday', stc.saturday,
              'sunday', stc.sunday,
              'total', stc.total
            ) ORDER BY stc.card_number)
              FROM scouting_trap_cards stc
              WHERE stc.scouting_report_id = sr.id) AS trap_cards
     FROM scouting_reports sr
     LEFT JOIN fields f ON f.id = sr.field_id
     LEFT JOIN users u ON u.id = sr.scout_user_id
     LEFT JOIN pest_disease_catalog pdc ON pdc.id = sr.pest_disease_id
     LEFT JOIN users rv ON rv.id = sr.reviewed_by
     WHERE sr.id = $1 AND COALESCE(sr.organization_id, f.organization_id) = $2`,
    [id, organizationId]
  );
  return result.rows[0] || null;
}

function observationHasSampleData(obs: ScoutingObservationInput): boolean {
  if (obs.average != null && obs.average !== 0) return true;
  if (obs.total != null && obs.total !== 0) return true;
  const counts = [
    obs.count1, obs.count2, obs.count3, obs.count4, obs.count5,
    obs.count6, obs.count7, obs.count8, obs.count9, obs.count10,
  ];
  return counts.some((v) => v != null);
}

async function lookupPlantCount(
  client: PoolClient,
  cropName: string | undefined | null,
): Promise<number | null> {
  if (!cropName?.trim()) return null;
  const res = await client.query(
    `SELECT plant_count, dripper_count FROM crops WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) LIMIT 1`,
    [cropName.trim()],
  );
  const plantCount = res.rows[0]?.plant_count;
  if (plantCount != null && Number(plantCount) > 0) return Number(plantCount);
  const dripperCount = res.rows[0]?.dripper_count;
  return dripperCount != null && Number(dripperCount) > 0 ? Number(dripperCount) : null;
}

async function lookupSamplingUnits(client: PoolClient, fieldId: string): Promise<number | null> {
  const res = await client.query(
    `SELECT sampling_units FROM field_sampling_units WHERE field_id = $1`,
    [fieldId],
  );
  const n = res.rows[0]?.sampling_units;
  return n != null && Number(n) > 0 ? Number(n) : null;
}

async function enrichObservationsWithInfestation(
  client: PoolClient,
  data: ScoutingReportInput,
): Promise<ScoutingObservationInput[] | undefined> {
  const observations = data.observations;
  if (!Array.isArray(observations) || observations.length === 0) return observations;

  const needsCalc = observations.some(observationHasSampleData);
  if (!needsCalc) return observations;

  const plantCount = await lookupPlantCount(client, data.cropName);
  if (!plantCount) {
    throw new AppError(
      `Plant count is not configured for crop "${data.cropName || '(unknown)'}". Set plant count in Crops Management before saving scouting counts.`,
      'VALIDATION_ERROR',
      400,
    );
  }

  const samplingUnits = await lookupSamplingUnits(client, data.fieldId);
  if (!samplingUnits) {
    throw new AppError(
      'Sampling units are not configured for this field. Ask a pest agronomist to set them under IPM → Pest Catalog → Sampling Units.',
      'VALIDATION_ERROR',
      400,
    );
  }

  return applyInfestationToObservations(observations, plantCount, samplingUnits);
}

function applyHeadlineFromObservations(
  observations: ScoutingObservationInput[] | undefined,
  data: ScoutingReportInput,
): {
  headlinePct: number | null;
  headlinePestId: string | null;
  headlineCustom: string | null;
} {
  let headlinePct = data.infestationPct ?? null;
  let headlinePestId = data.pestDiseaseId ?? null;
  let headlineCustom = data.customPestName ?? null;

  if (Array.isArray(observations) && observations.length > 0) {
    const headline = deriveHeadlineFromObservations(observations);
    if (headlinePct == null && headline.headlinePct != null) headlinePct = headline.headlinePct;
    if (!headlinePestId && headline.headlinePestId) headlinePestId = headline.headlinePestId;
    if (!headlineCustom && headline.headlineCustom) headlineCustom = headline.headlineCustom;
  }

  return { headlinePct, headlinePestId, headlineCustom };
}

// ─── Field sampling units (infestation % config) ─────────────────

export async function listFieldSamplingUnits(opts: {
  organizationId: string;
  siteId?: string;
  fieldIds?: string[];
}): Promise<any[]> {
  const params: unknown[] = [opts.organizationId];
  const conditions = [
    'f.deleted_at IS NULL',
    'COALESCE(f.organization_id, s.organization_id) = $1',
  ];

  if (opts.siteId) {
    params.push(opts.siteId);
    conditions.push(`fa.site_id = $${params.length}`);
  }

  if (opts.fieldIds && opts.fieldIds.length > 0) {
    params.push(opts.fieldIds);
    conditions.push(`f.id = ANY($${params.length}::uuid[])`);
  } else if (opts.fieldIds && opts.fieldIds.length === 0) {
    return [];
  }

  const result = await dbPool.query(
    `SELECT f.id AS field_id,
            f.name AS field_name,
            s.name AS site_name,
            ft.name AS field_type,
            fsu.sampling_units,
            fsu.updated_at
     FROM fields f
     JOIN farm_areas fa ON fa.id = f.farm_area_id
     JOIN sites s ON s.id = fa.site_id
     LEFT JOIN field_types ft ON ft.id = f.field_type_id
     LEFT JOIN field_sampling_units fsu ON fsu.field_id = f.id
     WHERE ${conditions.join(' AND ')}
     ORDER BY s.name, f.name`,
    params,
  );
  return result.rows;
}

export async function getFieldSamplingUnits(fieldId: string): Promise<number | null> {
  const result = await dbPool.query(
    `SELECT sampling_units FROM field_sampling_units WHERE field_id = $1`,
    [fieldId],
  );
  const n = result.rows[0]?.sampling_units;
  return n != null && Number(n) > 0 ? Number(n) : null;
}

export async function upsertFieldSamplingUnits(
  fieldId: string,
  samplingUnits: number,
  userId: string,
): Promise<any> {
  if (!Number.isFinite(samplingUnits) || samplingUnits <= 0) {
    throw new AppError('Sampling units must be greater than zero.', 'VALIDATION_ERROR', 400);
  }
  const result = await dbPool.query(
    `INSERT INTO field_sampling_units (field_id, sampling_units, updated_by, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (field_id) DO UPDATE SET
       sampling_units = EXCLUDED.sampling_units,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()
     RETURNING *`,
    [fieldId, samplingUnits, userId],
  );
  return result.rows[0];
}

export async function createScoutingReport(
  data: ScoutingReportInput,
  scoutUserId: string,
  organizationId?: string
): Promise<any> {
  await assertFieldDateWritable(data.fieldId, data.reportDate);
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');

    const observations = await enrichObservationsWithInfestation(client, data);
    const { headlinePct, headlinePestId, headlineCustom } = applyHeadlineFromObservations(
      observations,
      data,
    );

    const reportRes = await client.query(
      `INSERT INTO scouting_reports
         (field_id, scout_user_id, report_date, report_time,
          pest_disease_id, custom_pest_name, infestation_pct, severity, notes,
          gps_lat, gps_lng, organization_id,
          crop_name, variety, area_variety, density_per_area,
          crop_height, soil_condition, weather, wind,
          bed_code, column_code, bay_code, valve_code, side,
          previous_report_id, comments)
       VALUES ($1,$2,$3,$4,
               $5,$6,$7,$8,$9,
               $10,$11,$12,
               $13,$14,$15,$16,
               $17,$18,$19,$20,
               $21,$22,$23,$24,$25,
               $26,$27)
       RETURNING *`,
      [
        data.fieldId,
        scoutUserId,
        data.reportDate || new Date().toISOString().split('T')[0],
        data.reportTime || null,
        headlinePestId,
        headlineCustom,
        headlinePct,
        data.severity || null,
        data.notes || null,
        data.gpsLat ?? null,
        data.gpsLng ?? null,
        organizationId || null,
        data.cropName || null,
        data.variety || null,
        data.areaVariety || null,
        data.densityPerArea ?? null,
        data.cropHeight ?? null,
        data.soilCondition || null,
        data.weather || null,
        data.wind || null,
        data.bedCode || null,
        data.columnCode || null,
        data.bayCode || null,
        data.valveCode || null,
        data.side || null,
        data.previousReportId || null,
        data.comments || null,
      ]
    );
    const report = reportRes.rows[0];

    // Observations
    if (Array.isArray(observations) && observations.length > 0) {
      for (const obs of observations) {
        await client.query(
          `INSERT INTO scouting_observations
             (scouting_report_id, pest_disease_id, pest_name, category,
              sampling_unit, sampling_method,
              count_1, count_2, count_3, count_4, count_5,
              count_6, count_7, count_8, count_9, count_10,
              total, average, percent)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
          [
            report.id,
            obs.pestDiseaseId || null,
            obs.pestName,
            obs.category,
            obs.samplingUnit || null,
            obs.samplingMethod || null,
            obs.count1 ?? null,
            obs.count2 ?? null,
            obs.count3 ?? null,
            obs.count4 ?? null,
            obs.count5 ?? null,
            obs.count6 ?? null,
            obs.count7 ?? null,
            obs.count8 ?? null,
            obs.count9 ?? null,
            obs.count10 ?? null,
            obs.total ?? null,
            obs.average ?? null,
            obs.percent ?? null,
          ]
        );
      }
    }

    // Growth stage
    if (data.growthStage) {
      const g = data.growthStage;
      const hasAny =
        g.numberOfTrusses != null || g.numberOfStems != null || g.stemThickness != null ||
        g.avgFruitWeight != null || g.fruitsPerPlant != null;
      if (hasAny) {
        await client.query(
          `INSERT INTO scouting_growth_stage
             (scouting_report_id, number_of_trusses, number_of_stems,
              stem_thickness, avg_fruit_weight, fruits_per_plant)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            report.id,
            g.numberOfTrusses ?? null,
            g.numberOfStems ?? null,
            g.stemThickness ?? null,
            g.avgFruitWeight ?? null,
            g.fruitsPerPlant ?? null,
          ]
        );
      }
    }

    // Trap cards
    if (Array.isArray(data.trapCards) && data.trapCards.length > 0) {
      for (const card of data.trapCards) {
        await client.query(
          `INSERT INTO scouting_trap_cards
             (scouting_report_id, card_number, insect_type, trap_location,
              monday, tuesday, wednesday, thursday, friday, saturday, sunday, total)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            report.id,
            card.cardNumber,
            card.insectType || null,
            card.trapLocation || null,
            card.monday ?? null,
            card.tuesday ?? null,
            card.wednesday ?? null,
            card.thursday ?? null,
            card.friday ?? null,
            card.saturday ?? null,
            card.sunday ?? null,
            card.total ?? null,
          ]
        );
      }
    }

    await client.query('COMMIT');

    // Fire notifications outside the transaction
    notifyScoutingReport(report).catch((err) =>
      console.error('Scouting notify failed:', err)
    );

    return report;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function addScoutingPhotos(
  reportId: string,
  photos: ScoutingPhotoInput[]
): Promise<any[]> {
  const results: any[] = [];
  for (const photo of photos) {
    const res = await dbPool.query(
      `INSERT INTO scouting_photos (scouting_report_id, file_path, file_name, file_size, mime_type, gps_lat, gps_lng, caption)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [reportId, photo.filePath, photo.fileName || null, photo.fileSize || null,
       photo.mimeType || null, photo.gpsLat ?? null, photo.gpsLng ?? null, photo.caption || null]
    );
    results.push(res.rows[0]);
  }
  return results;
}

/**
 * Full replace of a scouting report.
 *
 * Strategy: we wipe the child rows (observations, growth stage, trap cards)
 * and re-insert from the incoming payload inside a transaction. This keeps
 * the child shape consistent with `createScoutingReport` — adding a partial
 * PATCH path would mean diffing every table, which isn't worth the code for
 * a prototype with tiny traffic.
 *
 * Photos are intentionally preserved: they live in the generic `attachments`
 * table and aren't part of the editable form state.
 */
export async function updateScoutingReport(
  id: string,
  data: ScoutingReportInput,
  actorUserId: string,
  organizationId: string,
): Promise<any> {
  const client = await dbPool.connect();
  let resubmitted = false;
  try {
    await client.query('BEGIN');

    // Lock the row (scoped to the organization) so the status transition
    // below is decided on the current status.
    const current = await client.query(
      `SELECT status, scout_user_id FROM scouting_reports
        WHERE id = $1 AND ${reportOrgScope('$2')}
        FOR UPDATE`,
      [id, organizationId],
    );
    if (current.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }
    // The scouter saving a report that was sent back resubmits it.
    const { status: currentStatus, scout_user_id: scoutUserId } = current.rows[0];
    resubmitted = currentStatus === 'returned' && scoutUserId === actorUserId;
    const nextStatus = resubmitted ? 'submitted' : currentStatus;

    const observations = await enrichObservationsWithInfestation(client, data);
    const { headlinePct, headlinePestId, headlineCustom } = applyHeadlineFromObservations(
      observations,
      data,
    );

    const updated = await client.query(
      `UPDATE scouting_reports SET
          field_id = $2,
          report_date = $3,
          report_time = $4,
          pest_disease_id = $5,
          custom_pest_name = $6,
          infestation_pct = $7,
          severity = $8,
          notes = $9,
          gps_lat = $10,
          gps_lng = $11,
          crop_name = $12,
          variety = $13,
          area_variety = $14,
          density_per_area = $15,
          crop_height = $16,
          soil_condition = $17,
          weather = $18,
          wind = $19,
          bed_code = $20,
          column_code = $21,
          bay_code = $22,
          valve_code = $23,
          side = $24,
          comments = $25,
          status = $26,
          updated_at = NOW()
        WHERE id = $1 AND ${reportOrgScope('$27')}
        RETURNING *`,
      [
        id,
        data.fieldId,
        data.reportDate || new Date().toISOString().split('T')[0],
        data.reportTime || null,
        headlinePestId,
        headlineCustom,
        headlinePct,
        data.severity || null,
        data.notes || null,
        data.gpsLat ?? null,
        data.gpsLng ?? null,
        data.cropName || null,
        data.variety || null,
        data.areaVariety || null,
        data.densityPerArea ?? null,
        data.cropHeight ?? null,
        data.soilCondition || null,
        data.weather || null,
        data.wind || null,
        data.bedCode || null,
        data.columnCode || null,
        data.bayCode || null,
        data.valveCode || null,
        data.side || null,
        data.comments || null,
        nextStatus,
        organizationId,
      ],
    );
    if (updated.rowCount === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    // Wipe child rows, then recreate. Cheaper than diffing and keeps the
    // code path symmetrical with create.
    await client.query('DELETE FROM scouting_observations WHERE scouting_report_id = $1', [id]);
    await client.query('DELETE FROM scouting_growth_stage WHERE scouting_report_id = $1', [id]);
    await client.query('DELETE FROM scouting_trap_cards    WHERE scouting_report_id = $1', [id]);

    if (Array.isArray(observations) && observations.length > 0) {
      for (const obs of observations) {
        await client.query(
          `INSERT INTO scouting_observations
             (scouting_report_id, pest_disease_id, pest_name, category,
              sampling_unit, sampling_method,
              count_1, count_2, count_3, count_4, count_5,
              count_6, count_7, count_8, count_9, count_10,
              total, average, percent)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
          [
            id,
            obs.pestDiseaseId || null,
            obs.pestName,
            obs.category,
            obs.samplingUnit || null,
            obs.samplingMethod || null,
            obs.count1 ?? null,
            obs.count2 ?? null,
            obs.count3 ?? null,
            obs.count4 ?? null,
            obs.count5 ?? null,
            obs.count6 ?? null,
            obs.count7 ?? null,
            obs.count8 ?? null,
            obs.count9 ?? null,
            obs.count10 ?? null,
            obs.total ?? null,
            obs.average ?? null,
            obs.percent ?? null,
          ],
        );
      }
    }

    if (data.growthStage) {
      const g = data.growthStage;
      const hasAny =
        g.numberOfTrusses != null || g.numberOfStems != null || g.stemThickness != null ||
        g.avgFruitWeight != null || g.fruitsPerPlant != null;
      if (hasAny) {
        await client.query(
          `INSERT INTO scouting_growth_stage
             (scouting_report_id, number_of_trusses, number_of_stems,
              stem_thickness, avg_fruit_weight, fruits_per_plant)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            id,
            g.numberOfTrusses ?? null,
            g.numberOfStems ?? null,
            g.stemThickness ?? null,
            g.avgFruitWeight ?? null,
            g.fruitsPerPlant ?? null,
          ],
        );
      }
    }

    if (Array.isArray(data.trapCards) && data.trapCards.length > 0) {
      for (const card of data.trapCards) {
        await client.query(
          `INSERT INTO scouting_trap_cards
             (scouting_report_id, card_number, insect_type, trap_location,
              monday, tuesday, wednesday, thursday, friday, saturday, sunday, total)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            id,
            card.cardNumber,
            card.insectType || null,
            card.trapLocation || null,
            card.monday ?? null,
            card.tuesday ?? null,
            card.wednesday ?? null,
            card.thursday ?? null,
            card.friday ?? null,
            card.saturday ?? null,
            card.sunday ?? null,
            card.total ?? null,
          ],
        );
      }
    }

    await client.query('COMMIT');
    const report = updated.rows[0];
    if (resubmitted) {
      notifyScoutingResubmitted(report, organizationId).catch((err) =>
        console.error('Scouting resubmit notify failed:', err),
      );
    }
    return report;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteScoutingReport(id: string, organizationId: string): Promise<boolean> {
  // All child tables cascade via FK, so a single DELETE cleans up
  // observations, growth stage, trap cards and photos atomically.
  const result = await dbPool.query(
    `DELETE FROM scouting_reports WHERE id = $1 AND ${reportOrgScope('$2')}`,
    [id, organizationId],
  );
  return (result.rowCount ?? 0) > 0;
}

export type ScoutingReviewStatus = 'reviewed' | 'resolved' | 'returned';
export const SCOUTING_REVIEW_STATUSES: ScoutingReviewStatus[] = ['reviewed', 'resolved', 'returned'];

/**
 * Reviewer decision on a scouting report: mark it reviewed / resolved, or send
 * it back to the scouter ('returned', which needs a reason). Scoped to the
 * organization. Sending back notifies the scouter.
 */
export async function updateScoutingReportStatus(
  id: string,
  status: ScoutingReviewStatus,
  reviewedBy: string,
  organizationId: string,
  reason?: string | null,
): Promise<any> {
  if (!SCOUTING_REVIEW_STATUSES.includes(status)) {
    throw new AppError(`Invalid scouting report status: ${status}`, 'VALIDATION_ERROR', 400);
  }
  const trimmedReason = reason?.trim() || null;
  if (status === 'returned' && !trimmedReason) {
    throw new AppError('A reason is required to send a scouting report back', 'VALIDATION_ERROR', 400);
  }
  const result = await dbPool.query(
    `UPDATE scouting_reports
     SET status = $1,
         reviewed_by = $2,
         reviewed_at = CASE WHEN $1 IN ('reviewed', 'resolved') THEN NOW() ELSE reviewed_at END,
         review_notes = CASE WHEN $1 = 'returned' THEN $4 ELSE review_notes END,
         returned_at = CASE WHEN $1 = 'returned' THEN NOW() ELSE returned_at END,
         updated_at = NOW()
     WHERE id = $3 AND ${reportOrgScope('$5')}
     RETURNING *`,
    [status, reviewedBy, id, trimmedReason, organizationId]
  );
  const report = result.rows[0];
  if (!report) {
    throw new NotFoundError('Scouting report not found');
  }
  if (status === 'returned' && report.scout_user_id) {
    notifyScoutingReturned(report, trimmedReason as string).catch((err) =>
      console.error('Scouting send-back notify failed:', err),
    );
  }
  return report;
}

// ─── Notification Logic ───────────────────────────────────────────

/** Roles told about a newly submitted scouting report (within its organization). */
export const SCOUTING_SUBMIT_NOTIFY_ROLES = [
  'pest_agronomist', 'agronomist', 'operation_manager', 'farm_manager', 'ceo',
];

async function fieldLabel(fieldId: string | null | undefined): Promise<string> {
  if (!fieldId) return 'Unknown Field';
  const res = await dbPool.query('SELECT name FROM fields WHERE id = $1', [fieldId]);
  return res.rows[0]?.name || 'Unknown Field';
}

function reportDateLabel(report: any): string {
  const d = report.report_date;
  if (!d) return '';
  return d instanceof Date ? d.toISOString().split('T')[0] : String(d).split('T')[0];
}

async function notifyScoutingReturned(report: any, reason: string): Promise<void> {
  const fieldName = await fieldLabel(report.field_id);
  const date = reportDateLabel(report);
  await notifyUser(report.scout_user_id, {
    title: 'Scouting report sent back',
    message: `Your scouting report for ${fieldName}${date ? ` (${date})` : ''} was sent back: ${reason}`,
    severity: 'warning',
    entityType: 'scouting',
    entityId: report.id,
    path: '/ipm/scouting-reports',
  });
}

async function notifyScoutingResubmitted(report: any, organizationId: string): Promise<void> {
  const fieldName = await fieldLabel(report.field_id);
  const date = reportDateLabel(report);
  await notifyUsersByRoles(['pest_agronomist'], {
    title: 'Scouting report resubmitted',
    message: `A scouting report for ${fieldName}${date ? ` (${date})` : ''} was corrected and resubmitted for review.`,
    severity: 'info',
    entityType: 'scouting',
    entityId: report.id,
    path: '/ipm/scouting-reports',
    organizationId,
  });
}

export async function notifyScoutingReport(report: any): Promise<void> {
  try {
    // Get field name and organization
    const fieldResult = await dbPool.query(
      'SELECT name, organization_id FROM fields WHERE id = $1',
      [report.field_id],
    );
    const fieldName = fieldResult.rows[0]?.name || 'Unknown Field';
    const organizationId: string | null =
      report.organization_id || fieldResult.rows[0]?.organization_id || null;
    if (!organizationId) {
      console.warn('Scouting notify skipped: report has no organization', report.id);
      return;
    }

    // Get pest/disease name
    let pestName = report.custom_pest_name || 'Unknown';
    if (report.pest_disease_id) {
      const pestResult = await dbPool.query('SELECT name FROM pest_disease_catalog WHERE id = $1', [report.pest_disease_id]);
      pestName = pestResult.rows[0]?.name || pestName;
    }

    // Determine severity based on configurable thresholds per pest
    const pct = report.infestation_pct || 0;
    let warningThreshold = 20;
    let criticalThreshold = 50;
    if (report.pest_disease_id) {
      const threshResult = await dbPool.query(
        'SELECT warning_threshold, critical_threshold FROM pest_disease_catalog WHERE id = $1',
        [report.pest_disease_id]
      );
      if (threshResult.rows[0]) {
        warningThreshold = threshResult.rows[0].warning_threshold ?? 20;
        criticalThreshold = threshResult.rows[0].critical_threshold ?? 50;
      }
    }

    const isCritical = pct >= criticalThreshold;
    const isWarning = pct >= warningThreshold;

    const severity = isCritical ? 'critical' : isWarning ? 'warning' : 'info';
    const title = isCritical
      ? `CRITICAL: ${pestName} at ${pct}% in ${fieldName}`
      : isWarning
        ? `WARNING: ${pestName} at ${pct}% in ${fieldName}`
        : `Scouting Report: ${pestName} in ${fieldName}`;
    const message = `${pestName} detected at ${pct}% infestation in ${fieldName}. Severity: ${report.severity || 'not specified'}.`;

    // Create alert event
    const alertResult = await dbPool.query(
      `INSERT INTO alert_events (entity_type, entity_id, field_id, severity, title, message, value)
       VALUES ('scouting', $1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [report.id, report.field_id, severity, title, message, pct]
    );
    const alertEvent = alertResult.rows[0];

    // Notify pest agronomists, agronomists and managers of the report's organization
    const notifyRoles = SCOUTING_SUBMIT_NOTIFY_ROLES;
    const rolePlaceholders = notifyRoles.map((_, i) => `$${i + 1}`).join(',');
    const usersResult = await dbPool.query(
      `SELECT id FROM users
        WHERE role IN (${rolePlaceholders}) AND is_active = true
          AND organization_id = $${notifyRoles.length + 1}`,
      [...notifyRoles, organizationId]
    );

    for (const user of usersResult.rows) {
      // In-app notification
      await dbPool.query(
        `INSERT INTO user_notifications (user_id, alert_event_id, title, message, severity)
         VALUES ($1, $2, $3, $4, $5)`,
        [user.id, alertEvent.id, title, message, severity]
      );

      // Real-time + push
      emitAlert(alertEvent, user.id);
      pushNotificationService.sendToUser(user.id, {
        title,
        body: message,
        type: isWarning ? 'alert' : 'info',
        data: { scoutingReportId: report.id, fieldId: report.field_id },
      }).catch(() => {});
    }
  } catch (error) {
    console.error('Failed to send scouting notifications:', error);
  }
}

// ─── Scouting Stats ───────────────────────────────────────────────

export async function getScoutingStats(organizationId: string, fieldId?: string, siteId?: string): Promise<any> {
  const conditions: string[] = [
    "sr.report_date >= CURRENT_DATE - INTERVAL '30 days'",
  ];
  const params: any[] = [];
  let siteJoinSql = ' LEFT JOIN fields f ON f.id = sr.field_id';

  params.push(organizationId);
  conditions.push(`COALESCE(sr.organization_id, f.organization_id) = $${params.length}`);

  if (siteId) {
    siteJoinSql += ' JOIN farm_areas fa ON fa.id = f.farm_area_id';
    params.push(siteId);
    conditions.push(`fa.site_id = $${params.length}`);
  }

  if (fieldId) {
    params.push(fieldId);
    conditions.push(`sr.field_id = $${params.length}`);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const result = await dbPool.query(
    `SELECT
       COUNT(*) AS total_reports,
       COUNT(CASE WHEN sr.status = 'submitted' THEN 1 END) AS pending_reports,
       COUNT(CASE WHEN sr.status = 'resolved' THEN 1 END) AS resolved_reports,
       AVG(sr.infestation_pct) AS avg_infestation,
       MAX(sr.infestation_pct) AS max_infestation,
       COUNT(DISTINCT sr.field_id) AS fields_affected
     FROM scouting_reports sr
     ${siteJoinSql}
     ${whereClause}`,
    params
  );

  return result.rows[0];
}
