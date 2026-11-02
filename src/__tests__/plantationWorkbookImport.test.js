import { matchMasterOption, normalizeMasterName } from '../utils/masterDataFuzzyMatch';
import {
  applyCreatedMasterIds,
  buildPlantationPreviewRow,
  canConfirmPlantationImport,
  collectImportMasterCreates,
  cropWillCreate,
  detectPlantationHeaderRow,
  guessPlantationColumnMapping,
  matchCropId,
  matchFieldId,
  parseMappedSheetRows,
  rematchPreviewFields,
  resolveCropForImport,
  unionPlantationImportFields,
  varietyMissingCrop,
  varietyWillCreate,
} from '../utils/plantationWorkbookImport';

const FIELDS = [
  { id: 'gh1', name: 'GH 01' },
  { id: 'nh1', name: 'NH-01' },
  { id: 'gh2', name: 'GH-02' },
  { id: 'gh3', name: 'GH-03' },
];
const CROPS = [
  { id: 'tomato', name: 'Tomato' },
  { id: 'sweetcorn', name: 'Sweetcorn' },
];
const VARIETIES = {
  tomato: [{ id: 'ty1', name: 'TY-10' }],
  sweetcorn: [{ id: 'sc1', name: 'SC Gold' }],
};
const getVarieties = (cropId) => VARIETIES[cropId] || [];

