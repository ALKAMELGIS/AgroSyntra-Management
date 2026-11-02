import { dbPool } from '../db/client';
import type { Recipe, RecipeFertilizer } from '../models/recipe.model';
import { AppError, NotFoundError } from '../utils/errors';
import { normalizePagination } from '../utils/pagination';
import { BaseRepository } from './base.repository';

type ListParams = { page?: number; limit?: number };
type ListResult<T> = { items: T[]; total: number };

function mapRecipe(row: any): Recipe {
  return {
    id: row.id,
    name: row.name,
    status: row.status === 'approved' ? 'approved' : 'draft',
    approvedBy: row.approved_by ?? null,
    approvedAt: row.approved_at ?? null,
    description: row.description ?? undefined,
    tankVolume: row.tank_volume ?? undefined,
    cycles: row.cycles ?? undefined,
    elementPpm: row.element_ppm ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapFertilizer(row: any): RecipeFertilizer {
  return {
    id: row.id,
    recipeId: row.recipe_id,
    name: row.name,
    dose: row.dose ?? undefined,
    kgPerLiter: row.kg_per_liter ?? undefined,
    tankVolume: row.tank_volume ?? undefined,
    quantityPer1000L: row.quantity_per_1000l ?? undefined,
    elementPpm: row.element_ppm ?? undefined,
    element: row.element ?? undefined,
    concentration: row.concentration ?? undefined,
  };
}

export class RecipeRepository extends BaseRepository<Recipe> {
  constructor() {
    super('recipes');
  }

  async list(params: ListParams): Promise<ListResult<Recipe>> {
    const { limit, offset } = normalizePagination(params);
    const totalResult = await dbPool.query('SELECT COUNT(*) FROM recipes WHERE deleted_at IS NULL');
    const total = Number(totalResult.rows[0].count);

    const result = await dbPool.query(
      `SELECT * FROM recipes WHERE deleted_at IS NULL
       ORDER BY name ASC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    const items = result.rows.map(mapRecipe);

    if (items.length > 0) {
      const ids = items.map((r) => r.id);
      const fertResult = await dbPool.query(
        'SELECT * FROM recipe_fertilizers WHERE recipe_id = ANY($1)',
        [ids]
      );
      const fertMap = new Map<string, RecipeFertilizer[]>();
      for (const row of fertResult.rows) {
        const mapped = mapFertilizer(row);
        const arr = fertMap.get(mapped.recipeId) || [];
        arr.push(mapped);
        fertMap.set(mapped.recipeId, arr);
      }
      for (const recipe of items) {
        recipe.fertilizers = fertMap.get(recipe.id) || [];
      }
    }

    return { items, total };
  }

  async getById(id: string): Promise<Recipe> {
    const recipeResult = await dbPool.query('SELECT * FROM recipes WHERE id = $1 AND deleted_at IS NULL', [id]);
    if (recipeResult.rowCount === 0) {
      throw new NotFoundError('Recipe not found');
    }
    const fertilizersResult = await dbPool.query(
      'SELECT * FROM recipe_fertilizers WHERE recipe_id = $1',
      [id]
    );
    const recipe = mapRecipe(recipeResult.rows[0]);
    recipe.fertilizers = fertilizersResult.rows.map(mapFertilizer);
    return recipe;
  }

  async create(payload: {
    name: string;
    description?: string;
    tankVolume?: number;
    cycles?: number;
    elementPpm?: Record<string, number>;
    fertilizers?: Array<{
      name: string;
      dose?: number;
      kgPerLiter?: number;
      tankVolume?: number;
      quantityPer1000L?: number;
      elementPpm?: Record<string, number>;
      element?: string;
      concentration?: number;
    }>;
  }): Promise<Recipe> {
    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');
      const recipeResult = await client.query(
        `INSERT INTO recipes (name, description, tank_volume, cycles, element_ppm, status)
         VALUES ($1,$2,$3,$4,$5,'draft')
         RETURNING *`,
        [
          payload.name,
          payload.description ?? null,
          payload.tankVolume ?? null,
          payload.cycles ?? null,
          payload.elementPpm ?? null,
        ]
      );
      const recipe = mapRecipe(recipeResult.rows[0]);

      if (payload.fertilizers) {
        for (const f of payload.fertilizers) {
          await client.query(
            `INSERT INTO recipe_fertilizers (
              recipe_id, name, dose, kg_per_liter, tank_volume, quantity_per_1000l, element_ppm, element, concentration
            )
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [
              recipe.id,
              f.name,
              f.dose ?? null,
              f.kgPerLiter ?? null,
              f.tankVolume ?? null,
              f.quantityPer1000L ?? null,
              f.elementPpm ?? null,
              f.element ?? null,
              f.concentration ?? null,
            ]
          );
        }
      }

      await client.query('COMMIT');
      return this.getById(recipe.id);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async update(
    id: string,
    payload: {
      name?: string;
      description?: string;
      tankVolume?: number;
      cycles?: number;
      elementPpm?: Record<string, number>;
      fertilizers?: Array<{
        name: string;
        dose?: number;
        kgPerLiter?: number;
        tankVolume?: number;
        quantityPer1000L?: number;
        elementPpm?: Record<string, number>;
        element?: string;
        concentration?: number;
      }>;
    }
  ): Promise<Recipe> {
    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');

      const updates: string[] = [];
      const values: Array<string | number | null | Record<string, unknown>> = [];

      if (payload.name !== undefined) {
        values.push(payload.name);
        updates.push(`name = $${values.length}`);
      }
      if (payload.description !== undefined) {
        values.push(payload.description);
        updates.push(`description = $${values.length}`);
      }
      if (payload.tankVolume !== undefined) {
        values.push(payload.tankVolume);
        updates.push(`tank_volume = $${values.length}`);
      }
      if (payload.cycles !== undefined) {
        values.push(payload.cycles);
        updates.push(`cycles = $${values.length}`);
      }
      if (payload.elementPpm !== undefined) {
        values.push(payload.elementPpm);
        updates.push(`element_ppm = $${values.length}`);
      }

      if (updates.length === 0 && payload.fertilizers === undefined) {
        throw new AppError('No fields to update', 'VALIDATION_ERROR', 400);
      }

      // Any edit (fields or fertilizers) sends the recipe back to draft so the
      // operations manager has to approve the new version before it is used.
      updates.push(`status = 'draft'`, 'approved_by = NULL', 'approved_at = NULL');
      values.push(id);
      const result = await client.query(
        `UPDATE recipes
         SET ${updates.join(', ')}, updated_at = NOW()
         WHERE id = $${values.length} AND deleted_at IS NULL
         RETURNING *`,
        values
      );
      if (result.rowCount === 0) {
        throw new NotFoundError('Recipe not found');
      }

      if (payload.fertilizers) {
        await client.query('DELETE FROM recipe_fertilizers WHERE recipe_id = $1', [id]);
        for (const f of payload.fertilizers) {
          await client.query(
            `INSERT INTO recipe_fertilizers (
              recipe_id, name, dose, kg_per_liter, tank_volume, quantity_per_1000l, element_ppm, element, concentration
            )
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [
              id,
              f.name,
              f.dose ?? null,
              f.kgPerLiter ?? null,
              f.tankVolume ?? null,
              f.quantityPer1000L ?? null,
              f.elementPpm ?? null,
              f.element ?? null,
              f.concentration ?? null,
            ]
          );
        }
      }

      await client.query('COMMIT');
      return this.getById(id);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /** Mark a recipe approved. Idempotent: re-approving keeps the original approver. */
  async approve(id: string, userId: string): Promise<{ recipe: Recipe; alreadyApproved: boolean }> {
    const existing = await dbPool.query(
      'SELECT status FROM recipes WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    if (existing.rowCount === 0) {
      throw new NotFoundError('Recipe not found');
    }
    const alreadyApproved = existing.rows[0].status === 'approved';
    if (!alreadyApproved) {
      await dbPool.query(
        `UPDATE recipes
         SET status = 'approved', approved_by = $2, approved_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND deleted_at IS NULL`,
        [id, userId]
      );
    }
    return { recipe: await this.getById(id), alreadyApproved };
  }

  /** Status of each requested recipe id that exists (soft-deleted recipes are left out). */
  async findStatuses(ids: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (ids.length === 0) return out;
    const result = await dbPool.query(
      'SELECT id, status FROM recipes WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL',
      [ids]
    );
    for (const row of result.rows) out.set(row.id, row.status);
    return out;
  }

  async delete(id: string): Promise<void> {
    const result = await dbPool.query('UPDATE recipes SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL', [id]);
    if (result.rowCount === 0) {
      throw new NotFoundError('Recipe not found');
    }
  }
}
