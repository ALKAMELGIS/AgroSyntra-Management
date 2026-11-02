import {
  blockedRecipeGroups,
  checkImportRecipe,
  fertilizersForImport,
  normalizeRecipeKey,
  recipeNotApprovedMessage,
} from '../fertigationImportValidate';

describe('recipe approval on import', () => {
  const approved = { id: 'r-ok', name: 'R1', status: 'approved' };
  const draft = { id: 'r-draft', name: 'R2', status: 'draft' };
  const byKey = {
    [normalizeRecipeKey(approved.name)]: approved,
    [normalizeRecipeKey(draft.name)]: draft,
  };

  it('accepts an approved recipe regardless of case and spacing', () => {
    expect(checkImportRecipe(' r1 ', byKey)).toEqual({ recipe: approved, blockedMessage: null });
  });

  it('blocks a draft recipe with the operations manager message', () => {
    expect(checkImportRecipe('R2', byKey)).toEqual({
      recipe: null,
      blockedMessage: "Recipe 'R2' isn't approved yet — ask the operations manager to add/approve it",
    });
  });

  it('blocks an unknown recipe with the same message', () => {
    expect(checkImportRecipe('Mystery', byKey).blockedMessage).toBe(recipeNotApprovedMessage('Mystery'));
  });

  it('leaves rows without a recipe alone', () => {
    expect(checkImportRecipe('', byKey)).toEqual({ recipe: null, blockedMessage: null });
  });

  it('groups blocked rows by recipe name', () => {
    const groups = blockedRecipeGroups([
      { recipe: 'R2 ', _recipeBlocked: true },
      { recipe: 'r2', _recipeBlocked: true },
      { recipe: 'Mystery', _recipeBlocked: true },
      { recipe: 'R1', _recipeBlocked: false },
    ]);
    expect(groups.find((g) => g.key === 'r2').count).toBe(2);
    expect(groups.find((g) => g.key === 'mystery').count).toBe(1);
    expect(groups.find((g) => g.key === 'r1')).toBeUndefined();
  });
});

describe('fertilizersForImport', () => {
  it('prefers Excel kg over recipe calculation', () => {
    const result = fertilizersForImport({
      fertilizers: { Urea: 2, 'Calcium Nitrate': 3 },
      _dailyTotal: 10,
      _recipe: { fertilizers: [{ name: 'Urea', kgPerLiter: 0.5 }] },
    });
    expect(result.fertilizers).toEqual({ Urea: 2, 'Calcium Nitrate': 3 });
    expect(result.totalFertilizer).toBe(5);
  });

  it('falls back to recipe kg/L when the sheet has no fertilizer numbers', () => {
    const result = fertilizersForImport({
      _dailyTotal: 10,
      _recipe: { fertilizers: [{ name: 'Urea', kgPerLiter: 0.5 }] },
    });
    expect(result.fertilizers).toEqual({ Urea: 5 });
  });
});
