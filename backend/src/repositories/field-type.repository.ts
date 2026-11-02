import { dbPool } from '../db/client';
import type { FieldType } from '../models/field-type.model';
import { AppError, NotFoundError } from '../utils/errors';
import { normalizePagination } from '../utils/pagination';
import { BaseRepository } from './base.repository';

type ListParams = { page?: number; limit?: number };
type ListResult<T> = { items: T[]; total: number };

function mapFieldType(row: any): FieldType {
  return {
    id: row.id,
    name: row.name,
    namingPattern: row.naming_pattern ?? undefined,
    defaultValveCount: row.default_valve_count ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class FieldTypeRepository extends BaseRepository<FieldType> {
  constructor() {
    super('field_types');
  }

  async list(params: ListParams): Promise<ListResult<FieldType>> {
    const { page, limit, offset } = normalizePagination(params);
    const totalResult = await dbPool.query('SELECT COUNT(*) FROM field_types');
    const total = Number(totalResult.rows[0].count);

    const result = await dbPool.query(
      `SELECT * FROM field_types
       ORDER BY name ASC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return { items: result.rows.map(mapFieldType), total };
  }

  async getById(id: string): Promise<FieldType> {
    const result = await dbPool.query('SELECT * FROM field_types WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      throw new NotFoundError('Field type not found');
    }
    return mapFieldType(result.rows[0]);
  }

  async create(payload: {
    name: string;
    namingPattern?: string;
    defaultValveCount?: number;
  }): Promise<FieldType> {
    const result = await dbPool.query(
      `INSERT INTO field_types (name, naming_pattern, default_valve_count)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [payload.name, payload.namingPattern ?? null, payload.defaultValveCount ?? 0]
    );
    return mapFieldType(result.rows[0]);
  }

  async update(
    id: string,
    payload: { name?: string; namingPattern?: string; defaultValveCount?: number }
  ): Promise<FieldType> {
    const updates: string[] = [];
    const values: Array<string | number | null> = [];

    if (payload.name !== undefined) {
      values.push(payload.name);
      updates.push(`name = $${values.length}`);
    }
    if (payload.namingPattern !== undefined) {
      values.push(payload.namingPattern);
      updates.push(`naming_pattern = $${values.length}`);
    }
    if (payload.defaultValveCount !== undefined) {
      values.push(payload.defaultValveCount);
      updates.push(`default_valve_count = $${values.length}`);
    }

    if (updates.length === 0) {
      throw new AppError('No fields to update', 'VALIDATION_ERROR', 400);
    }

    values.push(id);
    const result = await dbPool.query(
      `UPDATE field_types
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${values.length}
       RETURNING *`,
      values
    );

    if (result.rowCount === 0) {
      throw new NotFoundError('Field type not found');
    }

    return mapFieldType(result.rows[0]);
  }

  async delete(id: string): Promise<void> {
    const result = await dbPool.query('DELETE FROM field_types WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      throw new NotFoundError('Field type not found');
    }
  }
}