describe('plantation workbook import matching', () => {
  test('Family  Code and Variety Sown Code bind even when Requested date is not column 0', () => {
    const rows = [
      ['Banner', 'Plantation Opening'],
      [],
      ['Site', 'Requested date', 'Family  Code', 'Field', 'Variety Sown Code'],
      ['OM', 45000, 'Tomato', 'GH-01', 'TY-10'],
    ];
    const headerIdx = detectPlantationHeaderRow(rows);
    expect(headerIdx).toBe(2);
    expect(String(rows[headerIdx][0])).not.toMatch(/requested date/i);

    const mapping = guessPlantationColumnMapping(rows[headerIdx]);
    expect(mapping[1]).toBe('requestedDate');
    expect(mapping[2]).toBe('cropId');
    expect(mapping[3]).toBe('fieldId');
    expect(mapping[4]).toBe('varietyId');
  });

  test('a cell with two crop names does not substring-pick a crop', () => {
    expect(matchCropId('Tomato Sweetcorn', CROPS)).toBeNull();
    expect(matchMasterOption('Tomato and Sweetcorn', CROPS.map((c) => ({ id: c.id, name: c.name })))).toBeNull();
  });

  test('GH-01 matches GH 01; ambiguous one-letter miss stays unmatched', () => {
    expect(matchFieldId('GH-01', FIELDS)?.id).toBe('gh1');
    expect(normalizeMasterName('GH-01')).toBe('gh 01');
    expect(matchFieldId('GH-0X', [
      { id: 'a', name: 'GH-01' },
      { id: 'b', name: 'GH-03' },
    ])).toBeNull();
  });

  test('unmatched field stays empty and blocks confirm until picked', () => {
    const preview = buildPlantationPreviewRow({
      mapped: { fieldId: 'Unknown GH', cropId: 'Tomato', varietyId: 'TY-10' },
      sheetKind: 'opening',
      sheetName: 'Opening',
      fields: FIELDS,
      crops: CROPS,
      getVarieties,
      index: 0,
    });
    expect(preview.fieldId).toBe('');
    expect(preview.fieldNeedsPick).toBe(true);
    expect(preview.cropId).toBe('tomato');
    expect(canConfirmPlantationImport([preview])).toBe(false);

    const picked = { ...preview, fieldId: 'gh1', fieldNeedsPick: false };
    expect(canConfirmPlantationImport([picked])).toBe(true);
  });

  test('matching uses the full site field list, not a structure-tab subset', () => {
    const pickerFields = [{ id: 'gh1', name: 'GH 01' }];
    expect(matchFieldId('NH-01', pickerFields)).toBeNull();
    expect(matchFieldId('NH-01', FIELDS)?.id).toBe('nh1');
  });

  test('options include a picker field when the allFields siteId filter is empty, and that list matches GH-01 to GH 01', () => {
    const filteredFromAllFields = [];
    const pickerFields = [{ id: 'gh1', name: 'GH 01', siteId: undefined }];
    const union = unionPlantationImportFields(filteredFromAllFields, pickerFields);
    expect(union).toEqual(pickerFields);
    expect(matchFieldId('GH-01', union)?.id).toBe('gh1');
  });

  test('rematch fills Field when the list arrives and does not overwrite a manual pick', () => {
    const emptyListRow = buildPlantationPreviewRow({
      mapped: { fieldId: 'GH-01', cropId: 'Tomato', varietyId: 'TY-10' },
      sheetKind: 'opening',
      sheetName: 'Opening',
      fields: [],
      crops: CROPS,
      getVarieties,
      index: 0,
    });
    expect(emptyListRow.fieldId).toBe('');
    expect(emptyListRow.fieldNeedsPick).toBe(true);

    const filled = rematchPreviewFields([emptyListRow], [{ id: 'gh1', name: 'GH 01' }]);
    expect(filled[0].fieldId).toBe('gh1');
    expect(filled[0].fieldNeedsPick).toBe(false);

    const manual = [{ ...emptyListRow, fieldId: 'picked-by-user', fieldNeedsPick: false }];
    expect(rematchPreviewFields(manual, [{ id: 'gh1', name: 'GH 01' }])[0].fieldId).toBe('picked-by-user');
  });

  test('unique longer-name misspelling still close-matches', () => {
    expect(matchCropId('Tomata', CROPS)?.id).toBe('tomato');
  });

  test('closing sheet reads mapped columns, not fixed indexes', () => {
    const rows = [
      ['x', 'y', 'z', 'Requested date', 'Field', 'Family Code', 'Variety Sown Code', 'Plantation Code'],
      ['', '', '', 45000, 'GH 01', 'Tomato', 'TY-10', 'P-1'],
    ];
    const headerIdx = detectPlantationHeaderRow(rows);
    const mapping = guessPlantationColumnMapping(rows[headerIdx]);
    expect(mapping[4]).toBe('fieldId');
    expect(mapping[5]).toBe('cropId');
    expect(mapping[6]).toBe('varietyId');
    expect(mapping[3]).toBe('requestedDate');

    const parsed = parseMappedSheetRows(rows, headerIdx, mapping);
    const preview = buildPlantationPreviewRow({
      mapped: parsed[0].mapped,
      sheetKind: 'closing',
      sheetName: 'Tomato-Closing',
      fields: FIELDS,
      crops: CROPS,
      getVarieties,
      index: 0,
    });
    expect(preview.fieldId).toBe('gh1');
    expect(preview.cropId).toBe('tomato');
    expect(preview.varietyId).toBe('ty1');
    expect(parsed[0].mapped.fieldId).toBe('GH 01');
    expect(rows[1][5]).toBe('Tomato');
  });

  test('unmatched family and variety create on import when field is matched', () => {
    const preview = buildPlantationPreviewRow({
      mapped: { fieldId: 'GH 01', cropId: 'Blueberry', varietyId: 'Eureka' },
      sheetKind: 'opening',
      sheetName: 'Opening',
      fields: FIELDS,
      crops: CROPS,
      getVarieties,
      index: 0,
    });
    expect(preview.cropId).toBe('');
    expect(preview.varietyId).toBe('');
    expect(cropWillCreate(preview)).toBe(true);
    expect(varietyWillCreate(preview)).toBe(true);
    expect(preview.status).toBe('review');
    expect(canConfirmPlantationImport([preview])).toBe(true);
  });

  test('variety with no crop identity still blocks confirm', () => {
    const preview = buildPlantationPreviewRow({
      mapped: { fieldId: 'GH 01', cropId: '', varietyId: 'TY-10' },
      sheetKind: 'opening',
      sheetName: 'Opening',
      fields: FIELDS,
      crops: CROPS,
      getVarieties,
      index: 0,
    });
    expect(varietyMissingCrop(preview)).toBe(true);
    expect(canConfirmPlantationImport([preview])).toBe(false);
  });

  test('collectImportMasterCreates dedupes family and variety names', () => {
    const blueberryEureka = buildPlantationPreviewRow({
      mapped: { fieldId: 'GH 01', cropId: 'Blueberry', varietyId: 'Eureka' },
      sheetKind: 'opening',
      sheetName: 'Opening',
      fields: FIELDS,
      crops: CROPS,
      getVarieties,
      index: 0,
    });
    const blueberryBlush = buildPlantationPreviewRow({
      mapped: { fieldId: 'GH 02', cropId: 'BLUEBERRY', varietyId: 'First Blush' },
      sheetKind: 'opening',
      sheetName: 'Opening',
      fields: FIELDS,
      crops: CROPS,
      getVarieties,
      index: 1,
    });
    const againEureka = buildPlantationPreviewRow({
      mapped: { fieldId: 'GH 03', cropId: 'blueberry', varietyId: 'eureka' },
      sheetKind: 'opening',
      sheetName: 'Opening',
      fields: FIELDS,
      crops: CROPS,
      getVarieties,
      index: 2,
    });
    const collected = collectImportMasterCreates([blueberryEureka, blueberryBlush, againEureka]);
    expect(collected.crops).toEqual(['Blueberry']);
    expect(collected.varieties.map((v) => v.name)).toEqual(['Eureka', 'First Blush']);

    const withCrop = applyCreatedMasterIds(
      [blueberryEureka, blueberryBlush, againEureka],
      { blueberry: 'crop-bb' },
    );
    expect(withCrop.every((r) => r.cropId === 'crop-bb')).toBe(true);
    const afterCrop = collectImportMasterCreates(withCrop);
    expect(afterCrop.crops).toEqual([]);
    expect(afterCrop.varieties).toHaveLength(2);
    expect(afterCrop.varieties.every((v) => v.cropId === 'crop-bb')).toBe(true);

    const done = applyCreatedMasterIds(withCrop, {}, {
      'crop-bb::eureka': 'var-e',
      'crop-bb::first blush': 'var-fb',
    });
    expect(done.map((r) => r.varietyId)).toEqual(['var-e', 'var-fb', 'var-e']);
    expect(done.every((r) => !cropWillCreate(r) && !varietyWillCreate(r))).toBe(true);
    expect(canConfirmPlantationImport(done)).toBe(true);
  });

  test('tab-name crop is fallback only when Family Code is blank', () => {
    const fromTab = resolveCropForImport({
      excelFamily: '',
      sheetName: 'Tomato-Closing',
      crops: CROPS,
    });
    expect(fromTab?.id).toBe('tomato');
    expect(fromTab?.source).toBe('tab');

    const fromColumn = resolveCropForImport({
      excelFamily: 'Sweetcorn',
      sheetName: 'Tomato-Closing',
      crops: CROPS,
    });
    expect(fromColumn?.id).toBe('sweetcorn');
    expect(fromColumn?.source).toBe('column');
  });
});
