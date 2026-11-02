// Utility functions for Master Data Management
import {
  fetchCountries,
  fetchSites,
  fetchFarmAreas,
  fetchFields,
  fetchCrops,
  fetchFieldTypes,
} from './backendApi';

let inMemoryMasterData = null;

// Initialize default data structure
export const getDefaultData = () => ({
  countries: [],
  crops: [
    { name: 'Tomato', dripper_count: 24000 },
    { name: 'Capsicum', dripper_count: 30000 },
    { name: 'Sweet Corn', dripper_count: null },
    { name: 'Figs', dripper_count: null },
  ],
  fieldTypes: [
    {
      id: 1,
      name: 'NetHouse',
      namingPattern: 'NH-{01}',
      defaultValveCount: 4,
      fieldNames: []
    },
    {
      id: 2,
      name: 'Greenhouse',
      namingPattern: 'GH-{01}',
      defaultValveCount: 2,
      fieldNames: []
    },
    {
      id: 3,
      name: 'Open Field',
      namingPattern: 'Block-{A}',
      defaultValveCount: 0,
      fieldNames: []
    }
  ]
});

// Migrate crops from array to objects with dripper_count
const migrateCropsData = (data) => {
  // If crops is already an array of objects, it's already migrated
  if (data.crops && data.crops.length > 0 && typeof data.crops[0] === 'object') {
    return data;
  }
  
  // Migrate crops from array of strings to array of objects
  if (Array.isArray(data.crops)) {
    const defaultDripperCounts = {
      'Tomato': 24000,
      'Capsicum': 30000,
      'Sweet Corn': null,
      'Figs': null,
    };
    
    data.crops = data.crops.map((crop) => {
      if (typeof crop === 'string') {
        return {
          name: crop,
          dripper_count: defaultDripperCounts[crop] !== undefined ? defaultDripperCounts[crop] : null,
        };
      }
      // If already an object but missing dripper_count, add it
      if (typeof crop === 'object' && !crop.hasOwnProperty('dripper_count')) {
        return {
          ...crop,
          dripper_count: defaultDripperCounts[crop.name] !== undefined ? defaultDripperCounts[crop.name] : null,
        };
      }
      return crop;
    });
  }
  
  return data;
};

// Migrate field data structure from old format to new format with crop history
const migrateFieldData = (data) => {
  if (!data.countries) return data;
  
  const migrateField = (field) => {
    // If field already has currentCrop, it's already migrated
    if (field.currentCrop !== undefined) return field;
    
    // Migrate old format to new format
    const migratedField = {
      ...field,
      currentCrop: field.crop || null,
      cropHistory: field.crop
        ? [
            {
              crop: field.crop,
              startDate: new Date().toISOString().split('T')[0], // Today as default
              endDate: null, // Current crop
            },
          ]
        : [],
    };
    
    // Remove old crop field
    delete migratedField.crop;
    
    return migratedField;
  };

  const migratedData = {
    ...data,
    countries: data.countries.map((country) => ({
      ...country,
      sites: country.sites.map((site) => ({
        ...site,
        farmAreas: (site.farmAreas || []).map((farmArea) => ({
          ...farmArea,
          fields: (farmArea.fields || []).map(migrateField),
        })),
      })),
    })),
  };

  return migratedData;
};

