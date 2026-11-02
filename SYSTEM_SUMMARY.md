# Al Maha Farm Management System - Complete Summary

## System Overview
A comprehensive farm management system built with React and Material-UI for managing farm operations, harvest data, fertigation, and master data.

## Technology Stack
- **React.js** - Frontend framework
- **Material-UI (MUI)** - UI component library
- **React Router DOM** - Client-side routing
- **Formik** - Form state management
- **Yup** - Form validation
- **localStorage** - Client-side data persistence
- **SheetJS (xlsx)** - Excel import/export
- **recharts** - Data visualization
- **file-saver** - File download functionality

## System Architecture

### 1. Master Data Management (`/manage/*`)
- **Countries & Sites** (`/manage/countries`) - Manage farm hierarchy
- **Farm Areas & Crops** (`/manage/farm-areas`) - Manage farm areas and crop assignments
- **Field Types & Names** (`/manage/field-types`) - Manage fields with crop rotation history
- **Valves Configuration** (`/manage/valves`) - Configure valves for fields

**Data Structure (localStorage: 'farmMasterData'):**
```javascript
{
  countries: [
    {
      id: 1,
      name: "Saudi Arabia",
      code: "SA",
      sites: [
        {
          id: 1,
          name: "Al Maha Farm - Riyadh",
          totalArea: 15,
          farmAreas: [
            {
              id: 1,
              name: "Tomato Area",
              size: 8,
              crops: ["Tomato", "Capsicum"],
              fields: [
                {
                  name: "NH-01",
                  type: "NetHouse",
                  currentCrop: "Tomato",
                  cropHistory: [
                    { crop: "Capsicum", startDate: "2024-01-15", endDate: "2024-06-20" },
                    { crop: "Tomato", startDate: "2024-06-21", endDate: null }
                  ],
                  valves: 4
                }
              ]
            }
          ]
        }
      ]
    }
  ],
  crops: ["Tomato", "Capsicum", "Sweet Corn", "Figs"],
  fieldTypes: [...]
}
```

### 2. EC/PH Entry Form (`/ecph-entry`)
- 15 fields matching Excel template
- Auto-calculations: %Drain, Total Water QTY, Total Water QTY Based on Drip Volume
- Saves to localStorage: 'ecphData'
- Real-time calculations and validation

### 3. Harvest Management (`/harvest/*`)
- **Entry** (`/harvest/entry`) - Daily harvest entry with multi-variety input
- **Dashboard** (`/harvest/dashboard`) - Charts, tables, filters, Excel export
- **Reports** (`/harvest/reports`) - Daily/weekly reports and data export

**Data Structure (localStorage: 'harvestData'):**
```javascript
[
  {
    id: 1,
    date: "2024-01-21",
    countryId: 1,
    siteId: 1,
    farmAreaId: 1,
    fieldId: "NH-01",
    currentCrop: "Tomato",
    varieties: [
      { variety: "Plum Tomato", quantity: 32.5, grade: "A" }
    ],
    totalQuantity: 32.5, // kg
    notes: "Morning harvest"
  }
]
```

### 4. Fertigation Management (`/fertigation/*`)

#### Recipe Database (`src/data/recipeDatabase.js`)
**CRITICAL FORMULA:**
```
Fertilizer (kg) = kgPerLiter × Daily Water (m³)
Where: kgPerLiter = quantityPer1000L ÷ tankVolume (250)
```

**Recipe Structure:**
```javascript
{
  id: 'recipe-001',
  recipeName: 'Netajet01 Tank 01',
  description: 'For vegetative stage tomatoes',
  tankVolume: 1000,
  cycles: 15,
  fertilizers: [
    {
      name: 'Phosphoric Acid',
      quantityPer1000L: 5.000,  // Reference only
      dose: 1,
      tankVolume: 250,
      kgPerLiter: 0.020,        // USED FOR CALCULATIONS (5.000 / 250)
      gPerLiter: 20,            // Reference
      element: 'P',
      concentration: 85
    },
    // ... all 16 fertilizers
  ],
  elementPPM: { P: 78, K: 285, ... }
}
```

**Recipe 1 (Netajet01 Tank 01) - Correct Values:**
- Phosphoric Acid: kgPerLiter = 0.020 (5.000 / 250)
- Potassium Sulphate: kgPerLiter = 0.050 (12.5 / 250)
- Magnesium Nitrate: kgPerLiter = 0.050 (12.5 / 250)
- Potassium Nitrate: kgPerLiter = 0.058 (14.5 / 250)
- Calcium Nitrate: kgPerLiter = 0.080 (20 / 250)
- Iron Chelate: kgPerLiter = 0.003 (0.75 / 250)
- All others: kgPerLiter = 0

**Key Functions:**
- `convertToKg(kgPerLiter, waterM3)` - Returns: `kgPerLiter × waterM3`
- `calculateDailyTargets(recipeName, waterM3)` - Returns object with all 16 fertilizer amounts
- `loadRecipes()` - Loads from localStorage with automatic migration
- `migrateRecipeData(recipes)` - Fixes incorrect kgPerLiter values automatically

#### Fertigation Entry (`/fertigation/entry`)
- Hierarchical selection: Country → Site → Farm Area → Field
- Water calculation: Daily Water (m³) = Flow Rate × Frequency × Valves Count
- Recipe selection with auto-calculation of all 16 fertilizers
- Real-time display table showing calculated amounts
- Saves to localStorage: 'fertigationData'

