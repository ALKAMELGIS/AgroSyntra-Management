import { FertigationRepository } from '../repositories/fertigation.repository';
import { RecipeRepository } from '../repositories/recipe.repository';
import { buildPaginationMeta, normalizePagination } from '../utils/pagination';
import { AppError } from '../utils/errors';
import { assertRecipesApproved, RECIPE_NOT_APPROVED_MESSAGE } from './recipe.service';
import { assertFieldDateNotClosed, assertFieldDateWritable } from './seasons.service';

export class FertigationService {
  private readonly repository = new FertigationRepository();
  private readonly recipeRepository = new RecipeRepository();

  async list(params: {
    page?: number;
    limit?: number;
    fieldId?: string;
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
    recipeId?: string;
    cropId?: string;
    date: string;
    weekNumber?: number;
    flowRate?: number;
    frequency?: number;
    valvesCount?: number;
    dailyWater?: number;
    fertilizers?: Record<string, number>;
    totalFertilizer?: number;
    cumulative?: Record<string, unknown>;
    workerId?: string;
  }) {
    await assertFieldDateWritable(payload.fieldId, payload.date);
    await assertRecipesApproved([payload.recipeId], this.recipeRepository);
    return this.repository.create(payload);
  }

  async bulkImport(entries: Array<{
    fieldId: string;
    recipeId?: string;
    cropId?: string;
    date: string;
    weekNumber?: number;
    flowRate?: number;
    frequency?: number;
    valvesCount?: number;
    dailyWater?: number;
    fertilizers?: Record<string, number>;
    totalFertilizer?: number;
    cumulative?: Record<string, unknown>;
    workerId?: string;
  }>): Promise<{ inserted: number; updated: number; skipped: number; errors: string[] }> {
    const results = { inserted: 0, updated: 0, skipped: 0, errors: [] as string[] };
    // Look up every referenced recipe once. Rows pointing at a draft or unknown
    // recipe are rejected one by one so the rest of the import still lands.
    const recipeIds = Array.from(
      new Set(entries.map((e) => e.recipeId).filter((id): id is string => !!id))
    );
    const recipeStatuses = await this.recipeRepository.findStatuses(recipeIds);
    for (let i = 0; i < entries.length; i += 1) {
      const parsed = entries[i];
      try {
        if (parsed.recipeId && recipeStatuses.get(parsed.recipeId) !== 'approved') {
          throw new AppError(RECIPE_NOT_APPROVED_MESSAGE, 'VALIDATION_ERROR', 400);
        }
        // Rows dated in a closed season are rejected one by one, like bad recipes.
        await assertFieldDateWritable(parsed.fieldId, parsed.date);
        const existingId = await this.repository.findIdByFieldAndDate(parsed.fieldId, parsed.date);
        if (existingId) {
          await this.repository.update(existingId, {
            date: parsed.date,
            recipeId: parsed.recipeId,
            cropId: parsed.cropId,
            weekNumber: parsed.weekNumber,
            flowRate: parsed.flowRate,
            frequency: parsed.frequency,
            valvesCount: parsed.valvesCount,
            dailyWater: parsed.dailyWater,
            fertilizers: parsed.fertilizers,
            totalFertilizer: parsed.totalFertilizer,
            cumulative: parsed.cumulative,
            workerId: parsed.workerId,
          });
          results.updated += 1;
        } else {
          await this.repository.create(parsed);
          results.inserted += 1;
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        results.errors.push(`Entry ${i + 1}: ${message}`);
      }
    }
    return results;
  }

  async update(
    id: string,
    payload: {
      recipeId?: string;
      cropId?: string;
      date?: string;
      weekNumber?: number;
      flowRate?: number;
      frequency?: number;
      valvesCount?: number;
      dailyWater?: number;
      fertilizers?: Record<string, number>;
      totalFertilizer?: number;
      cumulative?: Record<string, unknown>;
      workerId?: string | null;
    }
  ) {
    await this.assertUpdateSeasonAllowed(id, payload.date);
    await this.assertUpdateRecipeAllowed(id, payload.recipeId);
    return this.repository.update(id, payload);
  }

  /**
   * The entry's current day must not sit in a closed season, and the day it
   * moves to must be writable (same rule as harvest and EC/pH edits).
   */
  async assertUpdateSeasonAllowed(id: string, newDate?: string | null) {
    const existing = await this.repository.getById(id);
    await assertFieldDateNotClosed(existing.fieldId, existing.date);
    await assertFieldDateWritable(existing.fieldId, newDate ?? existing.date);
  }

  /** Refuse edits/deletes of an entry dated inside a closed season. */
  async assertEntryNotClosed(id: string) {
    const existing = await this.repository.getById(id);
    await assertFieldDateNotClosed(existing.fieldId, existing.date);
  }

  /**
   * A new recipe on an entry must be approved. Re-sending the recipe the entry
   * already has is allowed, so editing water/valves on an older entry whose
   * recipe was later sent back to draft still works.
   */
  async assertUpdateRecipeAllowed(id: string, recipeId?: string | null) {
    if (!recipeId) return;
    const statuses = await this.recipeRepository.findStatuses([recipeId]);
    if (statuses.get(recipeId) === 'approved') return;
    const existing = await this.repository.getById(id);
    if (existing.recipeId === recipeId) return;
    throw new AppError(RECIPE_NOT_APPROVED_MESSAGE, 'VALIDATION_ERROR', 400, { recipeId });
  }

  async remove(id: string) {
    await this.assertEntryNotClosed(id);
    return this.repository.delete(id);
  }
}