// Load data from backend API (fallback to memory/defaults)
export const loadMasterData = async () => {
  try {
    const results = await Promise.allSettled([
      fetchCountries(),
      fetchSites(),
      fetchFarmAreas(),
      fetchFields(),
      fetchCrops(),
      fetchFieldTypes(),
    ]);

    const settled = results.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      console.warn(`loadMasterData: fetch #${i} failed:`, r.reason?.message || r.reason);
      return [];
    });

    const [countries, sites, farmAreas, fields, crops, fieldTypes] = settled;

    const cropNameMap = new Map(crops.map((crop) => [crop.id, crop.name]));
    const fieldTypeMap = new Map(fieldTypes.map((ft) => [ft.id, ft.name]));
    const farmAreaMap = new Map(farmAreas.map((fa) => [fa.id, { ...fa, fields: [] }]));
    const siteMap = new Map(sites.map((s) => [s.id, { ...s, farmAreas: [] }]));
    const countryMap = new Map(countries.map((c) => [c.id, { ...c, sites: [] }]));

    fields.forEach((field) => {
      const cropId = field.currentCropId || field.current_crop_id;
      const currentCropName = cropId ? cropNameMap.get(cropId) : null;
      const enrichedField = {
        ...field,
        currentCrop: currentCropName || field.currentCrop || field.current_crop || field.crop || null,
        type: field.fieldTypeId ? fieldTypeMap.get(field.fieldTypeId) : field.type,
        cropHistory: field.cropHistory || [],
      };
      const farmArea = farmAreaMap.get(field.farmAreaId);
      if (farmArea) {
        farmArea.fields.push(enrichedField);
      }
    });

    farmAreaMap.forEach((farmArea) => {
      const site = siteMap.get(farmArea.siteId);
      if (site) {
        site.farmAreas.push(farmArea);
      }
    });

    siteMap.forEach((site) => {
      const country = countryMap.get(site.countryId);
      if (country) {
        country.sites.push(site);
      }
    });

    return {
      countries: Array.from(countryMap.values()),
      crops: crops.map((crop) => ({
        ...crop,
        dripper_count: crop.dripperCount ?? crop.dripper_count,
        plant_count: crop.plantCount ?? crop.plant_count,
        drip_test_count: crop.dripTestCount ?? crop.drip_test_count,
      })),
      fieldTypes,
    };
  } catch (error) {
    console.error('Error loading master data:', error);
    if (inMemoryMasterData) {
      const data = inMemoryMasterData;
      if (!data.fieldTypes || data.fieldTypes.length === 0) {
        data.fieldTypes = getDefaultData().fieldTypes;
      }
      const cropsMigrated = migrateCropsData(data);
      const migratedData = migrateFieldData(cropsMigrated);
      inMemoryMasterData = migratedData;
      return migratedData;
    }
    return getDefaultData();
  }
};

// Helper function to get crop dripper_count
export const getCropDripperCount = (masterData, cropName) => {
  if (!masterData || !masterData.crops || !cropName) return null;
  const crop = masterData.crops.find((c) => 
    typeof c === 'object' ? c.name === cropName : c === cropName
  );
  if (typeof crop === 'object' && crop.dripper_count !== undefined) {
    return crop.dripper_count;
  }
  // Fallback for old string format or default values
  const defaults = {
    'Tomato': 24000,
    'Capsicum': 30000,
    'Sweet Corn': null,
    'Figs': null,
  };
  return defaults[cropName] !== undefined ? defaults[cropName] : null;
};

// Helper function to get crop plant count (scouting infestation, etc.)
export const getCropPlantCount = (masterData, cropName) => {
  if (!masterData || !masterData.crops || !cropName) return null;
  const crop = masterData.crops.find((c) =>
    typeof c === 'object' ? c.name === cropName : c === cropName
  );
  if (typeof crop === 'object') {
    if (crop.plant_count != null && crop.plant_count !== '') return crop.plant_count;
    if (crop.plantCount != null && crop.plantCount !== '') return crop.plantCount;
    // Fallback for crops not yet given an explicit plant count
    return getCropDripperCount(masterData, cropName);
  }
  const defaults = {
    Tomato: 24000,
    Capsicum: 30000,
  };
  return defaults[cropName] !== undefined ? defaults[cropName] : null;
};

// Helper function to get crop drip_test_count (emitters per grow bag test)
// e.g., Tomato=12, Capsicum=15, Sweet Corn=5
export const getCropDripTestCount = (masterData, cropName) => {
  if (!masterData || !masterData.crops || !cropName) return null;
  const crop = masterData.crops.find((c) =>
    typeof c === 'object' ? c.name === cropName : c === cropName
  );
  if (typeof crop === 'object' && crop.drip_test_count !== undefined && crop.drip_test_count !== null) {
    return crop.drip_test_count;
  }
  if (typeof crop === 'object' && crop.dripTestCount !== undefined && crop.dripTestCount !== null) {
    return crop.dripTestCount;
  }
  return null;
};

// Save data to in-memory store
export const saveMasterData = (data) => {
  try {
    inMemoryMasterData = data;
    return true;
  } catch (error) {
    console.error('Error saving master data:', error);
    return false;
  }
};

// Generate unique ID
export const generateId = () => {
  return Date.now() + Math.random();
};

// Export to Excel helper
export const exportToExcel = (data, filename) => {
  if (!data || data.length === 0) {
    console.warn('No data to export');
    return;
  }
  // Loaded on demand: xlsx is ~400 KB and only needed when someone exports.
  return import('xlsx').then((XLSX) => {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, `${filename}.xlsx`);
  });
};
