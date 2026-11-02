import { RecipeRepository } from '../repositories/recipe.repository';
import { buildPaginationMeta, normalizePagination } from '../utils/pagination';
import { AppError } from '../utils/errors';
import { logAuditEvent } from './auditLog.service';

export class RecipeService {
  private readonly repository = new RecipeRepository();

  async list(params: { page?: number; limit?: number }) {
    const { items, total } = await this.repository.list(params);
    const { page, limit } = normalizePagination(params);
    return { items, meta: buildPaginationMeta(total, page, limit) };
  }

  getById(id: string) {
    return this.repository.getById(id);
  }

  create(payload: {
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
  }) {
    return this.repository.create(payload);
  }

  update(
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
  ) {
    return this.repository.update(id, payload);
  }

  /** Operations manager sign-off. Idempotent; only a real draft -> approved change is audited. */
  async approve(id: string, userId: string) {
    const { recipe, alreadyApproved } = await this.repository.approve(id, userId);
    if (!alreadyApproved) {
      await logAuditEvent({
        userId,
        action: 'APPROVE',
        entity: 'recipe',
        entityId: id,
        changes: { status: { from: 'draft', to: 'approved' } },
        metadata: { recipeName: recipe.name },
      });
    }
    return recipe;
  }

  remove(id: string) {
    return this.repository.delete(id);
  }
}

export const RECIPE_NOT_APPROVED_MESSAGE = 'Recipe is not approved';

/**
 * Only approved recipes may be used on fertigation entries and group defaults.
 * Null/undefined ids are ignored (entries without a recipe stay allowed).
 * Throws 400 VALIDATION_ERROR when any id is unknown, deleted or still a draft.
 */
export async function assertRecipesApproved(
  recipeIds: Array<string | null | undefined>,
  repository: Pick<RecipeRepository, 'findStatuses'> = new RecipeRepository()
): Promise<void> {
  const ids = Array.from(new Set(recipeIds.filter((id): id is string => typeof id === 'string' && id.length > 0)));
  if (ids.length === 0) return;
  const statuses = await repository.findStatuses(ids);
  const bad = ids.find((id) => statuses.get(id) !== 'approved');
  if (bad) {
    throw new AppError(RECIPE_NOT_APPROVED_MESSAGE, 'VALIDATION_ERROR', 400, { recipeId: bad });
  }
}
