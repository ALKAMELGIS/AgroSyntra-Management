import { dbPool } from '../db/client';
import { NotFoundError } from '../utils/errors';
import { assertFieldDateWritable } from './seasons.service';

export interface FertilizerProduct {
  id: string;
  organizationId: string | null;
  name: string;
  typeConc: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FertAppWorkbook {
  id: string;
  siteId: string;
  farmName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FertAppRecord {
  id: string;
  siteId: string;
  fieldId: string;
  fieldName?: string;
  date: string;
  segmentId?: string;
  areaHa?: number;
  crop?: string;
  fertilizerProductId?: string;
  fertilizerName: string;
  fertilizerTypeConc?: string;
  totalKg?: number;
  ratePerHa?: number;
  qtyTons?: number;
  operatorName?: string;
  authorizedBy?: string;
  misNo?: string;
  docNo?: string;
  createdAt: string;
  updatedAt: string;
}

function computeRatePerHa(totalKg?: number | null, areaHa?: number | null): number | null {
  if (totalKg == null || areaHa == null || Number(areaHa) === 0) return null;
  const v = Number(totalKg) / Number(areaHa);
  return Number.isFinite(v) ? v : null;
}

function computeQtyTons(totalKg?: number | null): number | null {
  if (totalKg == null) return null;
  const v = Number(totalKg) / 1000;
  return Number.isFinite(v) ? v : null;
}

function mapProduct(row: Record<string, unknown>): FertilizerProduct {
  return {
    id: row.id as string,
    organizationId: (row.organization_id as string) ?? null,
    name: row.name as string,
    typeConc: (row.type_conc as string) ?? null,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapWorkbook(row: Record<string, unknown>): FertAppWorkbook {
  return {
    id: row.id as string,
    siteId: row.site_id as string,
    farmName: (row.farm_name as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapRecord(row: Record<string, unknown>): FertAppRecord {
  return {
    id: row.id as string,
    siteId: row.site_id as string,
    fieldId: row.field_id as string,
    fieldName: (row.field_name as string) ?? undefined,
    date: row.date as string,
    segmentId: (row.segment_id as string) ?? undefined,
    areaHa: row.area_ha != null ? Number(row.area_ha) : undefined,
    crop: (row.crop as string) ?? undefined,
    fertilizerProductId: (row.fertilizer_product_id as string) ?? undefined,
    fertilizerName: row.fertilizer_name as string,
    fertilizerTypeConc: (row.fertilizer_type_conc as string) ?? undefined,
    totalKg: row.total_kg != null ? Number(row.total_kg) : undefined,
    ratePerHa: row.rate_per_ha != null ? Number(row.rate_per_ha) : undefined,
    qtyTons: row.qty_tons != null ? Number(row.qty_tons) : undefined,
    operatorName: (row.operator_name as string) ?? undefined,
    authorizedBy: (row.authorized_by as string) ?? undefined,
    misNo: (row.mis_no as string) ?? undefined,
    docNo: (row.doc_no as string) ?? undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function listFertilizerProducts(organizationId: string | null): Promise<FertilizerProduct[]> {
  const result = await dbPool.query(
    `SELECT * FROM fertilizer_products
     WHERE is_active = true
       AND organization_id IS NOT DISTINCT FROM $1
     ORDER BY name ASC`,
    [organizationId]
  );
  return result.rows.map(mapProduct);
}

export async function syncFertilizerProducts(
  organizationId: string | null,
  names: string[]
): Promise<{ upserted: number; total: number }> {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  let upserted = 0;
  for (const name of unique) {
    const existing = await dbPool.query(
      `SELECT id FROM fertilizer_products
       WHERE (organization_id IS NOT DISTINCT FROM $1)
         AND LOWER(TRIM(name)) = LOWER($2)
       LIMIT 1`,
      [organizationId, name]
    );
    if (existing.rows[0]) continue;
    await dbPool.query(
      `INSERT INTO fertilizer_products (organization_id, name)
       VALUES ($1, $2)`,
      [organizationId, name]
    );
    upserted++;
  }
  return { upserted, total: unique.length };
}

export async function upsertFertilizerProduct(
  organizationId: string | null,
  name: string,
  typeConc?: string
): Promise<FertilizerProduct> {
  const trimmed = name.trim();
  const existing = await dbPool.query(
    `SELECT * FROM fertilizer_products
     WHERE (organization_id IS NOT DISTINCT FROM $1)
       AND LOWER(TRIM(name)) = LOWER($2)
     LIMIT 1`,
    [organizationId, trimmed]
  );
  if (existing.rows[0]) {
    if (typeConc && !existing.rows[0].type_conc) {
      const updated = await dbPool.query(
        `UPDATE fertilizer_products SET type_conc = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
        [existing.rows[0].id, typeConc]
      );
      return mapProduct(updated.rows[0]);
    }
    return mapProduct(existing.rows[0]);
  }

  const inserted = await dbPool.query(
    `INSERT INTO fertilizer_products (organization_id, name, type_conc)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [organizationId, trimmed, typeConc ?? null]
  );
  return mapProduct(inserted.rows[0]);
}

export async function getWorkbook(siteId: string): Promise<FertAppWorkbook | null> {
  const result = await dbPool.query(
    `SELECT * FROM fertilizer_application_workbooks WHERE site_id = $1`,
    [siteId]
  );
  return result.rows[0] ? mapWorkbook(result.rows[0]) : null;
}

export async function ensureWorkbook(siteId: string, farmName?: string): Promise<FertAppWorkbook> {
  const result = await dbPool.query(
    `INSERT INTO fertilizer_application_workbooks (site_id, farm_name)
     VALUES ($1, $2)
     ON CONFLICT (site_id)
     DO UPDATE SET farm_name = COALESCE(EXCLUDED.farm_name, fertilizer_application_workbooks.farm_name),
                   updated_at = NOW()
     RETURNING *`,
    [siteId, farmName ?? null]
  );
  return mapWorkbook(result.rows[0]);
}

type ListRecordsParams = {
  siteId: string;
  organizationId: string;
  year?: number;
  fieldId?: string;
  startDate?: string;
  endDate?: string;
};

export async function listRecords(params: ListRecordsParams): Promise<FertAppRecord[]> {
  const values: unknown[] = [params.siteId, params.organizationId];
  const clauses: string[] = ['r.site_id = $1', 's.organization_id = $2'];

  if (params.year != null) {
    values.push(params.year);
    clauses.push(`EXTRACT(YEAR FROM r.date) = $${values.length}`);
  }
  if (params.fieldId) {
    values.push(params.fieldId);
    clauses.push(`r.field_id = $${values.length}`);
  }
  if (params.startDate) {
    values.push(params.startDate);
    clauses.push(`r.date >= $${values.length}`);
  }
  if (params.endDate) {
    values.push(params.endDate);
    clauses.push(`r.date <= $${values.length}`);
  }

  const result = await dbPool.query(
    `SELECT r.*, f.name AS field_name
     FROM fertilizer_application_records r
     JOIN fields f ON f.id = r.field_id
     JOIN sites s ON s.id = r.site_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY r.date ASC, f.name ASC`,
    values
  );
  return result.rows.map(mapRecord);
}

type RecordPayload = {
  siteId: string;
  fieldId: string;
  date: string;
  segmentId?: string;
  areaHa?: number;
  crop?: string;
  fertilizerProductId?: string;
  fertilizerName: string;
  fertilizerTypeConc?: string;
  totalKg?: number;
  operatorName?: string;
  authorizedBy?: string;
  misNo?: string;
  docNo?: string;
};

async function insertRecord(payload: RecordPayload): Promise<FertAppRecord> {
  await assertFieldDateWritable(payload.fieldId, payload.date);
  await ensureWorkbook(payload.siteId);
  const ratePerHa = computeRatePerHa(payload.totalKg, payload.areaHa);
  const qtyTons = computeQtyTons(payload.totalKg);
  const result = await dbPool.query(
    `INSERT INTO fertilizer_application_records (
       site_id, field_id, date, segment_id, area_ha, crop,
       fertilizer_product_id, fertilizer_name, fertilizer_type_conc,
       total_kg, rate_per_ha, qty_tons,
       operator_name, authorized_by, mis_no, doc_no
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     RETURNING *`,
    [
      payload.siteId,
      payload.fieldId,
      payload.date,
      payload.segmentId ?? null,
      payload.areaHa ?? null,
      payload.crop ?? null,
      payload.fertilizerProductId ?? null,
      payload.fertilizerName,
      payload.fertilizerTypeConc ?? null,
      payload.totalKg ?? null,
      ratePerHa,
      qtyTons,
      payload.operatorName ?? null,
      payload.authorizedBy ?? null,
      payload.misNo ?? null,
      payload.docNo ?? null,
    ]
  );
  const fieldResult = await dbPool.query('SELECT name FROM fields WHERE id = $1', [payload.fieldId]);
  result.rows[0].field_name = fieldResult.rows[0]?.name;
  return mapRecord(result.rows[0]);
}

export async function createRecord(payload: RecordPayload): Promise<FertAppRecord> {
  return insertRecord(payload);
}

export async function updateRecord(
  id: string,
  payload: Partial<Omit<RecordPayload, 'siteId'>>
): Promise<FertAppRecord> {
  const existing = await dbPool.query('SELECT * FROM fertilizer_application_records WHERE id = $1', [id]);
  if (existing.rowCount === 0) throw new NotFoundError('Fertilizer application record not found');
  const cur = existing.rows[0];
  await assertFieldDateWritable(
    payload.fieldId ?? cur.field_id,
    payload.date ?? cur.date,
  );
  const totalKg = payload.totalKg ?? cur.total_kg;
  const areaHa = payload.areaHa ?? cur.area_ha;
  const ratePerHa = computeRatePerHa(totalKg, areaHa);
  const qtyTons = computeQtyTons(totalKg);

  const result = await dbPool.query(
    `UPDATE fertilizer_application_records SET
       field_id = COALESCE($2, field_id),
       date = COALESCE($3, date),
       segment_id = COALESCE($4, segment_id),
       area_ha = COALESCE($5, area_ha),
       crop = COALESCE($6, crop),
       fertilizer_product_id = COALESCE($7, fertilizer_product_id),
       fertilizer_name = COALESCE($8, fertilizer_name),
       fertilizer_type_conc = COALESCE($9, fertilizer_type_conc),
       total_kg = COALESCE($10, total_kg),
       rate_per_ha = $11,
       qty_tons = $12,
       operator_name = COALESCE($13, operator_name),
       authorized_by = COALESCE($14, authorized_by),
       mis_no = COALESCE($15, mis_no),
       doc_no = COALESCE($16, doc_no),
       updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      payload.fieldId ?? null,
      payload.date ?? null,
      payload.segmentId ?? null,
      payload.areaHa ?? null,
      payload.crop ?? null,
      payload.fertilizerProductId ?? null,
      payload.fertilizerName ?? null,
      payload.fertilizerTypeConc ?? null,
      payload.totalKg ?? null,
      ratePerHa,
      qtyTons,
      payload.operatorName ?? null,
      payload.authorizedBy ?? null,
      payload.misNo ?? null,
      payload.docNo ?? null,
    ]
  );
  const fieldResult = await dbPool.query('SELECT name FROM fields WHERE id = $1', [result.rows[0].field_id]);
  result.rows[0].field_name = fieldResult.rows[0]?.name;
  return mapRecord(result.rows[0]);
}

export async function deleteRecord(id: string): Promise<void> {
  const result = await dbPool.query('DELETE FROM fertilizer_application_records WHERE id = $1', [id]);
  if (result.rowCount === 0) throw new NotFoundError('Fertilizer application record not found');
}

export interface BulkImportRecord {
  fieldId: string;
  date: string;
  segmentId?: string;
  areaHa?: number;
  crop?: string;
  fertilizerName: string;
  fertilizerTypeConc?: string;
  totalKg?: number;
  operatorName?: string;
  authorizedBy?: string;
  misNo?: string;
  docNo?: string;
}

function recordKey(
  date: string,
  fieldId: string,
  segmentId: string | undefined,
  fertilizerName: string
): string {
  return `${date}|${fieldId}|${(segmentId || '').trim().toLowerCase()}|${fertilizerName.trim().toLowerCase()}`;
}

export async function bulkImport(
  organizationId: string | null,
  siteId: string,
  farmName: string | undefined,
  mode: 'merge' | 'replace',
  records: BulkImportRecord[]
): Promise<{
  inserted: number;
  skipped: number;
  errors: string[];
  productsUpserted: number;
}> {
  const client = await dbPool.connect();
  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];
  let productsUpserted = 0;
  const productCache = new Map<string, string>();

  const resolveProductId = async (name: string, typeConc?: string): Promise<string | null> => {
    const key = name.trim().toLowerCase();
    if (productCache.has(key)) return productCache.get(key)!;
    const existing = await client.query(
      `SELECT id FROM fertilizer_products
       WHERE (organization_id IS NOT DISTINCT FROM $1)
         AND LOWER(TRIM(name)) = LOWER($2)
       LIMIT 1`,
      [organizationId, name.trim()]
    );
    if (existing.rows[0]) {
      productCache.set(key, existing.rows[0].id);
      return existing.rows[0].id;
    }
    const ins = await client.query(
      `INSERT INTO fertilizer_products (organization_id, name, type_conc)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [organizationId, name.trim(), typeConc ?? null]
    );
    productsUpserted++;
    productCache.set(key, ins.rows[0].id);
    return ins.rows[0].id;
  };

  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO fertilizer_application_workbooks (site_id, farm_name)
       VALUES ($1, $2)
       ON CONFLICT (site_id)
       DO UPDATE SET farm_name = COALESCE(EXCLUDED.farm_name, fertilizer_application_workbooks.farm_name),
                     updated_at = NOW()`,
      [siteId, farmName ?? null]
    );

    if (mode === 'replace') {
      await client.query('DELETE FROM fertilizer_application_records WHERE site_id = $1', [siteId]);
    }

    const existingKeys = new Set<string>();
    if (mode === 'merge') {
      const existing = await client.query(
        `SELECT date, field_id, segment_id, fertilizer_name
         FROM fertilizer_application_records WHERE site_id = $1`,
        [siteId]
      );
      for (const row of existing.rows) {
        existingKeys.add(
          recordKey(
            row.date as string,
            row.field_id as string,
            row.segment_id as string,
            row.fertilizer_name as string
          )
        );
      }
    }

    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      try {
        const key = recordKey(rec.date, rec.fieldId, rec.segmentId, rec.fertilizerName);
        if (mode === 'merge' && existingKeys.has(key)) {
          skipped++;
          continue;
        }

        const productId = await resolveProductId(rec.fertilizerName, rec.fertilizerTypeConc);
        const ratePerHa = computeRatePerHa(rec.totalKg, rec.areaHa);
        const qtyTons = computeQtyTons(rec.totalKg);

        await client.query(
          `INSERT INTO fertilizer_application_records (
             site_id, field_id, date, segment_id, area_ha, crop,
             fertilizer_product_id, fertilizer_name, fertilizer_type_conc,
             total_kg, rate_per_ha, qty_tons,
             operator_name, authorized_by, mis_no, doc_no
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
          [
            siteId,
            rec.fieldId,
            rec.date,
            rec.segmentId ?? null,
            rec.areaHa ?? null,
            rec.crop ?? null,
            productId,
            rec.fertilizerName.trim(),
            rec.fertilizerTypeConc ?? null,
            rec.totalKg ?? null,
            ratePerHa,
            qtyTons,
            rec.operatorName ?? null,
            rec.authorizedBy ?? null,
            rec.misNo ?? null,
            rec.docNo ?? null,
          ]
        );
        existingKeys.add(key);
        inserted++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Row ${i + 1}: ${msg}`);
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return { inserted, skipped, errors, productsUpserted };
}
