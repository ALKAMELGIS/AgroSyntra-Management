import {
  fertigationCropName,
  fertigationRecipeName,
  matchRecipeByFertilizerMix,
} from '../fertigationEntryLabels';

const r15 = {
  id: 'r15',
  name: 'R15',
  fertilizers: [
    { name: 'Borax', kgPerLiter: 0.001 },
    { name: 'Calcium Nitrate', kgPerLiter: 0.2 },
    { name: 'Iron Chelate', kgPerLiter: 0.01 },
    { name: 'MAP', kgPerLiter: 0.03 },
    { name: 'MKP', kgPerLiter: 0.01 },
    { name: 'Magnesium Nitrate', kgPerLiter: 0.1 },
    { name: 'Urea', kgPerLiter: 0 },
  ],
};

const mix = {
  Borax: 0.022,
  'Calcium Nitrate': 4.464,
  'Iron Chelate': 0.201,
  MAP: 0.6,
  MKP: 0.273,
  'Magnesium Nitrate': 2.726,
};

describe('fertigationEntryLabels', () => {
  const fieldMap = { f1: { currentCrop: 'Cucumber' } };
  const recipeMap = { r1: 'Recipe A' };

  it('prefers API cropName over field current crop', () => {
    expect(fertigationCropName({ fieldId: 'f1', cropName: 'Tomato' }, fieldMap)).toBe('Tomato');
    expect(fertigationCropName({ fieldId: 'f1' }, fieldMap)).toBe('Cucumber');
    expect(fertigationCropName({ fieldId: 'f1', crop: 'Pepper' }, {})).toBe('Pepper');
  });

  it('prefers API recipeName over the recipes map', () => {
    expect(fertigationRecipeName({ recipeId: 'r1', recipeName: 'Old mix' }, recipeMap)).toBe('Old mix');
    expect(fertigationRecipeName({ recipeId: 'r1' }, recipeMap)).toBe('Recipe A');
    expect(fertigationRecipeName({ recipeId: 'missing' }, recipeMap)).toBe('');
  });

  it('infers a unique fertilizer mix as the catalog recipe', () => {
    expect(matchRecipeByFertilizerMix({ fertilizers: mix }, [r15])).toBe('R15');
    expect(fertigationRecipeName({ fertilizers: mix }, [r15])).toBe('R15');
  });

  it('stays blank when two recipes share the mix', () => {
    const twin = { ...r15, id: 'r16', name: 'R16' };
    expect(fertigationRecipeName({ fertilizers: mix }, [r15, twin])).toBe('');
  });

  it('stays blank when fertilizers are empty', () => {
    expect(fertigationRecipeName({ fertilizers: {} }, [r15])).toBe('');
    expect(fertigationRecipeName({}, [r15])).toBe('');
  });
});
