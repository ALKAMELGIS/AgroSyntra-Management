/**
 * Recipe Database System for Fertigation Management
 * Stores and manages fertilizer recipes with detailed structure
 * 
 * IMPORTANT: CALCULATION FORMULA
 * fertilizerKG = KG/L × dailyWaterM3
 * 
 * Where:
 * - KG/L = from recipe database (stock concentration)
 * - dailyWaterM3 = daily irrigation water in cubic meters
 * 
 * Examples:
 * - If KG/L = 0.05, dailyWaterM3 = 45.6 → 0.05 × 45.6 = 2.28 kg
 * - If KG/L = 0.08, dailyWaterM3 = 45.6 → 0.08 × 45.6 = 3.648 kg
 */

// Standard list of 16 fertilizers in order
export const FERTILIZER_LIST = [
  { name: 'Phosphoric Acid', element: 'P', concentration: 85 },
  { name: 'Potassium Sulphate', element: 'K', concentration: 50 },
  { name: 'Magnesium Sulphate', element: 'Mg', concentration: 10 },
  { name: 'MKP', element: 'P', concentration: 52 }, // Mono Potassium Phosphate
  { name: 'MAP', element: 'P', concentration: 52 }, // Mono Ammonium Phosphate
  { name: 'Ammonium Sulphate', element: 'N', concentration: 21 },
  { name: 'Mix Chelate', element: 'Cu', concentration: 13 },
  { name: 'Borax', element: 'B', concentration: 11 },
  { name: 'Mn EDTA', element: 'Mn', concentration: 13 },
  { name: 'Zn EDTA', element: 'Zn', concentration: 8 },
  { name: 'Sodium Molybdate', element: 'Mo', concentration: 39 },
  { name: 'Magnesium Nitrate', element: 'Mg', concentration: 10 },
  { name: 'Potassium Nitrate', element: 'K', concentration: 38 },
  { name: 'Calcium Nitrate', element: 'Ca', concentration: 15 },
  { name: 'Iron Chelate', element: 'Fe', concentration: 13 },
  { name: 'Urea', element: 'N', concentration: 46 },
];

const DEBUG_RECIPE_LOGS = false;
const debugLog = (...args) => {
  if (DEBUG_RECIPE_LOGS) {
    console.log(...args);
  }
};
const debugWarn = (...args) => {
  if (DEBUG_RECIPE_LOGS) {
    console.warn(...args);
  }
};
const debugError = (...args) => {
  if (DEBUG_RECIPE_LOGS) {
    console.error(...args);
  }
};

let inMemoryRecipes = null;

/**
 * Initialize sample recipes
 * @returns {Array} Array of recipe objects
 */
