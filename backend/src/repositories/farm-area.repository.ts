import { dbPool } from '../db/client';
import type { FarmArea } from '../models/farm-area.model';
import { AppError, NotFoundError } from '../utils/errors';
import { normalizePagination } from '../utils/pagination';
import { BaseRepository } from './base.repository';

type ListParams = { page?: number; limit?: number; siteId?: string; farmAreaIds?: string[]; organizationId?: string };
type ListResult<T> = { items: T[]; total: number };

function mapFarmArea(row: any): FarmArea {
  const crops = row.crops
    ? Array.isArray(row.crops)
      ? row.crops
      : JSON.parse(row.crops)
    : [];
  return {
    id: row.id,
    siteId: row.site_id,
    name: row.name,
    size: row.size ?? undefined,
    description: row.description ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? undefined,
    crops: crops.map((crop: any) => ({
      id: crop.id,
      name: crop.name,
      dripperCount: crop.dripperCount ?? crop.dripper_count ?? undefined,
      dripTestCount: crop.dripTestCount ?? crop.drip_test_count ?? undefined,
      createdAt: crop.createdAt ?? crop.created_at ?? new Date(),
      updatedAt: crop.updatedAt ?? crop.updated_at ?? new Date(),
    })),
  };
}

export class FarmAreaRepository extends BaseRepository<FarmArea> {
  constructor() {
    super('farm_areas');
  }

  async list(params: ListParams): Promise<ListResult<FarmArea>> {
    const { page, limit, offset } = normalizePagination(params);
    const values: Array<string | number | string[]> = [];
    const where: string[] = ['fa.deleted_at IS NULL'];
    const siteJoin = params.organizationId ? ' JOIN sites s ON s.id = fa.site_id' : '';

    if (params.siteId) {
      values.push(params.siteId);
      where.push(`fa.site_id = $${values.length}`);
    }
    if (params.farmAreaIds?.length) {
      values.push(params.farmAreaIds);
      where.push(`fa.id = ANY($${values.length}::uuid[])`);
    }
    if (params.organizationId) {
      values.push(params.organizationId);
      where.push(`s.organization_id = $${values.length}`);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const totalResult = await dbPool.query(
      `SELECT COUNT(*) FROM farm_areas fa${siteJoin} ${whereSql}`,
      values
    );
    const total = Number(totalResult.rows[0].count);

    values.push(limit, offset);
    const result = await dbPool.query(
      `SELECT fa.*,
              COALESCE(
                JSON_AGG(
                  JSON_BUILD_OBJECT(
                    'id', c.id,
                    'name', c.name,
                    'dripperCount', c.dripper_count,
                    'dripTestCount', c.drip_test_count,
                    'createdAt', c.created_at,
                    'updatedAt', c.updated_at
                  )
                ) FILTER (WHERE c.id IS NOT NULL),
                '[]'
              ) AS crops
       FROM farm_areas fa
       ${siteJoin}
       LEFT JOIN farm_area_crops fac ON fac.farm_area_id = fa.id
       LEFT JOIN crops c ON c.id = fac.crop_id
       ${whereSql}
       GROUP BY fa.id
       ORDER BY fa.name ASC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );

    return { items: result.rows.map(mapFarmArea), total };
  }

  async getById(id: string): Promise<FarmArea> {
    const result = await dbPool.query(
      `SELECT fa.*,
              COALESCE(
                JSON_AGG(
                  JSON_BUILD_OBJECT(
                    'id', c.id,
                    'name', c.name,
                    'dripperCount', c.dripper_count,
                    'dripTestCount', c.drip_test_count,
                    'createdAt', c.created_at,
                    'updatedAt', c.updated_at
                  )
                ) FILTER (WHERE c.id IS NOT NULL),
                '[]'
              ) AS crops
       FROM farm_areas fa
       LEFT JOIN farm_area_crops fac ON fac.farm_area_id = fa.id
       LEFT JOIN crops c ON c.id = fac.crop_id
       WHERE fa.id = $1 AND fa.deleted_at IS NULL
       GROUP BY fa.id`,
      [id]
    );
    if (result.rowCount === 0) {
      throw new NotFoundError('Farm area not found');
    }
    return mapFarmArea(result.rows[0]);
  }

  async create(payload: {
    siteId: string;
    name: string;
    size?: number;
    description?: string;
  }): Promise<FarmArea> {
    const result = await dbPool.query(
      `INSERT INTO farm_areas (site_id, name, size, description)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [payload.siteId, payload.name, payload.size ?? null, payload.description ?? null]
    );
    return mapFarmArea(result.rows[0]);
  }

  async update(
    id: string,
    payload: { name?: string; size?: number; description?: string; siteId?: string }
  ): Promise<FarmArea> {
    const updates: string[] = [];
    const values: Array<string | number | null> = [];

    if (payload.name !== undefined) {
      values.push(payload.name);
      updates.push(`name = $${values.length}`);
    }
    if (payload.size !== undefined) {
      values.push(payload.size);
      updates.push(`size = $${values.length}`);
    }
    if (payload.description !== undefined) {
      values.push(payload.description);
      updates.push(`description = $${values.length}`);
    }
    if (payload.siteId !== undefined) {
      values.push(payload.siteId);
      updates.push(`site_id = $${values.length}`);
    }

    if (updates.length === 0) {
      throw new AppError('No fields to update', 'VALIDATION_ERROR', 400);
    }

    values.push(id);
    const result = await dbPool.query(
      `UPDATE farm_areas
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${values.length} AND deleted_at IS NULL
       RETURNING *`,
      values
    );

    if (result.rowCount === 0) {
      throw new NotFoundError('Farm area not found');
    }

    return mapFarmArea(result.rows[0]);
  }

  async softDelete(id: string): Promise<void> {
    const result = await dbPool.query(
      `UPDATE farm_areas
       SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    if (result.rowCount === 0) {
      throw new NotFoundError('Farm area not found');
    }
  }

  async setCrops(farmAreaId: string, cropIds: string[]) {
    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM farm_area_crops WHERE farm_area_id = $1', [farmAreaId]);
      for (const cropId of cropIds) {
        await client.query(
          `INSERT INTO farm_area_crops (farm_area_id, crop_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [farmAreaId, cropId]
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
