import { isRecipeApproved } from './recipeApproval';

export function normalizeRecipeKey(name) {
  return (name || '').toString().trim().toLowerCase();
}

export function recipeNotApprovedMessage(name) {
  return `Recipe '${name}' isn't approved yet — ask the operations manager to add/approve it`;
}

/**
 * Check an Excel recipe name against every recipe in the app (drafts too).
 * Only an approved recipe can be imported; an unknown name or a draft blocks the row.
 * Returns { recipe, blockedMessage } — recipe is the approved match (or null).
 */
export function checkImportRecipe(recipeName, recipesByKey) {
  const display = (recipeName || '').toString().trim();
  if (!display) return { recipe: null, blockedMessage: null };
  const match = recipesByKey?.[normalizeRecipeKey(display)] || null;
  if (match && isRecipeApproved(match)) return { recipe: match, blockedMessage: null };
  return { recipe: null, blockedMessage: recipeNotApprovedMessage(display) };
}

/** Rows blocked by an unknown/draft recipe, grouped by recipe name for one banner each. */
export function blockedRecipeGroups(rows) {
  const map = new Map();
  for (const row of rows || []) {
    if (!row?._recipeBlocked) continue;
    const display = (row.recipe || '').toString().trim();
    const key = normalizeRecipeKey(display);
    if (!key) continue;
    const group = map.get(key) || { key, display, count: 0 };
    group.count += 1;
    map.set(key, group);
  }
  return [...map.values()];
}

export function fertilizersForImport(row) {
  const excel = row?.fertilizers;
  if (excel && typeof excel === 'object') {
    const cleaned = {};
    Object.entries(excel).forEach(([name, value]) => {
      const n = Number(value);
      if (Number.isFinite(n) && n > 0) cleaned[name] = n;
    });
    if (Object.keys(cleaned).length > 0) {
      const listedTotal = Number(row.totalFertilizer);
      return {
        fertilizers: cleaned,
        totalFertilizer: listedTotal > 0
          ? listedTotal
          : Object.values(cleaned).reduce((sum, n) => sum + n, 0),
      };
    }
  }

  const recipe = row?._recipe;
  const dailyTotal = Number(row?._dailyTotal) || 0;
  if (recipe && Array.isArray(recipe.fertilizers) && dailyTotal > 0) {
    const fertilizers = {};
    recipe.fertilizers.forEach((fert) => {
      const amount = Number(((Number(fert.kgPerLiter) || 0) * dailyTotal).toFixed(3));
      if (amount > 0) fertilizers[fert.name] = amount;
    });
    if (Object.keys(fertilizers).length > 0) {
      return {
        fertilizers,
        totalFertilizer: Object.values(fertilizers).reduce((sum, n) => sum + n, 0),
      };
    }
  }

  return { fertilizers: undefined, totalFertilizer: undefined };
}
