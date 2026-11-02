export function fertigationCropName(entry, fieldMap = {}) {
  const fromField = fieldMap[entry?.fieldId]?.currentCrop || '';
  return String(entry?.cropName || entry?.crop || fromField || '').trim();
}

export function normalizeFertilizerName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function recipeFertilizerAmount(fert) {
  return Number(fert?.kgPerLiter) || Number(fert?.dose) || Number(fert?.quantityPer1000L) || 0;
}

export function fertilizerMixKeyFromEntry(fertilizers) {
  return Object.entries(fertilizers || {})
    .filter(([, qty]) => Number(qty) > 0)
    .map(([name]) => normalizeFertilizerName(name))
    .filter(Boolean)
    .sort()
    .join('|');
}

export function fertilizerMixKeyFromRecipe(recipe) {
  const list = Array.isArray(recipe?.fertilizers) ? recipe.fertilizers : [];
  const nonzero = list.filter((fert) => recipeFertilizerAmount(fert) > 0);
  const source = nonzero.length > 0 ? nonzero : list;
  return source
    .map((fert) => normalizeFertilizerName(fert.name))
    .filter(Boolean)
    .sort()
    .join('|');
}

function asRecipeList(recipesOrMap) {
  if (Array.isArray(recipesOrMap)) return recipesOrMap;
  return Object.entries(recipesOrMap || {}).map(([id, name]) => (
    name && typeof name === 'object' ? { id, ...name } : { id, name }
  ));
}

export function matchRecipeByFertilizerMix(entry, recipes = []) {
  const key = fertilizerMixKeyFromEntry(entry?.fertilizers);
  if (!key) return '';
  const matches = (recipes || []).filter((recipe) => fertilizerMixKeyFromRecipe(recipe) === key);
  if (matches.length !== 1) return '';
  return String(matches[0].name || '').trim();
}

export function fertigationRecipeName(entry, recipesOrMap = []) {
  const recipes = asRecipeList(recipesOrMap);
  const linked = String(entry?.recipeName || '').trim();
  if (linked) return linked;
  if (entry?.recipeId) {
    const found = recipes.find((recipe) => recipe.id === entry.recipeId);
    if (found?.name) return String(found.name).trim();
  }
  return matchRecipeByFertilizerMix(entry, recipes);
}
