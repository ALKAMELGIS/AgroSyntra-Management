import { dbPool } from '../db/client';
import type { Country, CreateCountryDto, UpdateCountryDto } from '../models/country.model';
import { NotFoundError, AppError } from '../utils/errors';
import { normalizePagination } from '../utils/pagination';
import { buildUpdateQuery } from '../utils/queryBuilder';
import { BaseRepository } from './base.repository';

type ListResult<T> = { items: T[]; total: number };

function mapCountry(row: any): Country {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? undefined,
  };
}

export class CountryRepository extends BaseRepository<Country> {
  constructor() {
    super('countries');
  }

  async list(params: { page?: number; limit?: number; countryIds?: string[]; organizationId?: string }): Promise<ListResult<Country>> {
    const { page, limit, offset } = normalizePagination(params);
    const values: Array<string | number | string[]> = [];
    const where: string[] = ['deleted_at IS NULL'];

    if (params.organizationId) {
      values.push(params.organizationId);
      where.push(`organization_id = $${values.length}`);
    }

    if (params.countryIds?.length) {
      values.push(params.countryIds);
      where.push(`id = ANY($${values.length}::uuid[])`);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const totalResult = await dbPool.query(
      `SELECT COUNT(*) FROM countries ${whereSql}`,
      values
    );
    const total = Number(totalResult.rows[0].count);

    values.push(limit, offset);
    const result = await dbPool.query(
      `SELECT * FROM countries
       ${whereSql}
       ORDER BY name ASC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );

    return {
      items: result.rows.map(mapCountry),
      total,
    };
  }

  async getById(id: string): Promise<Country> {
    const result = await dbPool.query(
      'SELECT * FROM countries WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    if (result.rowCount === 0) {
      throw new NotFoundError('Country not found');
    }
    return mapCountry(result.rows[0]);
  }

  /** The zone's organization, or null when it does not exist (or is deleted). */
  async getOrganizationId(id: string): Promise<string | null> {
    const result = await dbPool.query(
      'SELECT organization_id FROM countries WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    if (result.rows.length === 0) return null;
    return result.rows[0].organization_id ?? null;
  }

  async create(payload: CreateCountryDto, organizationId: string): Promise<Country> {
    const result = await dbPool.query(
      `INSERT INTO countries (name, code, organization_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [payload.name, payload.code, organizationId]
    );
    return mapCountry(result.rows[0]);
  }

  async update(id: string, payload: UpdateCountryDto): Promise<Country> {
    const { sql, values } = buildUpdateQuery(
      'countries',
      { name: 'name', code: 'code' },
      payload,
      id,
      { softDelete: true }
    );

    const result = await dbPool.query(sql, values);

    if (result.rowCount === 0) {
      throw new NotFoundError('Country not found');
    }

    return mapCountry(result.rows[0]);
  }

  async softDelete(id: string): Promise<void> {
    const result = await dbPool.query(
      `UPDATE countries
       SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );

    if (result.rowCount === 0) {
      throw new NotFoundError('Country not found');
    }
  }
}
