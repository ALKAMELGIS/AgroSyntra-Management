// Fertigation recipes must be approved by the operations manager before they
// can be used on entries, group defaults or imports. Drafts stay visible in
// history but are never offered as a new choice.

export const RECIPE_APPROVER_ROLE = 'operation_manager';

export function isRecipeApproved(recipe) {
  return recipe?.status === 'approved';
}

export function canApproveRecipes(user) {
  return user?.role === RECIPE_APPROVER_ROLE;
}

/**
 * Recipes a picker should list: every approved recipe, plus the currently
 * selected one when it is not approved (so an existing entry still shows its
 * recipe). Callers render the non-approved one disabled via `recipeOptionLabel`.
 */
export function recipePickerOptions(recipes, selectedId) {
  const list = Array.isArray(recipes) ? recipes : [];
  const options = list.filter(isRecipeApproved);
  if (selectedId && !options.some((r) => r.id === selectedId)) {
    const current = list.find((r) => r.id === selectedId);
    if (current) options.push(current);
  }
  return options;
}

export function recipeOptionLabel(recipe) {
  if (!recipe) return '';
  return isRecipeApproved(recipe) ? recipe.name : `${recipe.name} (not approved)`;
}
