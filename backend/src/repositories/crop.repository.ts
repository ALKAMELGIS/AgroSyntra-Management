import { dbPool } from '../db/client';
import type { Crop, CropVariety } from '../models/crop.model';
import type { DbCropRow } from '../models/db-rows';
import { AppError, NotFoundError } from '../utils/errors';
import { normalizePagination } from '../utils/pagination';
import { buildUpdateQuery } from '../utils/queryBuilder';
import { BaseRepository } from './base.repository';

type ListParams = { page?: number; limit?: number };
type ListResult<T> = { items: T[]; total: number };

function mapCrop(row: DbCropRow): Crop {
  return {
    id: row.id,
    name: row.name,
    dripperCount: row.dripper_count ?? undefined,
    dripTestCount: row.drip_test_count ?? undefined,
    plantCount: row.plant_count ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class CropRepository extends BaseRepository<Crop> {
  constructor() {
    super('crops');
  }

  async list(params: ListParams): Promise<ListResult<Crop>> {
    const { page, limit, offset } = normalizePagination(params);
    const totalResult = await dbPool.query('SELECT COUNT(*) FROM crops');
    const total = Number(totalResult.rows[0].count);

    const result = await dbPool.query(
      `SELECT * FROM crops
       ORDER BY name ASC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return { items: result.rows.map(mapCrop), total };
  }

  async getById(id: string): Promise<Crop> {
    const result = await dbPool.query('SELECT * FROM crops WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      throw new NotFoundError('Crop not found');
    }
    return mapCrop(result.rows[0]);
  }

  async create(payload: {
    name: string;
    dripperCount?: number;
    dripTestCount?: number;
    plantCount?: number;
  }): Promise<Crop> {
    const result = await dbPool.query(
      `INSERT INTO crops (name, dripper_count, drip_test_count, plant_count)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [payload.name, payload.dripperCount ?? null, payload.dripTestCount ?? null, payload.plantCount ?? null]
    );
    return mapCrop(result.rows[0]);
  }

  async update(id: string, payload: {
    name?: string;
    dripperCount?: number;
    dripTestCount?: number;
    plantCount?: number;
  }): Promise<Crop> {
    const { sql, values } = buildUpdateQuery(
      'crops',
      {
        name: 'name',
        dripperCount: 'dripper_count',
        dripTestCount: 'drip_test_count',
        plantCount: 'plant_count',
      },
      payload,
      id
    );

    const result = await dbPool.query(sql, values);

    if (result.rowCount === 0) {
      throw new NotFoundError('Crop not found');
    }

    return mapCrop(result.rows[0]);
  }

  async delete(id: string): Promise<void> {
    const result = await dbPool.query('DELETE FROM crops WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      throw new NotFoundError('Crop not found');
    }
  }

  // ── Variety methods ─────────────────────────────────────────────

  private mapVariety(row: any): CropVariety {
    return {
      id: row.id,
      cropId: row.crop_id,
      name: row.name,
      isActive: row.is_active,
      breederId: row.breeder_id || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async listVarieties(cropId: string): Promise<CropVariety[]> {
    const result = await dbPool.query(
      'SELECT * FROM crop_varieties WHERE crop_id = $1 ORDER BY name ASC',
      [cropId]
    );
    return result.rows.map((r: any) => this.mapVariety(r));
  }

  async createVariety(cropId: string, name: string, breederId?: string): Promise<CropVariety> {
    const result = await dbPool.query(
      `INSERT INTO crop_varieties (crop_id, name, breeder_id) VALUES ($1, $2, $3) RETURNING *`,
      [cropId, name, breederId || null]
    );
    return this.mapVariety(result.rows[0]);
  }

  async updateVariety(
    id: string,
    payload: { name?: string; isActive?: boolean }
  ): Promise<CropVariety> {
    const updates: string[] = [];
    const values: Array<string | boolean> = [];

    if (payload.name !== undefined) {
      values.push(payload.name);
      updates.push(`name = $${values.length}`);
    }
    if (payload.isActive !== undefined) {
      values.push(payload.isActive);
      updates.push(`is_active = $${values.length}`);
    }

    if (updates.length === 0) {
      throw new AppError('No fields to update', 'VALIDATION_ERROR', 400);
    }

    values.push(id as any);
    const result = await dbPool.query(
      `UPDATE crop_varieties SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${values.length} RETURNING *`,
      values
    );
    if (result.rowCount === 0) {
      throw new NotFoundError('Variety not found');
    }
    return this.mapVariety(result.rows[0]);
  }

  async deleteVariety(id: string): Promise<void> {
    const result = await dbPool.query('DELETE FROM crop_varieties WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      throw new NotFoundError('Variety not found');
    }
  }
}
