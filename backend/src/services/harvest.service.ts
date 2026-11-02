import { HarvestRepository } from '../repositories/harvest.repository';
import { buildPaginationMeta, normalizePagination } from '../utils/pagination';
import { dbPool } from '../db/client';
import { checkAndNotifyHarvestConflicts } from './phiAuditLog.service';
import { resolveHarvestPlanting } from '../utils/harvestPlantingLink';
import { harvestBulkShiftKey, harvestBulkTimeKey } from '../utils/harvestBulkDuplicate';
import { assertFieldDateWritable } from './seasons.service';

export class HarvestService {
  private readonly repository = new HarvestRepository();

  async list(params: {
    page?: number;
    limit?: number;
    fieldId?: string;
    fieldIds?: string[];
    siteId?: string;
    startDate?: string;
    endDate?: string;
    organizationId: string;
  }) {
    const { items, total } = await this.repository.list(params);
    const { page, limit } = normalizePagination(params);
    return { items, meta: buildPaginationMeta(total, page, limit) };
  }

  getById(id: string) {
    return this.repository.getById(id);
  }

  async create(payload: {
    fieldId: string;
    date: string;
    totalQuantity?: number;
    notes?: string;
    startTime?: string;
    endTime?: string;
    shiftNumber?: string;
    weekNumber?: string;
    batchNumber?: string;
    segmentId?: string;
    harvestedAreaHa?: number;
    packhouse?: string;
    authorizedBy?: string;
    extraData?: Record<string, any>;
    cropId?: string;
    cropName?: string;
    varietyName?: string;
    varieties: Array<{ variety: string; quantity: number; grade?: string }>;
  }) {
    await assertFieldDateWritable(payload.fieldId, payload.date);
    const totalQuantity =
      payload.totalQuantity ??
      payload.varieties.reduce((sum, v) => sum + v.quantity, 0);
    return this.repository.create({ ...payload, totalQuantity });
  }

  async update(
    id: string,
    payload: {
      date?: string;
      totalQuantity?: number;
      notes?: string;
      startTime?: string;
      endTime?: string;
      shiftNumber?: string;
      weekNumber?: string;
      batchNumber?: string;
      segmentId?: string;
      harvestedAreaHa?: number;
      packhouse?: string;
      authorizedBy?: string;
      varieties?: Array<{ variety: string; quantity: number; grade?: string }>;
    }
  ) {
    const existing = await this.repository.getById(id);
    await assertFieldDateWritable(existing.fieldId, payload.date ?? existing.date);
    return this.repository.update(id, payload);
  }

  remove(id: string) {
    return this.repository.delete(id);
  }

  async getSummary(siteId: string): Promise<any[]> {
    const result = await dbPool.query(
      `SELECT f.name AS field_name,
              COALESCE(hc.name, ofc.name, prc.name, fc.name) AS crop_name,
              COALESCE(h.open_field_planting_id, h.planting_record_id)::text AS planting_id,
              COALESCE(ofp.seeding_date, pr.transplant_date, pr.seeding_date) AS cycle_start,
              ROUND(COALESCE(SUM(h.total_quantity), 0) / 1000.0, 3) AS yield_tons
       FROM fields f
       LEFT JOIN harvests h ON h.field_id = f.id
       LEFT JOIN crops hc ON hc.id = h.crop_id
       LEFT JOIN crops fc ON fc.id = f.current_crop_id
       LEFT JOIN open_field_planting ofp ON ofp.id = h.open_field_planting_id
       LEFT JOIN planting_records pr ON pr.id = h.planting_record_id
       LEFT JOIN crops ofc ON ofc.id = ofp.crop_id
       LEFT JOIN crops prc ON prc.id = pr.crop_id
       JOIN farm_areas fa ON fa.id = f.farm_area_id
       WHERE fa.site_id = $1 AND f.deleted_at IS NULL
       GROUP BY f.id, f.name,
                COALESCE(hc.name, ofc.name, prc.name, fc.name),
                COALESCE(h.open_field_planting_id, h.planting_record_id),
                COALESCE(ofp.seeding_date, pr.transplant_date, pr.seeding_date)
       ORDER BY f.name, cycle_start NULLS LAST`,
      [siteId]
    );
    return result.rows;
  }

  async getDailyWorksheet(siteId: string, startDate?: string, endDate?: string): Promise<any[]> {
    const params: any[] = [siteId];
    let dateFilter = '';
    if (startDate) {
      params.push(startDate);
      dateFilter += ` AND h.date >= $${params.length}`;
    }
    if (endDate) {
      params.push(endDate);
      dateFilter += ` AND h.date <= $${params.length}`;
    }

    const result = await dbPool.query(
      `SELECT h.date,
              COALESCE(hv.variety, c.name, 'Unknown') AS crop,
              SUM(hv.quantity) AS harvest_qty,
              EXTRACT(WEEK FROM h.date) AS week_no,
              EXTRACT(DAY FROM h.date) AS day,
              EXTRACT(MONTH FROM h.date) AS month,
              EXTRACT(YEAR FROM h.date) AS year
       FROM harvests h
       JOIN harvest_varieties hv ON hv.harvest_id = h.id
       JOIN fields f ON f.id = h.field_id
       LEFT JOIN crops c ON c.id = h.crop_id
       JOIN farm_areas fa ON fa.id = f.farm_area_id
       WHERE fa.site_id = $1 ${dateFilter}
       GROUP BY h.date, COALESCE(hv.variety, c.name, 'Unknown'),
                EXTRACT(WEEK FROM h.date), EXTRACT(DAY FROM h.date),
                EXTRACT(MONTH FROM h.date), EXTRACT(YEAR FROM h.date)
       ORDER BY h.date DESC, crop`,
      params
    );
    return result.rows;
  }

