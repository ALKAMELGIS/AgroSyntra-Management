import {
  canApproveRecipes,
  isRecipeApproved,
  recipeOptionLabel,
  recipePickerOptions,
} from '../recipeApproval';

describe('recipeApproval', () => {
  const approved = { id: 'a', name: 'A', status: 'approved' };
  const draft = { id: 'd', name: 'D', status: 'draft' };

  it('offers only approved recipes for a new selection', () => {
    expect(recipePickerOptions([approved, draft], '')).toEqual([approved]);
  });

  it('keeps an existing draft selection visible, labelled not approved', () => {
    const options = recipePickerOptions([approved, draft], 'd');
    expect(options).toEqual([approved, draft]);
    expect(recipeOptionLabel(draft)).toBe('D (not approved)');
    expect(recipeOptionLabel(approved)).toBe('A');
  });

  it('only the operations manager can approve', () => {
    expect(canApproveRecipes({ role: 'operation_manager' })).toBe(true);
    expect(canApproveRecipes({ role: 'ceo' })).toBe(false);
    expect(canApproveRecipes({ role: 'farm_manager' })).toBe(false);
    expect(canApproveRecipes(null)).toBe(false);
  });

  it('treats a missing status as not approved', () => {
    expect(isRecipeApproved({ id: 'x', name: 'X' })).toBe(false);
  });
});
