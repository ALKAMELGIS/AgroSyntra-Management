import {
  defaultPlantedCropId,
  defaultPlantedVariety,
  plantedCropsAndVarietiesForField,
  uniqueVarietiesOnField,
  varietiesForPlantedCrop,
} from '../harvestFieldPlanting';

const FIELD = {
  id: 'f1',
  currentCropId: 'crop-capsicum',
  currentCrop: 'Capsicum',
  varietyName: 'Marletta F1',
};

describe('plantedCropsAndVarietiesForField', () => {
  it('falls back to the field current crop and variety', () => {
    const planted = plantedCropsAndVarietiesForField(FIELD, [], []);
    expect(planted.crops).toEqual([{ id: 'crop-capsicum', name: 'Capsicum' }]);
    expect(planted.varietiesByCrop['crop-capsicum']).toEqual(['Marletta F1']);
  });

  it('uses open crop history and ignores closed rotations of other crops', () => {
    const planted = plantedCropsAndVarietiesForField(FIELD, [
      {
        id: 'ch-old',
        field_id: 'f1',
        crop_id: 'crop-tomato',
        crop_name: 'Tomato',
        variety_name: 'Elpida',
        end_date: '2026-01-01',
      },
      {
        id: 'ch-open',
        field_id: 'f1',
        crop_id: 'crop-capsicum',
        crop_name: 'Capsicum',
        variety_name: 'Marletta F1',
        end_date: null,
      },
    ], []);
    expect(planted.crops).toEqual([{ id: 'crop-capsicum', name: 'Capsicum' }]);
    expect(planted.varietiesByCrop['crop-capsicum']).toEqual(['Marletta F1']);
  });

  it('includes planting varieties even when crop_history_id is a closed rotation', () => {
    const planted = plantedCropsAndVarietiesForField({
      id: 'f1',
      currentCropId: 'crop-yellow',
      currentCrop: 'Capsicum Yellow',
    }, [
      {
        id: 'ch-open',
        field_id: 'f1',
        crop_id: 'crop-yellow',
        crop_name: 'Capsicum Yellow',
        variety_name: null,
        end_date: null,
      },
    ], [
      {
        field_id: 'f1',
        crop_id: 'crop-yellow',
        crop_name: 'Capsicum Yellow',
        variety_name: 'Sven RZ',
        crop_history_id: 'ch-closed',
      },
      {
        field_id: 'f1',
        crop_id: 'crop-yellow',
        crop_name: 'Capsicum Yellow',
        variety_name: 'Bachata F1',
        crop_history_id: 'ch-closed',
      },
    ]);
    expect(planted.crops).toEqual([{ id: 'crop-yellow', name: 'Capsicum Yellow' }]);
    expect(planted.varietiesByCrop['crop-yellow']).toEqual(['Sven RZ', 'Bachata F1']);
  });

  it('merges field varietyName onto the current crop', () => {
    const planted = plantedCropsAndVarietiesForField({
      ...FIELD,
      varietyName: 'Sven RZ',
    }, [
      {
        id: 'ch-open',
        field_id: 'f1',
        crop_id: 'crop-capsicum',
        crop_name: 'Capsicum',
        end_date: null,
      },
    ], []);
    expect(planted.varietiesByCrop['crop-capsicum']).toEqual(['Sven RZ']);
  });

  it('includes planting records when there is no open crop history', () => {
    const planted = plantedCropsAndVarietiesForField(FIELD, [
      {
        id: 'ch-old',
        field_id: 'f1',
        crop_id: 'crop-capsicum',
        crop_name: 'Capsicum',
        variety_name: 'Old',
        end_date: '2026-01-01',
      },
    ], [
      {
        field_id: 'f1',
        crop_id: 'crop-capsicum',
        variety_name: 'Sven RZ',
      },
      {
        field_id: 'f1',
        crop_id: 'crop-capsicum',
        variety_name: 'Bachata F1',
      },
    ]);
    expect(planted.varietiesByCrop['crop-capsicum']).toEqual(['Sven RZ', 'Bachata F1', 'Marletta F1']);
  });

  it('lists two current crops from open history', () => {
    const planted = plantedCropsAndVarietiesForField(FIELD, [
      {
        id: 'ch-a',
        field_id: 'f1',
        crop_id: 'crop-capsicum',
        crop_name: 'Capsicum',
        variety_name: 'Marletta F1',
        end_date: null,
      },
      {
        id: 'ch-b',
        field_id: 'f1',
        crop_id: 'crop-tomato',
        crop_name: 'Tomato',
        variety_name: 'Elpida',
        end_date: null,
      },
    ], []);
    expect(planted.crops.map((c) => c.name)).toEqual(['Capsicum', 'Tomato']);
    expect(planted.varietiesByCrop['crop-tomato']).toEqual(['Elpida']);
  });

  it('ignores planting records on other fields', () => {
    const planted = plantedCropsAndVarietiesForField(FIELD, [], [
      {
        field_id: 'f2',
        crop_id: 'crop-onion',
        crop_name: 'Onion',
        variety_name: 'Red',
      },
    ]);
    expect(planted.crops).toEqual([{ id: 'crop-capsicum', name: 'Capsicum' }]);
  });

  it('matches field ids as strings', () => {
    const planted = plantedCropsAndVarietiesForField({ ...FIELD, id: 'f1' }, [], [
      { field_id: 'f1', crop_id: 'crop-capsicum', variety_name: 'Sven RZ' },
    ]);
    expect(planted.varietiesByCrop['crop-capsicum']).toContain('Sven RZ');
  });
});

describe('defaults', () => {
  it('auto-picks the only crop and the only field variety', () => {
    const planted = plantedCropsAndVarietiesForField(FIELD, [], []);
    expect(defaultPlantedCropId(planted)).toBe('crop-capsicum');
    expect(defaultPlantedVariety(planted)).toBe('Marletta F1');
  });

  it('does not auto-pick variety when the field has more than one', () => {
    const planted = plantedCropsAndVarietiesForField(FIELD, [], [
      { field_id: 'f1', crop_id: 'crop-capsicum', variety_name: 'Sven RZ' },
      { field_id: 'f1', crop_id: 'crop-capsicum', variety_name: 'Bachata F1' },
    ]);
    expect(uniqueVarietiesOnField(planted).length).toBeGreaterThan(1);
    expect(defaultPlantedVariety(planted)).toBe('');
  });

  it('does not auto-pick a crop when there are multiple', () => {
    const planted = {
      crops: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
      varietiesByCrop: { a: ['One'], b: ['Two'] },
    };
    expect(defaultPlantedCropId(planted, 'a')).toBe('a');
    expect(defaultPlantedVariety(planted)).toBe('');
  });

  it('lists varieties for the only crop when cropId is missing', () => {
    const planted = plantedCropsAndVarietiesForField(FIELD, [], [
      { field_id: 'f1', crop_id: 'crop-capsicum', variety_name: 'Sven RZ' },
      { field_id: 'f1', crop_id: 'crop-capsicum', variety_name: 'Bachata F1' },
    ]);
    expect(varietiesForPlantedCrop(planted, '')).toEqual(planted.varietiesByCrop['crop-capsicum']);
  });
});