  async getWeeklySummary(siteId: string): Promise<{ weekly: any[]; daily: any[] }> {
    const weekResult = await dbPool.query(
      `SELECT COALESCE(c.name, fc.name, 'Unknown') AS crop,
              SUM(hv.quantity) AS total_quantity
       FROM harvests h
       JOIN harvest_varieties hv ON hv.harvest_id = h.id
       JOIN fields f ON f.id = h.field_id
       LEFT JOIN crops c ON c.id = h.crop_id
       LEFT JOIN crops fc ON fc.id = f.current_crop_id
       JOIN farm_areas fa ON fa.id = f.farm_area_id
       WHERE fa.site_id = $1
         AND EXTRACT(WEEK FROM h.date) = EXTRACT(WEEK FROM CURRENT_DATE)
         AND EXTRACT(YEAR FROM h.date) = EXTRACT(YEAR FROM CURRENT_DATE)
       GROUP BY COALESCE(c.name, fc.name, 'Unknown')
       ORDER BY total_quantity DESC`,
      [siteId]
    );

    const dayResult = await dbPool.query(
      `SELECT COALESCE(c.name, fc.name, 'Unknown') AS crop,
              SUM(hv.quantity) AS total_quantity
       FROM harvests h
       JOIN harvest_varieties hv ON hv.harvest_id = h.id
       JOIN fields f ON f.id = h.field_id
       LEFT JOIN crops c ON c.id = h.crop_id
       LEFT JOIN crops fc ON fc.id = f.current_crop_id
       JOIN farm_areas fa ON fa.id = f.farm_area_id
       WHERE fa.site_id = $1 AND h.date = CURRENT_DATE
       GROUP BY COALESCE(c.name, fc.name, 'Unknown')
       ORDER BY total_quantity DESC`,
      [siteId]
    );

    return { weekly: weekResult.rows, daily: dayResult.rows };
  }

  async bulkCreate(entries: Array<{
    fieldId: string;
    date: string;
    totalQuantity?: number;
    startTime?: string;
    endTime?: string;
    shiftNumber?: string;
    weekNumber?: string;
    batchNumber?: string;
    segmentId?: string;
    harvestedAreaHa?: number;
    packhouse?: string;
    authorizedBy?: string;
    extraData?: Record<string, unknown>;
    varieties: Array<{ variety: string; quantity: number; grade?: string }>;
  }>): Promise<{ inserted: number; skipped: number; errors: string[] }> {
    const client = await dbPool.connect();
    const errors: string[] = [];
    let inserted = 0;
    let skipped = 0;

    try {
      await client.query('BEGIN');

      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        try {
          const varietyName = e.varieties[0]?.variety || '';
          await assertFieldDateWritable(e.fieldId, e.date, client);

          const shiftKey = harvestBulkShiftKey(e.shiftNumber);
          const timeKey = harvestBulkTimeKey(e.startTime);
          const dupCheck = await client.query(
            `SELECT h.id FROM harvests h
             JOIN harvest_varieties hv ON hv.harvest_id = h.id
             WHERE h.field_id = $1 AND h.date = $2 AND LOWER(TRIM(hv.variety)) = LOWER(TRIM($3))
               AND LOWER(TRIM(COALESCE(h.shift_number, ''))) = $4
               AND (
                 $4 <> ''
                 OR COALESCE(to_char(h.start_time, 'HH24:MI'), '') = $5
               )
             LIMIT 1`,
            [e.fieldId, e.date, varietyName, shiftKey, timeKey]
          );

          if (dupCheck.rows.length > 0) {
            skipped++;
            continue;
          }

          const totalQty = e.totalQuantity ?? e.varieties.reduce((s, v) => s + v.quantity, 0);
          const plantingLink = await resolveHarvestPlanting(
            { fieldId: e.fieldId, harvestDate: e.date, segmentId: e.segmentId },
            client,
          );
          const res = await client.query(
            `INSERT INTO harvests (field_id, date, total_quantity, start_time, end_time, shift_number, week_number, batch_number, segment_id, harvested_area_ha, packhouse, authorized_by, extra_data, open_field_planting_id, planting_record_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
             RETURNING id`,
            [
              e.fieldId, e.date, totalQty,
              e.startTime || null, e.endTime || null, e.shiftNumber || null,
              (e.weekNumber && String(e.weekNumber).trim()) || null,
              e.batchNumber || null, e.segmentId || null,
              e.harvestedAreaHa || null, e.packhouse || null, e.authorizedBy || null,
              JSON.stringify(e.extraData || {}),
              plantingLink.openFieldPlantingId,
              plantingLink.plantingRecordId,
            ]
          );
          const harvestId = res.rows[0].id;

          for (const v of e.varieties) {
            await client.query(
              `INSERT INTO harvest_varieties (harvest_id, variety, quantity, grade) VALUES ($1, $2, $3, $4)`,
              [harvestId, v.variety, v.quantity, v.grade || null]
            );
          }
          inserted++;
          checkAndNotifyHarvestConflicts(harvestId).catch(() => {});
        } catch (err: any) {
          errors.push(`Row ${i + 1}: ${err.message}`);
        }
      }

      await client.query('COMMIT');
    } catch (err: any) {
      await client.query('ROLLBACK');
      errors.push(`Transaction failed: ${err.message}`);
    } finally {
      client.release();
    }

    return { inserted, skipped, errors };
  }
}
