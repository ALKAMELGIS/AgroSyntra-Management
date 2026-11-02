import {
  isGeneralReferenceSheet,
  matchSheetName,
  referenceSheetForActivity,
  resolveRowSheetId,
  rowMatchesSheet,
  visibleReferenceSheets,
} from '../utils/manpowerReferenceSheets';

const CATALOG = [
  'Uprooting, Rope Cutting & Plant Arrange',
  'Hook Collection & Loading',
  'Weeding & Cleaning',
  'Micro Drip Removing',
  'Root Cleaning',
  'Toilet Cleaning',
  'EC & PH Measuring',
  'Supervisor',
  'Scouting',
  'Irrigation & Other Job Working',
  'Harvesting Crates Cleaning',
  'Harvesting Crates/Pallet Arranging',
  'Harvesting',
  'Product loading and transportation',
  'Irrigation Operator & fertigation Mixing',
  'Water Distribution',
  'Operator Manitou',
  'Forecasting Harvest',
  'Data Entry',
  'Transportation',
  'Maintenance',
  'Cocopit Loading',
  'Hook Making',
  'Hook Installation',
  'Seeds Sowing',
  'Fig Planting',
  'Spray Supervisor',
  'Spray',
  'Irrigation & Plant Checking',
  'Side Shoot Trellising',
  'Leaf Cleaning',
  'Leaf Pruning',
  'Lowering',
  'Bed Preparation',
  'No Work',
  'Crate Washing',
  'Office',
  'IPM',
  'Planting',
  'Clipping',
];

describe('referenceSheetForActivity', () => {
  it('puts harvest work on Harvest', () => {
    expect(referenceSheetForActivity('Harvesting')).toBe('harvest');
    expect(referenceSheetForActivity('Harvesting Crates Cleaning')).toBe('harvest');
    expect(referenceSheetForActivity('Forecasting Harvest')).toBe('harvest');
  });

  it('puts prep work on Preparation', () => {
    expect(referenceSheetForActivity('Bed Preparation')).toBe('preparation');
    expect(referenceSheetForActivity('Hook Making')).toBe('preparation');
    expect(referenceSheetForActivity('Fig Planting')).toBe('preparation');
    expect(referenceSheetForActivity('Uprooting, Rope Cutting & Plant Arrange')).toBe('preparation');
  });

  it('puts field upkeep on Crop maintenance', () => {
    expect(referenceSheetForActivity('Lowering')).toBe('crop_maintenance');
    expect(referenceSheetForActivity('Leaf Pruning')).toBe('crop_maintenance');
    expect(referenceSheetForActivity('Spray')).toBe('crop_maintenance');
    expect(referenceSheetForActivity('Irrigation & Plant Checking')).toBe('crop_maintenance');
    expect(referenceSheetForActivity('Weeding & Cleaning')).toBe('crop_maintenance');
  });

  it('puts site-wide jobs on General', () => {
    expect(referenceSheetForActivity('Supervisor')).toBe('general');
    expect(referenceSheetForActivity('Crate Washing')).toBe('general');
    expect(referenceSheetForActivity('Irrigation & Other Job Working')).toBe('general');
    expect(referenceSheetForActivity('No Work')).toBe('general');
    expect(isGeneralReferenceSheet('general')).toBe(true);
  });

  it('classifies every catalog name', () => {
    const sheets = new Set(CATALOG.map((n) => referenceSheetForActivity(n)));
    expect(sheets.has('preparation')).toBe(true);
    expect(sheets.has('harvest')).toBe(true);
    expect(sheets.has('crop_maintenance')).toBe(true);
    expect(sheets.has('general')).toBe(true);
    CATALOG.forEach((n) => {
      expect(['preparation', 'harvest', 'crop_maintenance', 'general']).toContain(referenceSheetForActivity(n));
    });
  });
});

describe('stored sheet membership', () => {
  it('keeps a moved row on the chosen sheet', () => {
    const row = { activity: 'Harvesting', sheet: 'crop_maintenance' };
    expect(resolveRowSheetId(row)).toBe('crop_maintenance');
    expect(rowMatchesSheet(row, 'harvest')).toBe(false);
    expect(rowMatchesSheet(row, 'crop_maintenance')).toBe(true);
  });

  it('adds a custom tab and maps Harvest to the built-in sheet', () => {
    const rows = [{ activity: 'Harvesting', sheet: 'Pack House' }];
    const tabs = visibleReferenceSheets(rows);
    expect(tabs.map((t) => t.id)).toContain('pack_house');
    expect(matchSheetName('Harvest', tabs)).toMatchObject({ id: 'harvest', isNew: false });
    expect(matchSheetName('Pack House', tabs)).toMatchObject({ id: 'pack_house', isNew: false });
    expect(matchSheetName('Irrigation extras', tabs)).toMatchObject({
      id: 'irrigation_extras',
      stored: 'Irrigation extras',
      isNew: true,
    });
  });
});
