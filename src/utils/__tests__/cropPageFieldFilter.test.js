import {
  cropPageStructureState,
  fieldsMissingRotation,
  filterAvailabilityRows,
  filterGapRows,
  filterHistoryRows,
  occupancyForPickerFields,
  plantingRowVisible,
  workbookRowVisible,
} from '../cropPageFieldFilter';

const siteFields = [
  { id: 'n1', name: 'NH-1', type: 'Nethouse' },
  { id: 'g1', name: 'GH-1', type: 'Greenhouse' },
  { id: 'c1', name: 'Cravo-1', type: 'Cravo' },
];

const history = [
  { id: 'h1', field_id: 'n1' },
  { id: 'h2', field_id: 'g1' },
  { id: 'h3', field_id: 'c1' },
];

const gaps = [
  { field_id: 'n1', field_name: 'NH-1' },
  { field_id: 'g1', field_name: 'GH-1' },
];

describe('cropPageFieldFilter', () => {
  const { groupedFields, availableTabs, defaultStructureId } = cropPageStructureState(siteFields);
  const nethouseIds = new Set(groupedFields.nethouse.map((f) => f.id));

  it('defaults to nethouse when that type exists', () => {
    expect(defaultStructureId).toBe('nethouse');
    expect(availableTabs.map((t) => t.id)).toEqual(['nethouse', 'greenhouse', 'other']);
  });

  it('scopes history and gaps to the structure tab and field', () => {
    expect(filterHistoryRows(history, { structureFieldIds: nethouseIds }).map((r) => r.id))
      .toEqual(['h1']);
    expect(filterHistoryRows(history, { structureFieldIds: nethouseIds, fieldId: 'n1' }).map((r) => r.id))
      .toEqual(['h1']);
    expect(filterGapRows(gaps, { structureFieldIds: nethouseIds }).map((g) => g.field_id))
      .toEqual(['n1']);
    expect(fieldsMissingRotation(siteFields, history, { structureFieldIds: nethouseIds }))
      .toEqual([]);
    expect(fieldsMissingRotation(siteFields, [], { structureFieldIds: nethouseIds }).map((f) => f.id))
      .toEqual(['n1']);
  });

  it('keeps dirty planting rows and nursery rows until a field is chosen', () => {
    const scope = { structureFieldIds: nethouseIds };
    expect(plantingRowVisible({ fieldId: 'n1' }, scope)).toBe(true);
    expect(plantingRowVisible({ fieldId: 'g1' }, scope)).toBe(false);
    expect(plantingRowVisible({ fieldId: 'g1', _dirty: true }, scope)).toBe(true);
    expect(plantingRowVisible({ fieldId: '' }, scope)).toBe(true);
    expect(plantingRowVisible({ fieldId: '' }, { ...scope, fieldId: 'n1' })).toBe(false);
  });

  it('filters workbook rows by field id, not structureType text', () => {
    const scope = { structureFieldIds: nethouseIds };
    expect(workbookRowVisible({ fieldId: 'n1', structureType: 'Greenhouse' }, scope)).toBe(true);
    expect(workbookRowVisible({ fieldId: 'g1', structureType: 'Nethouse' }, scope)).toBe(false);
    expect(workbookRowVisible({ fieldId: 'g1', _dirty: true, structureType: 'Nethouse' }, scope)).toBe(true);
  });

  it('scopes occupancy to picker fields', () => {
    const occupancy = {
      n1: { fieldId: 'n1' },
      g1: { fieldId: 'g1' },
    };
    expect(Object.keys(occupancyForPickerFields(occupancy, [{ id: 'n1' }], '')))
      .toEqual(['n1']);
    expect(Object.keys(occupancyForPickerFields(occupancy, [{ id: 'n1' }, { id: 'g1' }], 'g1')))
      .toEqual(['g1']);
  });

  it('scopes availability rows to the structure tab and field', () => {
    const rows = [
      { field_id: 'n1' },
      { field_id: 'g1' },
    ];
    expect(filterAvailabilityRows(rows, { structureFieldIds: nethouseIds }).map((r) => r.field_id))
      .toEqual(['n1']);
  });
});