**Data Structure:**
```javascript
{
  id: "fert_123456",
  date: "2024-01-22",
  fieldId: "NH-01",
  flowRate: 148,
  frequency: 3,
  valvesCount: 4,
  dailyWater: 1776, // m³
  recipeName: "Netajet01 Tank 01",
  fertilizers: {
    "Phosphoric Acid": 35.52, // kg = 0.020 × 1776
    "Potassium Sulphate": 88.8, // kg = 0.050 × 1776
    // ... all 16 calculated amounts
  },
  totalFertilizer: 156.8, // kg
  cumulative: {
    fertilizers: { ... } // in tons
  }
}
```

#### Fertigation Dashboard (`/fertigation/dashboard`)
- Summary cards: Total Water, Total Fertilizer, Average Daily Usage
- Charts: Water Usage, Fertilizer Composition, Cumulative Usage
- Data table with all entries
- Excel export functionality

### 5. Navigation Structure
```
AppBar Navigation:
├── Home
├── EC/PH Entry
├── Master Data ▼
│   ├── Countries & Sites
│   ├── Farm Areas & Crops
│   ├── Field Types & Names
│   └── Valves Configuration
├── Harvest ▼
│   ├── Entry
│   ├── Dashboard
│   └── Reports
└── Fertigation ▼
    ├── Entry
    └── Dashboard
```

## Key Utility Files

### `src/utils/masterDataUtils.js`
- `loadMasterData()` - Loads farm hierarchy from localStorage
- `saveMasterData(data)` - Saves farm hierarchy
- `generateId()` - Generates unique IDs
- `exportToExcel(data, filename)` - Exports data to Excel
- `migrateFieldData(data)` - Migrates old field structure to new with crop history

### `src/data/recipeDatabase.js`
- `FERTILIZER_LIST` - Array of 16 standard fertilizers
- `loadRecipes()` - Loads recipes with automatic migration
- `getAllRecipes()` - Returns all recipes
- `getRecipeByName(name)` - Returns specific recipe
- `calculateDailyTargets(recipeName, waterM3)` - Calculates fertilizer amounts
- `convertToKg(kgPerLiter, waterM3)` - Core calculation function
- `migrateRecipeData(recipes)` - Fixes incorrect kgPerLiter values
- `forceResetRecipes()` - Force resets recipes to correct values

## Important Formulas

### Fertigation Calculation
```
Daily Water (m³) = Flow Rate × Frequency × Valves Count
Fertilizer (kg) = kgPerLiter × Daily Water (m³)
Where: kgPerLiter = quantityPer1000L ÷ tankVolume (250)
```

### Example Calculation
For 45.6 m³ water:
- Phosphoric Acid: 0.020 × 45.6 = 0.912 kg ✓
- Potassium Sulphate: 0.050 × 45.6 = 2.280 kg ✓

### Harvest Conversion
```
1 ton = 1000 kg
Yield (Ton) = Yield (kg) ÷ 1000
```

## Data Storage Keys (localStorage)
- `'farmMasterData'` - Master data (countries, sites, farm areas, fields)
- `'ecphData'` - EC/PH entry data
- `'harvestData'` - Harvest entry data
- `'fertigationData'` - Fertigation entry data
- `'recipeDatabase'` - Recipe database

## Recent Fixes & Updates

### Recipe Database (Latest)
- ✅ Fixed all kgPerLiter values to match Excel
- ✅ Added automatic migration function to fix incorrect values
- ✅ Formula: kgPerLiter = quantityPer1000L ÷ 250
- ✅ All calculations use kgPerLiter (NOT quantityPer1000L)

### Fertigation Entry
- ✅ Real-time calculation display
- ✅ Table shows kgPerLiter values correctly
- ✅ Total row with sum of all fertilizers
- ✅ Validation warnings for zero/unusual amounts

### Fertigation Dashboard
- ✅ Simplified to show only calculated amounts
- ✅ Removed all "Actual vs Target" comparisons
- ✅ Excel export matches input format

## File Structure
```
src/
├── pages/
│   ├── Home.js
│   ├── ECPHEntry.js
│   ├── CountriesSitesManagement.js
│   ├── FarmAreasCropsManagement.js
│   ├── FieldTypesNamesManagement.js
│   ├── ValvesConfiguration.js
│   ├── HarvestEntry.js
│   ├── harvest/
│   │   └── HarvestDashboard.js
│   ├── HarvestReports.js
│   └── fertigation/
│       ├── FertigationEntry.js
│       └── FertigationDashboard.js
├── data/
│   └── recipeDatabase.js
├── utils/
│   └── masterDataUtils.js
└── App.js
```

## Next Steps / Known Areas
- Recipe database has 3 sample recipes (Tank 01, 02, 03)
- All calculations verified and working correctly
- Migration function automatically fixes incorrect values in localStorage
- System is production-ready for basic operations

## Testing Verification
To verify calculations are correct:
1. Open browser console
2. Check for migration warnings when loading recipes
3. Test with 45.6 m³ water:
   - Phosphoric Acid should show: 0.912 kg
   - Potassium Sulphate should show: 2.280 kg
