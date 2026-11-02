import {
  buildReferenceSeedRows,
  isGeneralReferenceSheet,
  normalizeStoredSheet,
  referenceSheetForActivity,
  resolveRowSheetId,
} from '../manpowerReferenceSheets';

describe('referenceSheetForActivity', () => {
  it('classifies harvest, prep, maintenance, and general', () => {
    expect(referenceSheetForActivity('Harvesting')).toBe('harvest');
    expect(referenceSheetForActivity('Bed Preparation')).toBe('preparation');
    expect(referenceSheetForActivity('Lowering')).toBe('crop_maintenance');
    expect(referenceSheetForActivity('Supervisor')).toBe('general');
    expect(referenceSheetForActivity('Irrigation & Plant Checking')).toBe('crop_maintenance');
    expect(isGeneralReferenceSheet('general')).toBe(true);
  });
});

describe('buildReferenceSeedRows', () => {
  const catalog = [
    { name: 'Supervisor', default_unit: 'hours' },
    { name: 'Harvesting', default_unit: 'Box' },
    { name: 'Lowering', default_unit: 'Bed' },
  ];

  it('repeats field activities per crop and keeps general crop-blank', () => {
    const rows = buildReferenceSeedRows(catalog, ['Tomato Plum', 'Eggplant']);
    expect(rows).toEqual([
      { activity: 'Supervisor', crop: null, unit: 'hours', sheet: 'general' },
      { activity: 'Harvesting', crop: 'Tomato Plum', unit: 'Box', sheet: 'harvest' },
      { activity: 'Harvesting', crop: 'Eggplant', unit: 'Box', sheet: 'harvest' },
      { activity: 'Lowering', crop: 'Tomato Plum', unit: 'Bed', sheet: 'crop_maintenance' },
      { activity: 'Lowering', crop: 'Eggplant', unit: 'Bed', sheet: 'crop_maintenance' },
    ]);
  });

  it('is stable for the same catalog and crops', () => {
    expect(buildReferenceSeedRows(catalog, ['Tomato Plum'])).toEqual(
      buildReferenceSeedRows(catalog, ['Tomato Plum']),
    );
  });

  it('does not invent targets or variety rows', () => {
    const rows = buildReferenceSeedRows(catalog, ['Tomato Plum']);
    rows.forEach((row) => {
      expect(row).not.toHaveProperty('target');
      expect(row).not.toHaveProperty('variety');
    });
  });
});

describe('resolveRowSheetId', () => {
  it('uses a stored sheet over the activity name classifier', () => {
    expect(resolveRowSheetId({ activity: 'Harvesting', sheet: 'crop_maintenance' })).toBe('crop_maintenance');
    expect(resolveRowSheetId({ activity: 'Harvesting' })).toBe('harvest');
    expect(resolveRowSheetId({ activity: 'Harvesting', sheet: 'Pack House' })).toBe('pack_house');
  });

  it('treats Harvest as the built-in harvest sheet', () => {
    expect(normalizeStoredSheet('Harvest', 'Clipping')).toBe('harvest');
    expect(normalizeStoredSheet('', 'Harvesting')).toBe('harvest');
  });
});
