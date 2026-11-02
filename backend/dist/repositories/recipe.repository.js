"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecipeRepository = void 0;
const client_1 = require("../db/client");
const errors_1 = require("../utils/errors");
const pagination_1 = require("../utils/pagination");
const base_repository_1 = require("./base.repository");
function mapRecipe(row) {
    return {
        id: row.id,
        name: row.name,
        description: row.description ?? undefined,
        tankVolume: row.tank_volume ?? undefined,
        cycles: row.cycles ?? undefined,
        elementPpm: row.element_ppm ?? undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
function mapFertilizer(row) {
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
class RecipeRepository extends base_repository_1.BaseRepository {
    constructor() {
        super('recipes');
    }
    async list(params) {
        const { limit, offset } = (0, pagination_1.normalizePagination)(params);
        const totalResult = await client_1.dbPool.query('SELECT COUNT(*) FROM recipes WHERE deleted_at IS NULL');
        const total = Number(totalResult.rows[0].count);
        const result = await client_1.dbPool.query(`SELECT * FROM recipes WHERE deleted_at IS NULL
       ORDER BY name ASC
       LIMIT $1 OFFSET $2`, [limit, offset]);
        const items = result.rows.map(mapRecipe);
        if (items.length > 0) {
            const ids = items.map((r) => r.id);
            const fertResult = await client_1.dbPool.query('SELECT * FROM recipe_fertilizers WHERE recipe_id = ANY($1)', [ids]);
            const fertMap = new Map();
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
    async getById(id) {
        const recipeResult = await client_1.dbPool.query('SELECT * FROM recipes WHERE id = $1 AND deleted_at IS NULL', [id]);
        if (recipeResult.rowCount === 0) {
            throw new errors_1.NotFoundError('Recipe not found');
        }
        const fertilizersResult = await client_1.dbPool.query('SELECT * FROM recipe_fertilizers WHERE recipe_id = $1', [id]);
        const recipe = mapRecipe(recipeResult.rows[0]);
        recipe.fertilizers = fertilizersResult.rows.map(mapFertilizer);
        return recipe;
    }
    async create(payload) {
        const client = await client_1.dbPool.connect();
        try {
            await client.query('BEGIN');
            const recipeResult = await client.query(`INSERT INTO recipes (name, description, tank_volume, cycles, element_ppm)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING *`, [
                payload.name,
                payload.description ?? null,
                payload.tankVolume ?? null,
                payload.cycles ?? null,
                payload.elementPpm ?? null,
            ]);
            const recipe = mapRecipe(recipeResult.rows[0]);
            if (payload.fertilizers) {
                for (const f of payload.fertilizers) {
                    await client.query(`INSERT INTO recipe_fertilizers (
              recipe_id, name, dose, kg_per_liter, tank_volume, quantity_per_1000l, element_ppm, element, concentration
            )
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [
                        recipe.id,
                        f.name,
                        f.dose ?? null,
                        f.kgPerLiter ?? null,
                        f.tankVolume ?? null,
                        f.quantityPer1000L ?? null,
                        f.elementPpm ?? null,
                        f.element ?? null,
                        f.concentration ?? null,
                    ]);
                }
            }
            await client.query('COMMIT');
            return this.getById(recipe.id);
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async update(id, payload) {
        const client = await client_1.dbPool.connect();
        try {
            await client.query('BEGIN');
            const updates = [];
            const values = [];
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
                throw new errors_1.AppError('No fields to update', 'VALIDATION_ERROR', 400);
            }
            if (updates.length > 0) {
                values.push(id);
                const result = await client.query(`UPDATE recipes
           SET ${updates.join(', ')}, updated_at = NOW()
           WHERE id = $${values.length}
           RETURNING *`, values);
                if (result.rowCount === 0) {
                    throw new errors_1.NotFoundError('Recipe not found');
                }
            }
            if (payload.fertilizers) {
                await client.query('DELETE FROM recipe_fertilizers WHERE recipe_id = $1', [id]);
                for (const f of payload.fertilizers) {
                    await client.query(`INSERT INTO recipe_fertilizers (
              recipe_id, name, dose, kg_per_liter, tank_volume, quantity_per_1000l, element_ppm, element, concentration
            )
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [
                        id,
                        f.name,
                        f.dose ?? null,
                        f.kgPerLiter ?? null,
                        f.tankVolume ?? null,
                        f.quantityPer1000L ?? null,
                        f.elementPpm ?? null,
                        f.element ?? null,
                        f.concentration ?? null,
                    ]);
                }
            }
            await client.query('COMMIT');
            return this.getById(id);
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async delete(id) {
        const result = await client_1.dbPool.query('UPDATE recipes SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL', [id]);
        if (result.rowCount === 0) {
            throw new errors_1.NotFoundError('Recipe not found');
        }
    }
}
exports.RecipeRepository = RecipeRepository;
