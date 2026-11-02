import { APPLICATION_RECORDS_COLUMNS, buildPestExcelSheets, pestJustification } from '../pestExcelExport';
import { dropdownOptionsWithValue } from '../dropdownOptions';

describe('buildPestExcelSheets', () => {
  const spray = {
    id: 'tpl-spray',
    name: 'Spray Application',
    columns_config: {
      columns: [
        { key: 'cropName', label: 'Crop' },
        { key: 'fieldId', label: 'Field ID' },
        { key: 'totalWaterQty', label: 'Total Water (Ltr)' },
        { key: 'operatorName', label: 'Operator' },
      ],
    },
  };
  const drench = {
    id: 'tpl-drench',
    name: 'Drench Application',
    columns_config: {
      columns: [
        { key: 'cropName', label: 'Crop' },
        { key: 'productId', label: 'Name of PPP' },
        { key: 'dosage', label: 'Dose/L Water' },
      ],
    },
  };

  const apps = [
    {
      id: '1',
      template_id: 'tpl-spray',
      crop_name: 'Tomato',
      field_name: 'NH-1',
      total_water_qty: 400,
      operator_name: 'Ali',
      product_name: 'Oil',
      rate_per_ha: 2,
      approval_status: 'approved',
    },
    {
      id: '2',
      template_id: 'tpl-drench',
      crop_name: 'Cucumber',
      field_name: 'GH-2',
      product_name: 'Fungicide',
      dosage: 1.5,
      approval_status: 'pending',
    },
  ];

  it('gives Application Records, Spray, and Drench their own columns', () => {
    const sheets = buildPestExcelSheets(apps, { templates: [spray, drench] });
    expect(sheets.map((s) => s.sheetName)).toEqual([
      'Application Records',
      'Spray Application',
      'Drench Application',
    ]);

    expect(Object.keys(sheets[0].rows[0])).toEqual(APPLICATION_RECORDS_COLUMNS.map((c) => c.label));
    expect(sheets[0].rows[0]['Rate/Ha']).toBe(2);
    expect(sheets[0].rows[0].Status).toBe('approved');
    expect(sheets[0].rows[0]['Total Water (Ltr)']).toBeUndefined();

    expect(Object.keys(sheets[1].rows[0])).toEqual(['Crop', 'Field ID', 'Total Water (Ltr)', 'Operator']);
    expect(sheets[1].rows).toHaveLength(1);
    expect(sheets[1].rows[0]['Total Water (Ltr)']).toBe(400);
    expect(sheets[1].rows[0]['Rate/Ha']).toBeUndefined();

    expect(Object.keys(sheets[2].rows[0])).toEqual(['Crop', 'Name of PPP', 'Dose/L Water']);
    expect(sheets[2].rows[0]['Name of PPP']).toBe('Fungicide');
    expect(sheets[2].rows[0].Status).toBeUndefined();
  });

  it('dateFrom and dateTo keep application days inside the range', () => {
    const dated = [
      { id: '1', template_id: 'tpl-spray', crop_name: 'Early', application_date: '2026-06-01', field_name: 'NH-1', total_water_qty: 400, operator_name: 'Ali' },
      { id: '2', template_id: 'tpl-spray', crop_name: 'In range', application_date: '2026-06-15T00:00:00.000Z', field_name: 'NH-1', total_water_qty: 400, operator_name: 'Ali' },
      { id: '3', template_id: 'tpl-spray', crop_name: 'Late', application_date: '2026-07-01', field_name: 'NH-1', total_water_qty: 400, operator_name: 'Ali' },
    ];
    const sheets = buildPestExcelSheets(dated, {
      templates: [spray],
      filters: { dateFrom: '2026-06-10', dateTo: '2026-06-20' },
    });
    expect(sheets[0].rows).toHaveLength(1);
    expect(sheets[0].rows[0].Crop).toBe('In range');
  });

  it('crop filter keeps matching records and drops empty template sheets', () => {
    const sheets = buildPestExcelSheets(apps, {
      templates: [spray, drench],
      filters: { crop: 'Tomato' },
    });
    expect(sheets.map((s) => s.sheetName)).toEqual([
      'Application Records',
      'Spray Application',
    ]);
    expect(sheets[0].rows).toHaveLength(1);
    expect(sheets[0].rows[0].Crop).toBe('Tomato');
    expect(sheets[1].rows).toHaveLength(1);
  });
});

describe('pestJustification', () => {
  it('matches Excel: justification, then target_pest, then targetPest', () => {
    expect(pestJustification({ justification: 'Thrips', target_pest: 'Whitefly' })).toBe('Thrips');
    expect(pestJustification({ target_pest: 'Powdery Mildew' })).toBe('Powdery Mildew');
    expect(pestJustification({ targetPest: 'Mealy bug' })).toBe('Mealy bug');
    expect(pestJustification({})).toBe('');
  });

  it('puts target_pest on the Application Records Excel sheet', () => {
    const sheets = buildPestExcelSheets(
      [{ id: '1', crop_name: 'Blueberry', target_pest: 'Thrips' }],
      { templates: [] },
    );
    expect(sheets[0].rows[0].Justification).toBe('Thrips');
  });
});

describe('dropdownOptionsWithValue', () => {
  const options = 'Pest : Thrips,Disease : Powdery Mildew,Preventative';

  it('keeps template options when the value already matches', () => {
    expect(dropdownOptionsWithValue(options, 'Pest : Thrips')).toEqual([
      'Pest : Thrips',
      'Disease : Powdery Mildew',
      'Preventative',
    ]);
  });

  it('appends a saved free-text value so the select can display it', () => {
    expect(dropdownOptionsWithValue(options, 'Thrips')).toEqual([
      'Pest : Thrips',
      'Disease : Powdery Mildew',
      'Preventative',
      'Thrips',
    ]);
  });
});