const initializeSampleRecipes = () => {
  return [
    {
      id: 'recipe-001',
      recipeName: 'Netajet01 Tank 01',
      description: 'For vegetative stage tomatoes',
      tankVolume: 1000,
      cycles: 15,
      fertilizers: [
        // EXACT DATA FROM EXCEL SHEET - Recipe 1 (R1, Netaget 01)
        // Order matches Excel sheet exactly - 15 fertilizers total
        // Row 3: Tank 01
        { name: 'Phosphoric Acid', quantityPer1000L: 5, dose: 1, tankVolume: 250, kgPerLiter: 0.02, gPerLiter: 20, element: 'P', concentration: 85 },
        // Row 4: Tank 02
        { name: 'Potassium Sulphate', quantityPer1000L: 12.5, dose: 1, tankVolume: 250, kgPerLiter: 0.05, gPerLiter: 50, element: 'K', concentration: 50 },
        // Row 15: Empty tank, 0 values
        { name: 'Magnesium Sulphate', quantityPer1000L: 0, dose: 1, tankVolume: 250, kgPerLiter: 0, gPerLiter: 0, element: 'Mg', concentration: 10 },
        // Row 16
        { name: 'MKP', quantityPer1000L: 2.5, dose: 1, tankVolume: 250, kgPerLiter: 0.01, gPerLiter: 10, element: 'P', concentration: 52 },
        // Row 17
        { name: 'MAP', quantityPer1000L: 7.5, dose: 1, tankVolume: 250, kgPerLiter: 0.03, gPerLiter: 30, element: 'P', concentration: 52 },
        // Row 18: Empty values
        { name: 'Ammonium Sulphate', quantityPer1000L: 0, dose: 1, tankVolume: 250, kgPerLiter: 0, gPerLiter: 0, element: 'N', concentration: 21 },
        // Row 19: Mix Chelate (note: Excel has trailing space "Mix Chelate ")
        { name: 'Mix Chelate', quantityPer1000L: 0, dose: 1, tankVolume: 250, kgPerLiter: 0, gPerLiter: 0, element: 'Cu', concentration: 13 },
        // Row 20
        { name: 'Borax', quantityPer1000L: 0, dose: 1, tankVolume: 250, kgPerLiter: 0, gPerLiter: 0, element: 'B', concentration: 11 },
        // Row 21
        { name: 'Mn EDTA', quantityPer1000L: 0, dose: 1, tankVolume: 250, kgPerLiter: 0, gPerLiter: 0, element: 'Mn', concentration: 13 },
        // Row 22
        { name: 'Zn EDTA', quantityPer1000L: 0, dose: 1, tankVolume: 250, kgPerLiter: 0, gPerLiter: 0, element: 'Zn', concentration: 8 },
        // Row 23
        { name: 'Urea', quantityPer1000L: 0, dose: 1, tankVolume: 250, kgPerLiter: 0, gPerLiter: 0, element: 'N', concentration: 46 },
        // Row 28: Tank 05 - Magnesium Nitrate (note: Excel has trailing space "Magnesium Nitrate ")
        { name: 'Magnesium Nitrate', quantityPer1000L: 12.5, dose: 1, tankVolume: 250, kgPerLiter: 0.05, gPerLiter: 50, element: 'Mg', concentration: 10 },
        // Row 29: Tank 05
        { name: 'Calcium Nitrate', quantityPer1000L: 20, dose: 1, tankVolume: 250, kgPerLiter: 0.08, gPerLiter: 80, element: 'Ca', concentration: 15 },
        // Row 30: Tank 05
        { name: 'Potassium Nitrate', quantityPer1000L: 14.5, dose: 1, tankVolume: 250, kgPerLiter: 0.058, gPerLiter: 58, element: 'K', concentration: 38 },
        // Row 31: Tank 05
        { name: 'Iron Chelate', quantityPer1000L: 0.75, dose: 1, tankVolume: 250, kgPerLiter: 0.003, gPerLiter: 3, element: 'Fe', concentration: 13 },
        // NOTE: Sodium Molybdate is NOT in Excel Recipe 1 - REMOVED
        // Excel shows only 15 fertilizers for Recipe 1, not 16
      ],
      elementPPM: {
        P: 78,
        K: 285,
        Ca: 39.2,
        Mg: 67,
        S: 90,
        Fe: 0.14,
        B: 0.5,
        Zn: 0.01,
        Cu: 0.04,
        Mo: 0.005,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'recipe-002',
      recipeName: 'Netajet01 Tank 02',
      description: 'For flowering stage tomatoes',
      tankVolume: 1000,
      cycles: 15,
      fertilizers: [
        { name: 'Phosphoric Acid', quantityPer1000L: 4.000, dose: 1, tankVolume: 250, kgPerLiter: 0.016, gPerLiter: 16, element: 'P', concentration: 85 },
        { name: 'Potassium Sulphate', quantityPer1000L: 15.0, dose: 1, tankVolume: 250, kgPerLiter: 0.06, gPerLiter: 60, element: 'K', concentration: 50 },
        { name: 'Magnesium Sulphate', quantityPer1000L: 2.0, dose: 1, tankVolume: 250, kgPerLiter: 0.008, gPerLiter: 8, element: 'Mg', concentration: 10 },
        { name: 'MKP', quantityPer1000L: 3.000, dose: 1, tankVolume: 250, kgPerLiter: 0.012, gPerLiter: 12, element: 'P', concentration: 52 },
        { name: 'MAP', quantityPer1000L: 6.000, dose: 1, tankVolume: 250, kgPerLiter: 0.024, gPerLiter: 24, element: 'P', concentration: 52 },
        { name: 'Ammonium Sulphate', quantityPer1000L: 1.0, dose: 1, tankVolume: 250, kgPerLiter: 0.004, gPerLiter: 4, element: 'N', concentration: 21 },
        { name: 'Mix Chelate', quantityPer1000L: 4.0, dose: 1, tankVolume: 250, kgPerLiter: 0.016, gPerLiter: 16, element: 'Cu', concentration: 13 },
        { name: 'Borax', quantityPer1000L: 1.0, dose: 1, tankVolume: 250, kgPerLiter: 0.004, gPerLiter: 4, element: 'B', concentration: 11 },
        { name: 'Mn EDTA', quantityPer1000L: 0.4, dose: 1, tankVolume: 250, kgPerLiter: 0.0016, gPerLiter: 1.6, element: 'Mn', concentration: 13 },
        { name: 'Zn EDTA', quantityPer1000L: 0.3, dose: 1, tankVolume: 250, kgPerLiter: 0.0012, gPerLiter: 1.2, element: 'Zn', concentration: 8 },
        { name: 'Sodium Molybdate', quantityPer1000L: 0.1, dose: 1, tankVolume: 250, kgPerLiter: 0.0004, gPerLiter: 0.4, element: 'Mo', concentration: 39 },
        { name: 'Magnesium Nitrate', quantityPer1000L: 50, dose: 1, tankVolume: 250, kgPerLiter: 0.2, gPerLiter: 200, element: 'Mg', concentration: 10 },
        { name: 'Potassium Nitrate', quantityPer1000L: 65, dose: 1, tankVolume: 250, kgPerLiter: 0.26, gPerLiter: 260, element: 'K', concentration: 38 },
        { name: 'Calcium Nitrate', quantityPer1000L: 160, dose: 1, tankVolume: 250, kgPerLiter: 0.64, gPerLiter: 640, element: 'Ca', concentration: 15 },
        { name: 'Iron Chelate', quantityPer1000L: 8, dose: 1, tankVolume: 250, kgPerLiter: 0.032, gPerLiter: 32, element: 'Fe', concentration: 13 },
        { name: 'Urea', quantityPer1000L: 2.0, dose: 1, tankVolume: 250, kgPerLiter: 0.008, gPerLiter: 8, element: 'N', concentration: 46 },
      ],
      elementPPM: {
        P: 82,
        K: 295,
        Ca: 38.5,
        Mg: 72,
        S: 95,
        Fe: 0.16,
        B: 0.6,
        Zn: 0.015,
        Cu: 0.05,
        Mo: 0.008,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'recipe-003',
      recipeName: 'Netajet01 Tank 03',
      description: 'For fruiting stage tomatoes',
      tankVolume: 1000,
      cycles: 15,
      fertilizers: [
        { name: 'Phosphoric Acid', quantityPer1000L: 3.500, dose: 1, tankVolume: 250, kgPerLiter: 0.014, gPerLiter: 14, element: 'P', concentration: 85 },
        { name: 'Potassium Sulphate', quantityPer1000L: 18.0, dose: 1, tankVolume: 250, kgPerLiter: 0.072, gPerLiter: 72, element: 'K', concentration: 50 },
        { name: 'Magnesium Sulphate', quantityPer1000L: 3.0, dose: 1, tankVolume: 250, kgPerLiter: 0.012, gPerLiter: 12, element: 'Mg', concentration: 10 },
        { name: 'MKP', quantityPer1000L: 3.500, dose: 1, tankVolume: 250, kgPerLiter: 0.014, gPerLiter: 14, element: 'P', concentration: 52 },
        { name: 'MAP', quantityPer1000L: 5.000, dose: 1, tankVolume: 250, kgPerLiter: 0.02, gPerLiter: 20, element: 'P', concentration: 52 },
        { name: 'Ammonium Sulphate', quantityPer1000L: 1.5, dose: 1, tankVolume: 250, kgPerLiter: 0.006, gPerLiter: 6, element: 'N', concentration: 21 },
        { name: 'Mix Chelate', quantityPer1000L: 4.5, dose: 1, tankVolume: 250, kgPerLiter: 0.018, gPerLiter: 18, element: 'Cu', concentration: 13 },
        { name: 'Borax', quantityPer1000L: 1.2, dose: 1, tankVolume: 250, kgPerLiter: 0.0048, gPerLiter: 4.8, element: 'B', concentration: 11 },
        { name: 'Mn EDTA', quantityPer1000L: 0.5, dose: 1, tankVolume: 250, kgPerLiter: 0.002, gPerLiter: 2, element: 'Mn', concentration: 13 },
        { name: 'Zn EDTA', quantityPer1000L: 0.4, dose: 1, tankVolume: 250, kgPerLiter: 0.0016, gPerLiter: 1.6, element: 'Zn', concentration: 8 },
        { name: 'Sodium Molybdate', quantityPer1000L: 0.15, dose: 1, tankVolume: 250, kgPerLiter: 0.0006, gPerLiter: 0.6, element: 'Mo', concentration: 39 },
        { name: 'Magnesium Nitrate', quantityPer1000L: 45, dose: 1, tankVolume: 250, kgPerLiter: 0.18, gPerLiter: 180, element: 'Mg', concentration: 10 },
        { name: 'Potassium Nitrate', quantityPer1000L: 70, dose: 1, tankVolume: 250, kgPerLiter: 0.28, gPerLiter: 280, element: 'K', concentration: 38 },
        { name: 'Calcium Nitrate', quantityPer1000L: 155, dose: 1, tankVolume: 250, kgPerLiter: 0.62, gPerLiter: 620, element: 'Ca', concentration: 15 },
        { name: 'Iron Chelate', quantityPer1000L: 9, dose: 1, tankVolume: 250, kgPerLiter: 0.036, gPerLiter: 36, element: 'Fe', concentration: 13 },
        { name: 'Urea', quantityPer1000L: 3.0, dose: 1, tankVolume: 250, kgPerLiter: 0.012, gPerLiter: 12, element: 'N', concentration: 46 },
      ],
      elementPPM: {
        P: 85,
        K: 310,
        Ca: 37.8,
        Mg: 78,
        S: 100,
        Fe: 0.18,
        B: 0.7,
        Zn: 0.02,
        Cu: 0.06,
        Mo: 0.01,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
};

/**
 * Migrate recipe data to fix incorrect kgPerLiter values
 * Fixes cases where kgPerLiter was incorrectly set to quantityPer1000L values
 * Formula: kgPerLiter = quantityPer1000L / tankVolume
 * @param {Array} recipes - Array of recipe objects
 * @returns {Array} Migrated recipe objects
 */
const migrateRecipeData = (recipes) => {
  if (!Array.isArray(recipes)) return recipes;
  
  // Known correct values for Recipe 1 (Netajet01 Tank 01) from Excel
  // NOTE: Recipe 1 has only 15 fertilizers (Sodium Molybdate is NOT included)
  const correctValues = {
    'Phosphoric Acid': 0.02,
    'Potassium Sulphate': 0.05,
    'Magnesium Sulphate': 0,
    'MKP': 0.01,
    'MAP': 0.03,
    'Ammonium Sulphate': 0,
    'Mix Chelate': 0,
    'Borax': 0,
    'Mn EDTA': 0,
    'Zn EDTA': 0,
    'Urea': 0,
    'Magnesium Nitrate': 0.05,
    'Calcium Nitrate': 0.08,
    'Potassium Nitrate': 0.058,
    'Iron Chelate': 0.003,
  };
  
  let needsMigration = false;
  const migratedRecipes = recipes.map((recipe) => {
    if (!recipe.fertilizers || !Array.isArray(recipe.fertilizers)) return recipe;
    
    // For Recipe 1: Remove Sodium Molybdate if it exists (not in Excel)
    let fertilizersToProcess = recipe.fertilizers;
    if (recipe.recipeName === 'Netajet01 Tank 01') {
      const hasSodiumMolybdate = fertilizersToProcess.some(f => f.name === 'Sodium Molybdate');
      if (hasSodiumMolybdate) {
        debugWarn('Removing Sodium Molybdate from Recipe 1 - not in Excel sheet');
        fertilizersToProcess = fertilizersToProcess.filter(f => f.name !== 'Sodium Molybdate');
        needsMigration = true;
      }
    }
    
    const migratedFertilizers = fertilizersToProcess.map((fertilizer) => {
      const tankVolume = fertilizer.tankVolume || 250;
      const fertilizerName = fertilizer.name;
      
      // Method 1: Use known correct values if available (for Recipe 1)
      // FORCE FIX Recipe 1 to ensure it matches Excel exactly
      if (recipe.recipeName === 'Netajet01 Tank 01' && correctValues.hasOwnProperty(fertilizerName)) {
        const correctValue = correctValues[fertilizerName];
        const currentValue = fertilizer.kgPerLiter || 0;
        
        // Always fix if value doesn't match (even if close, ensure exact match)
        if (Math.abs(currentValue - correctValue) > 0.00001) {
          debugWarn(
            `Fixing kgPerLiter for ${fertilizerName} in ${recipe.recipeName}: ` +
            `${currentValue} → ${correctValue} (using Excel correct value)`
          );
          needsMigration = true;
          return {
            ...fertilizer,
            kgPerLiter: correctValue,
            gPerLiter: correctValue * 1000,
          };
        }
      }
      
      // Method 2: Check if kgPerLiter is incorrectly set to quantityPer1000L value
      // If kgPerLiter > 1, it's likely wrong (should be < 1 for kg/L)
      // Also check if kgPerLiter matches quantityPer1000L (common mistake)
      if (fertilizer.quantityPer1000L && 
          (fertilizer.kgPerLiter > 1 || 
           Math.abs(fertilizer.kgPerLiter - fertilizer.quantityPer1000L) < 0.001)) {
        const correctKgPerLiter = fertilizer.quantityPer1000L / tankVolume;
        debugWarn(
          `Fixing incorrect kgPerLiter for ${fertilizerName} in recipe ${recipe.recipeName}: ` +
          `${fertilizer.kgPerLiter} → ${correctKgPerLiter.toFixed(5)} ` +
          `(quantityPer1000L=${fertilizer.quantityPer1000L}, tankVolume=${tankVolume})`
        );
        needsMigration = true;
        // Calculate correct kgPerLiter: quantityPer1000L / tankVolume
        return {
          ...fertilizer,
          kgPerLiter: correctKgPerLiter,
          gPerLiter: correctKgPerLiter * 1000,
        };
      }
      
      // Method 3: Verify kgPerLiter matches calculated value from quantityPer1000L
      // This catches cases where values are close but not exact
      if (fertilizer.quantityPer1000L && fertilizer.quantityPer1000L > 0) {
        const calculatedKgPerLiter = fertilizer.quantityPer1000L / tankVolume;
        // If difference is more than 1%, recalculate
        const currentValue = fertilizer.kgPerLiter || 0;
        const percentDiff = Math.abs((currentValue - calculatedKgPerLiter) / calculatedKgPerLiter);
        if (percentDiff > 0.01 && calculatedKgPerLiter > 0) {
          debugWarn(
            `Recalculating kgPerLiter for ${fertilizerName} in recipe ${recipe.recipeName}: ` +
            `${currentValue} → ${calculatedKgPerLiter.toFixed(5)} ` +
            `(quantityPer1000L=${fertilizer.quantityPer1000L} / ${tankVolume})`
          );
          needsMigration = true;
          return {
            ...fertilizer,
            kgPerLiter: calculatedKgPerLiter,
            gPerLiter: calculatedKgPerLiter * 1000,
          };
        }
      }
      
      return fertilizer;
    });
    
    return {
      ...recipe,
      fertilizers: migratedFertilizers,
    };
  });
  
  if (needsMigration) {
    debugLog('Recipe data migration completed: Fixed incorrect kgPerLiter values');
  }
  
  return migratedRecipes;
};

/**
 * Load recipes from in-memory store or initialize with samples
 * @returns {Array} Array of recipe objects
 */
/**
 * Force reset recipes to correct values from source file
 * Use this if in-memory data has corrupted values
 */
export const forceResetRecipes = () => {
  debugLog('Force resetting recipes to correct values from source file...');
  const sampleRecipes = initializeSampleRecipes();
  saveRecipes(sampleRecipes);
  debugLog('Recipes reset complete. Please refresh the page.');
  return sampleRecipes;
};

export const loadRecipes = () => {
  try {
    const recipes = inMemoryRecipes;
    if (Array.isArray(recipes) && recipes.length > 0) {
        // FORCE FIX Recipe 1: Replace with correct data from source
        // This ensures Recipe 1 always has correct kgPerLiter values
        const recipe1Index = recipes.findIndex(r => r.recipeName === 'Netajet01 Tank 01');
        if (recipe1Index >= 0) {
          const sampleRecipes = initializeSampleRecipes();
          const correctRecipe1 = sampleRecipes.find(r => r.recipeName === 'Netajet01 Tank 01');
          if (correctRecipe1) {
            // Verify and fix each fertilizer in Recipe 1
            const currentRecipe1 = recipes[recipe1Index];
            let needsFix = false;
            
            // Check if any kgPerLiter values are wrong (especially if they match quantityPer1000L)
            correctRecipe1.fertilizers.forEach((correctFert) => {
              const currentFert = currentRecipe1.fertilizers.find(f => f.name === correctFert.name);
              if (!currentFert) {
                needsFix = true;
                debugWarn(`Missing fertilizer ${correctFert.name} in Recipe 1`);
              } else {
                const currentKgPerLiter = currentFert.kgPerLiter || 0;
                const correctKgPerLiter = correctFert.kgPerLiter;
                
                // Check if kgPerLiter is wrong (matches quantityPer1000L or is way off)
                if (Math.abs(currentKgPerLiter - correctKgPerLiter) > 0.00001) {
                  needsFix = true;
                  debugWarn(
                    `Fixing ${correctFert.name} in Recipe 1: ` +
                    `kgPerLiter ${currentKgPerLiter} → ${correctKgPerLiter} ` +
                    `(quantityPer1000L=${currentFert.quantityPer1000L}, might be using wrong value)`
                  );
                }
                
                // Also check if kgPerLiter matches quantityPer1000L (common mistake)
                if (currentFert.quantityPer1000L && 
                    Math.abs(currentKgPerLiter - currentFert.quantityPer1000L) < 0.001) {
                  needsFix = true;
                  debugError(
                    `CRITICAL: ${correctFert.name} has kgPerLiter = ${currentKgPerLiter} ` +
                    `which matches quantityPer1000L! Should be ${correctKgPerLiter}`
                  );
                }
              }
            });
            
            if (needsFix) {
              debugLog('FORCE FIXING Recipe 1 with correct values from source');
              recipes[recipe1Index] = JSON.parse(JSON.stringify(correctRecipe1)); // Deep copy
            }
          }
        }
        
        // Migrate recipes to fix any incorrect kgPerLiter values
        const migratedRecipes = migrateRecipeData(recipes);
        // Save migrated recipes back if migration occurred
        if (JSON.stringify(recipes) !== JSON.stringify(migratedRecipes)) {
          saveRecipes(migratedRecipes);
          debugLog('Saved migrated recipe data to in-memory store');
        }
        
        // Verification: Test calculations match Excel
        const testWater = 45.6; // m³
        const testRecipe = migratedRecipes.find(r => r.recipeName === 'Netajet01 Tank 01');
        if (testRecipe) {
          const phosAcid = testRecipe.fertilizers.find(f => f.name === 'Phosphoric Acid');
          const potSulph = testRecipe.fertilizers.find(f => f.name === 'Potassium Sulphate');
          if (phosAcid) {
            debugLog(
              `Phosphoric Acid: ${phosAcid.kgPerLiter} × ${testWater} = ${(phosAcid.kgPerLiter * testWater).toFixed(3)} kg`
            );
          }
          if (potSulph) {
            debugLog(
              `Potassium Sulphate: ${potSulph.kgPerLiter} × ${testWater} = ${(potSulph.kgPerLiter * testWater).toFixed(3)} kg`
            );
          }
        }
        
        return migratedRecipes;
    }
    // Initialize with sample recipes if empty
    const sampleRecipes = initializeSampleRecipes();
    saveRecipes(sampleRecipes);
    
    // Verification: Test calculations match Excel
    const testWater = 45.6; // m³
    const testRecipe = sampleRecipes.find(r => r.recipeName === 'Netajet01 Tank 01');
    if (testRecipe) {
      const phosAcid = testRecipe.fertilizers.find(f => f.name === 'Phosphoric Acid');
      const potSulph = testRecipe.fertilizers.find(f => f.name === 'Potassium Sulphate');
      if (phosAcid) {
        debugLog(
          `Phosphoric Acid: ${phosAcid.kgPerLiter} × ${testWater} = ${(phosAcid.kgPerLiter * testWater).toFixed(3)} kg`
        );
      }
      if (potSulph) {
        debugLog(
          `Potassium Sulphate: ${potSulph.kgPerLiter} × ${testWater} = ${(potSulph.kgPerLiter * testWater).toFixed(3)} kg`
        );
      }
    }
    
    return sampleRecipes;
  } catch (error) {
    debugError('Error loading recipes:', error);
    const sampleRecipes = initializeSampleRecipes();
    saveRecipes(sampleRecipes);
    return sampleRecipes;
  }
};

/**
 * Save recipes to in-memory store
 * @param {Array} recipes - Array of recipe objects
 */
export const saveRecipes = (recipes) => {
  try {
    inMemoryRecipes = JSON.parse(JSON.stringify(recipes));
  } catch (error) {
    debugError('Error saving recipes:', error);
    throw new Error('Failed to save recipes to in-memory store');
  }
};

/**
 * Get all recipes
 * @returns {Array} Array of all recipe objects
 */
export const getAllRecipes = () => {
  return loadRecipes();
};

/**
 * Get recipe by name
 * @param {string} recipeName - Name of the recipe
 * @returns {Object|null} Recipe object or null if not found
 */
export const getRecipeByName = (recipeName) => {
  const recipes = loadRecipes();
  return recipes.find((recipe) => recipe.recipeName === recipeName) || null;
};

/**
 * Get recipe by ID
 * @param {string} id - Recipe ID
 * @returns {Object|null} Recipe object or null if not found
 */
export const getRecipeById = (id) => {
  const recipes = loadRecipes();
  return recipes.find((recipe) => recipe.id === id) || null;
};

/**
 * Search recipes by name or description
 * @param {string} query - Search query
 * @returns {Array} Array of matching recipe objects
 */
export const searchRecipes = (query) => {
  if (!query || query.trim() === '') {
    return getAllRecipes();
  }
  const recipes = loadRecipes();
  const lowerQuery = query.toLowerCase();
  return recipes.filter(
    (recipe) =>
      recipe.recipeName.toLowerCase().includes(lowerQuery) ||
      (recipe.description && recipe.description.toLowerCase().includes(lowerQuery))
  );
};

/**
 * Calculate fertilizer amount in kg using kgPerLiter
 * 
 * Formula: fertilizerKG = KG/L × dailyWaterM3
 * 
 * Where:
 * - KG/L = from recipe database (stock concentration)
 * - dailyWaterM3 = daily irrigation water in cubic meters
 * 
 * Examples:
 * - If KG/L = 0.05, dailyWaterM3 = 45.6 → 0.05 × 45.6 = 2.28 kg
 * - If KG/L = 0.08, dailyWaterM3 = 45.6 → 0.08 × 45.6 = 3.648 kg
 * 
 * @param {number} kgPerLiter - Kilograms per liter from recipe fertilizer object (KG/L column)
 * @param {number} waterM3 - Daily water volume in cubic meters (m³)
 * @returns {number} Daily target amount in kg
 */
export const convertToKg = (kgPerLiter, waterM3) => {
  // Handle zero or invalid values
  if (kgPerLiter === 0) return 0;
  if (!waterM3 || waterM3 <= 0) return 0;
  if (typeof kgPerLiter !== 'number' || isNaN(kgPerLiter)) return 0;
  if (typeof waterM3 !== 'number' || isNaN(waterM3)) return 0;
  
  // Simple formula: KG/L × dailyWaterM3
  const fertilizerKG = kgPerLiter * waterM3;
  
  return fertilizerKG;
};

/**
 * Calculate daily targets for a recipe based on water volume
 * Uses kgPerLiter from fertilizer object (KG/L column)
 * 
 * @param {string} recipeName - Name of the recipe
 * @param {number} waterM3 - Daily water volume in cubic meters (m³)
 * @returns {Object|null} Object with fertilizer names as keys and kg values, or null if recipe not found
 */
export const calculateDailyTargets = (recipeName, waterM3) => {
  const recipe = getRecipeByName(recipeName);
  if (!recipe) {
    debugError(`Recipe "${recipeName}" not found`);
    return null;
  }
  
  // Debug logging for Recipe 1
  if (recipeName === 'Netajet01 Tank 01') {
    debugLog('=== Recipe 1 Calculation Debug ===');
    debugLog('Water volume:', waterM3, 'm³');
    const mgNitrate = recipe.fertilizers.find(f => f.name === 'Magnesium Nitrate');
    if (mgNitrate) {
      debugLog('Magnesium Nitrate kgPerLiter:', mgNitrate.kgPerLiter);
      debugLog('Expected calculation: 0.05 ×', waterM3, '=', 0.05 * waterM3, 'kg');
    }
  }
  
  const targets = {};
  recipe.fertilizers.forEach((fertilizer) => {
    // Formula: fertilizerKG = KG/L × dailyWaterM3
    const kgPerLiter = fertilizer.kgPerLiter || 0;
    
    // Safety check: Warn if kgPerLiter is missing but quantityPer1000L exists
    if (!kgPerLiter && fertilizer.quantityPer1000L) {
      debugWarn(
        `Warning: ${fertilizer.name} has quantityPer1000L (${fertilizer.quantityPer1000L}) but missing kgPerLiter. ` +
        `Using kgPerLiter = 0. DO NOT use quantityPer1000L for calculations!`
      );
    }
    
    // Debug: Log if using wrong value (kgPerLiter > 1 suggests it's using quantityPer1000L)
    if (kgPerLiter > 1 && fertilizer.quantityPer1000L) {
      debugError(
        `ERROR: ${fertilizer.name} has kgPerLiter = ${kgPerLiter} which is too high! ` +
        `This might be using quantityPer1000L (${fertilizer.quantityPer1000L}) instead of kgPerLiter. ` +
        `Expected kgPerLiter should be: ${fertilizer.quantityPer1000L} / 250 = ${(fertilizer.quantityPer1000L / 250).toFixed(5)}`
      );
    }
    
    const calculated = convertToKg(kgPerLiter, waterM3);
    targets[fertilizer.name] = calculated;
    
    // Debug for Recipe 1, Magnesium Nitrate
    if (recipeName === 'Netajet01 Tank 01' && fertilizer.name === 'Magnesium Nitrate') {
      debugLog(`Calculated ${fertilizer.name}: ${kgPerLiter} × ${waterM3} = ${calculated} kg`);
    }
  });
  
  return targets;
};

/**
 * Validate recipe structure
 * @param {Object} recipe - Recipe object to validate
 * @returns {Object} { valid: boolean, errors: Array<string> }
 */
export const validateRecipe = (recipe) => {
  const errors = [];

  // Required fields
  if (!recipe.recipeName || recipe.recipeName.trim() === '') {
    errors.push('Recipe name is required');
  }
  if (!recipe.tankVolume || recipe.tankVolume <= 0) {
    errors.push('Tank volume must be greater than 0');
  }
  if (!recipe.cycles || recipe.cycles <= 0) {
    errors.push('Cycles must be greater than 0');
  }

  // Validate fertilizers array
  if (!Array.isArray(recipe.fertilizers) || recipe.fertilizers.length !== 16) {
    errors.push('Recipe must contain exactly 16 fertilizers');
  } else {
    // Check that all required fertilizers are present
    const fertilizerNames = recipe.fertilizers.map((f) => f.name);
    const requiredNames = FERTILIZER_LIST.map((f) => f.name);
    const missingFertilizers = requiredNames.filter((name) => !fertilizerNames.includes(name));
    if (missingFertilizers.length > 0) {
      errors.push(`Missing fertilizers: ${missingFertilizers.join(', ')}`);
    }

      // Validate each fertilizer
      recipe.fertilizers.forEach((fertilizer, index) => {
        if (!fertilizer.name || fertilizer.name.trim() === '') {
          errors.push(`Fertilizer ${index + 1}: Name is required`);
        }
        // Validate required fields for new structure
        // kgPerLiter is the primary field used for calculations (from KG/L column)
        if (typeof fertilizer.kgPerLiter !== 'number' || fertilizer.kgPerLiter < 0) {
          errors.push(`Fertilizer ${index + 1} (${fertilizer.name}): kgPerLiter must be a non-negative number`);
        }
        if (typeof fertilizer.quantityPer1000L !== 'number' || fertilizer.quantityPer1000L < 0) {
          errors.push(`Fertilizer ${index + 1} (${fertilizer.name}): quantityPer1000L must be a non-negative number`);
        }
        if (typeof fertilizer.dose !== 'number' || fertilizer.dose <= 0) {
          errors.push(`Fertilizer ${index + 1} (${fertilizer.name}): dose must be a positive number`);
        }
        if (typeof fertilizer.tankVolume !== 'number' || fertilizer.tankVolume <= 0) {
          errors.push(`Fertilizer ${index + 1} (${fertilizer.name}): tankVolume must be a positive number`);
        }
        if (!fertilizer.element || fertilizer.element.trim() === '') {
          errors.push(`Fertilizer ${index + 1} (${fertilizer.name}): Element is required`);
        }
      });
  }

  // Validate elementPPM (optional but recommended)
  if (recipe.elementPPM && typeof recipe.elementPPM !== 'object') {
    errors.push('elementPPM must be an object');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

/**
 * Add a new recipe
 * @param {Object} recipe - Recipe object to add
 * @returns {Object} { success: boolean, message: string, recipe: Object|null }
 */
export const addRecipe = (recipe) => {
  try {
    // Validate recipe
    const validation = validateRecipe(recipe);
    if (!validation.valid) {
      return {
        success: false,
        message: `Validation failed: ${validation.errors.join(', ')}`,
        recipe: null,
      };
    }

    // Check for duplicate name
    const existing = getRecipeByName(recipe.recipeName);
    if (existing) {
      return {
        success: false,
        message: `Recipe with name "${recipe.recipeName}" already exists`,
        recipe: null,
      };
    }

    // Generate ID
    const recipes = loadRecipes();
    const newRecipe = {
      ...recipe,
      id: `recipe-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    recipes.push(newRecipe);
    saveRecipes(recipes);

    return {
      success: true,
      message: 'Recipe added successfully',
      recipe: newRecipe,
    };
  } catch (error) {
    debugError('Error adding recipe:', error);
    return {
      success: false,
      message: `Failed to add recipe: ${error.message}`,
      recipe: null,
    };
  }
};

/**
 * Update an existing recipe
 * @param {string} id - Recipe ID
 * @param {Object} updatedRecipe - Updated recipe object
 * @returns {Object} { success: boolean, message: string, recipe: Object|null }
 */
export const updateRecipe = (id, updatedRecipe) => {
  try {
    // Validate recipe
    const validation = validateRecipe(updatedRecipe);
    if (!validation.valid) {
      return {
        success: false,
        message: `Validation failed: ${validation.errors.join(', ')}`,
        recipe: null,
      };
    }

    const recipes = loadRecipes();
    const index = recipes.findIndex((r) => r.id === id);
    if (index === -1) {
      return {
        success: false,
        message: 'Recipe not found',
        recipe: null,
      };
    }

    // Check for duplicate name (if name changed)
    if (recipes[index].recipeName !== updatedRecipe.recipeName) {
      const existing = getRecipeByName(updatedRecipe.recipeName);
      if (existing && existing.id !== id) {
        return {
          success: false,
          message: `Recipe with name "${updatedRecipe.recipeName}" already exists`,
          recipe: null,
        };
      }
    }

    const updated = {
      ...updatedRecipe,
      id,
      createdAt: recipes[index].createdAt, // Preserve original creation date
      updatedAt: new Date().toISOString(),
    };

    recipes[index] = updated;
    saveRecipes(recipes);

    return {
      success: true,
      message: 'Recipe updated successfully',
      recipe: updated,
    };
  } catch (error) {
    debugError('Error updating recipe:', error);
    return {
      success: false,
      message: `Failed to update recipe: ${error.message}`,
      recipe: null,
    };
  }
};

/**
 * Delete a recipe
 * @param {string} id - Recipe ID
 * @returns {Object} { success: boolean, message: string }
 */
export const deleteRecipe = (id) => {
  try {
    const recipes = loadRecipes();
    const index = recipes.findIndex((r) => r.id === id);
    if (index === -1) {
      return {
        success: false,
        message: 'Recipe not found',
      };
    }

    recipes.splice(index, 1);
    saveRecipes(recipes);

    return {
      success: true,
      message: 'Recipe deleted successfully',
    };
  } catch (error) {
    debugError('Error deleting recipe:', error);
    return {
      success: false,
      message: `Failed to delete recipe: ${error.message}`,
    };
  }
};

/**
 * Export recipes to JSON file
 * @param {string} filename - Optional filename (default: 'recipes_export.json')
 */
export const exportRecipesToJSON = (filename = 'recipes_export.json') => {
  try {
    const recipes = loadRecipes();
    const jsonString = JSON.stringify(recipes, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return { success: true, message: 'Recipes exported successfully' };
  } catch (error) {
    debugError('Error exporting recipes:', error);
    return { success: false, message: `Failed to export recipes: ${error.message}` };
  }
};

/**
 * Import recipes from JSON file
 * @param {File} file - JSON file to import
 * @returns {Promise<Object>} { success: boolean, message: string, imported: number }
 */
export const importRecipesFromJSON = (file) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importedRecipes = JSON.parse(e.target.result);
        if (!Array.isArray(importedRecipes)) {
          resolve({
            success: false,
            message: 'Invalid file format: Expected an array of recipes',
            imported: 0,
          });
          return;
        }

        // Validate all recipes
        const validRecipes = [];
        const errors = [];
        importedRecipes.forEach((recipe, index) => {
          const validation = validateRecipe(recipe);
          if (validation.valid) {
            validRecipes.push(recipe);
          } else {
            errors.push(`Recipe ${index + 1}: ${validation.errors.join(', ')}`);
          }
        });

        if (validRecipes.length === 0) {
          resolve({
            success: false,
            message: `No valid recipes found. Errors: ${errors.join('; ')}`,
            imported: 0,
          });
          return;
        }

        // Merge with existing recipes (avoid duplicates by name)
        const existingRecipes = loadRecipes();
        const existingNames = new Set(existingRecipes.map((r) => r.recipeName));
        let added = 0;
        let skipped = 0;

        validRecipes.forEach((recipe) => {
          if (existingNames.has(recipe.recipeName)) {
            skipped++;
          } else {
            recipe.id = `recipe-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            recipe.createdAt = new Date().toISOString();
            recipe.updatedAt = new Date().toISOString();
            existingRecipes.push(recipe);
            existingNames.add(recipe.recipeName);
            added++;
          }
        });

        saveRecipes(existingRecipes);

        resolve({
          success: true,
          message: `Imported ${added} recipe(s), skipped ${skipped} duplicate(s)`,
          imported: added,
          errors: errors.length > 0 ? errors : undefined,
        });
      } catch (error) {
        debugError('Error importing recipes:', error);
        resolve({
          success: false,
          message: `Failed to parse JSON file: ${error.message}`,
          imported: 0,
        });
      }
    };
    reader.onerror = () => {
      resolve({
        success: false,
        message: 'Failed to read file',
        imported: 0,
      });
    };
    reader.readAsText(file);
  });
};

/**
 * Create a new empty recipe template
 * @returns {Object} Empty recipe template with all 16 fertilizers set to 0
 */
export const createEmptyRecipe = () => {
  return {
    recipeName: '',
    description: '',
    tankVolume: 1000,
    cycles: 15,
    fertilizers: FERTILIZER_LIST.map((fertilizer) => ({
      name: fertilizer.name,
      quantityPer1000L: 0,
      dose: 1,
      tankVolume: 250,
      kgPerLiter: 0,
      gPerLiter: 0,
      element: fertilizer.element,
      concentration: fertilizer.concentration,
    })),
    elementPPM: {},
  };
};
