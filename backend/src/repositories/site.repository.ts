import { dbPool } from '../db/client';
import type { Site } from '../models/site.model';
import { AppError, NotFoundError } from '../utils/errors';
import { normalizePagination } from '../utils/pagination';
import { BaseRepository } from './base.repository';

type ListParams = { page?: number; limit?: number; countryId?: string; siteIds?: string[]; organizationId?: string };
type ListResult<T> = { items: T[]; total: number };

function mapSite(row: any): Site {
  return {
    id: row.id,
    countryId: row.country_id,
    name: row.name,
    location: row.location ?? undefined,
    totalArea: row.total_area ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? undefined,
  };
}

export class SiteRepository extends BaseRepository<Site> {
  constructor() {
    super('sites');
  }

  async list(params: ListParams): Promise<ListResult<Site>> {
    const { page, limit, offset } = normalizePagination(params);
    const values: Array<string | number | string[]> = [];
    const where: string[] = ['deleted_at IS NULL'];

    if (params.organizationId) {
      values.push(params.organizationId);
      where.push(`organization_id = $${values.length}`);
    }

    if (params.countryId) {
      values.push(params.countryId);
      where.push(`country_id = $${values.length}`);
    }
    if (params.siteIds?.length) {
      values.push(params.siteIds);
      where.push(`id = ANY($${values.length}::uuid[])`);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const totalResult = await dbPool.query(
      `SELECT COUNT(*) FROM sites ${whereSql}`,
      values
    );
    const total = Number(totalResult.rows[0].count);

    values.push(limit, offset);
    const result = await dbPool.query(
      `SELECT * FROM sites
       ${whereSql}
       ORDER BY name ASC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );

    return { items: result.rows.map(mapSite), total };
  }

  async getById(id: string): Promise<Site> {
    const result = await dbPool.query(
      'SELECT * FROM sites WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    if (result.rowCount === 0) {
      throw new NotFoundError('Site not found');
    }
    return mapSite(result.rows[0]);
  }

  /** The site's zone and organization, or null when it does not exist (or is deleted). */
  async getScope(id: string): Promise<{ countryId: string; organizationId: string | null } | null> {
    const result = await dbPool.query(
      'SELECT country_id, organization_id FROM sites WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    if (result.rows.length === 0) return null;
    return { countryId: result.rows[0].country_id, organizationId: result.rows[0].organization_id ?? null };
  }

  async create(payload: {
    countryId: string;
    name: string;
    location?: string;
    totalArea?: number;
    organizationId: string;
  }): Promise<Site> {
    const result = await dbPool.query(
      `INSERT INTO sites (country_id, name, location, total_area, organization_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [payload.countryId, payload.name, payload.location ?? null, payload.totalArea ?? null, payload.organizationId]
    );
    return mapSite(result.rows[0]);
  }

  async update(
    id: string,
    payload: { name?: string; location?: string; totalArea?: number; countryId?: string }
  ): Promise<Site> {
    const updates: string[] = [];
    const values: Array<string | number | null> = [];

    if (payload.name !== undefined) {
      values.push(payload.name);
      updates.push(`name = $${values.length}`);
    }
    if (payload.location !== undefined) {
      values.push(payload.location);
      updates.push(`location = $${values.length}`);
    }
    if (payload.totalArea !== undefined) {
      values.push(payload.totalArea);
      updates.push(`total_area = $${values.length}`);
    }
    if (payload.countryId !== undefined) {
      values.push(payload.countryId);
      updates.push(`country_id = $${values.length}`);
    }

    if (updates.length === 0) {
      throw new AppError('No fields to update', 'VALIDATION_ERROR', 400);
    }

    values.push(id);
    const result = await dbPool.query(
      `UPDATE sites
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${values.length} AND deleted_at IS NULL
       RETURNING *`,
      values
    );

    if (result.rowCount === 0) {
      throw new NotFoundError('Site not found');
    }

    return mapSite(result.rows[0]);
  }

  async softDelete(id: string): Promise<void> {
    const result = await dbPool.query(
      `UPDATE sites
       SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    if (result.rowCount === 0) {
      throw new NotFoundError('Site not found');
    }
  }

  /** Get distinct country IDs that have at least one of the given site IDs */
  async getCountryIdsForSiteIds(siteIds: string[]): Promise<string[]> {
    if (siteIds.length === 0) return [];
    const result = await dbPool.query(
      'SELECT DISTINCT country_id FROM sites WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL',
      [siteIds]
    );
    return result.rows.map((r) => r.country_id);
  }
}
