jest.mock('../../db/client', () => ({ dbPool: { query: jest.fn() } }));

import { analyzeKeys, detectKeyFields } from '../arcgisLink.service';
import { assertSafeArcgisUrl, parseFeatureServiceUrl } from '../arcgis.service';
import { applyKeyMapping } from '../gisLayer.service';
import { toCsv } from '../formRegistry.service';

/** Shape of the Agro_Structures layer description (fields, GlobalID, subtypes, domains). */
const AGRO_STRUCTURES = {
  name: 'Agro_Structures',
  type: 'Feature Layer',
  geometryType: 'esriGeometryPolygon',
  objectIdField: 'OBJECTID',
  globalIdField: 'GlobalID',
  displayField: 'Farm_Name',
  typeIdField: 'Structure_Type',
  maxRecordCount: 2000,
  fields: [
    { name: 'OBJECTID', type: 'esriFieldTypeOID' },
    { name: 'ProjectCode', type: 'esriFieldTypeString' },
    { name: 'ZONE_ID', type: 'esriFieldTypeString' },
    { name: 'SITE', type: 'esriFieldTypeSmallInteger', domain: { codedValues: [
      { code: 1, name: 'Site 1' }, { code: 2, name: 'Site 2' }, { code: 3, name: 'Not Applicable' }] } },
    { name: 'Site_Code', type: 'esriFieldTypeString' },
    { name: 'Farm_Code', type: 'esriFieldTypeString' },
    { name: 'Farm_Name', type: 'esriFieldTypeString' },
    { name: 'Structure_Type', type: 'esriFieldTypeSmallInteger' },
    { name: 'GlobalID', type: 'esriFieldTypeGlobalID' },
  ],
  types: [{ id: 1000, name: 'Greenhouse' }, { id: 1001, name: 'Nethouse' }, { id: 1006, name: 'PIVOT' }],
};

describe('detectKeyFields', () => {
  it('finds every key of Agro_Structures without configuration', () => {
    expect(detectKeyFields(AGRO_STRUCTURES)).toEqual({
      globalId: 'GlobalID', zoneId: 'ZONE_ID', farmCode: 'Farm_Code', farmName: 'Farm_Name',
      site: 'SITE', siteCode: 'Site_Code', structureType: 'Structure_Type',
    });
  });

  it('lets the user pick other fields and ignores names the layer does not have', () => {
    const m = detectKeyFields(AGRO_STRUCTURES, { farmCode: 'ProjectCode', zoneId: 'NOPE', site: '' });
    expect(m.farmCode).toBe('ProjectCode');
    expect(m.zoneId).toBe('ZONE_ID');
    expect(m.site).toBeUndefined();
  });
});

describe('analyzeKeys', () => {
  const mapping = detectKeyFields(AGRO_STRUCTURES);
  const rows = [
    { OBJECTID: 1, GlobalID: '{A}', ZONE_ID: 'mh', Farm_Code: 'F-1', SITE: 1, Structure_Type: 1000 },
    { OBJECTID: 2, GlobalID: '{B}', ZONE_ID: 'MH ', Farm_Code: 'f-1', SITE: 1, Structure_Type: 1000 },
    { OBJECTID: 3, GlobalID: '{C}', ZONE_ID: 'AD', Farm_Code: 'F-9', SITE: 3, Structure_Type: 1006 },
    { OBJECTID: 4, GlobalID: null, ZONE_ID: '', Farm_Code: null, SITE: null, Structure_Type: 1001 },
  ];
  const r = analyzeKeys(rows, mapping, AGRO_STRUCTURES);

  it('reports duplicate ZONE_ID + Farm_Code pairs (case and spaces ignored)', () => {
    expect(r.duplicates).toEqual([{ zone: 'MH', farmCode: 'F-1', count: 2 }]);
    expect(r.uniqueKeys).toBe(2);
  });

  it('counts missing keys', () => {
    expect(r.missingZone).toBe(1);
    expect(r.missingFarmCode).toBe(1);
    expect(r.missingGlobalId).toBe(1);
  });

  it('decodes SITE and structure-type codes and spots "Not Applicable"', () => {
    expect(r.notApplicableSiteCode).toBe('3');
    expect(r.sites).toEqual(expect.arrayContaining([{ value: '3 · Not Applicable', count: 1 }, { value: '1 · Site 1', count: 2 }]));
    expect(r.structureTypes[0]).toEqual({ value: 'Greenhouse', count: 2 });
  });
});

describe('layer link safety', () => {
  it('keeps the layer number from the link', () => {
    expect(parseFeatureServiceUrl('https://example.arcgis.com/x/arcgis/rest/services/Agro_Structures/FeatureServer/21'))
      .toEqual({ baseUrl: 'https://example.arcgis.com/x/arcgis/rest/services/Agro_Structures/FeatureServer', layerIndex: 21 });
  });

  it.each([
    'http://localhost/arcgis/rest/services/a/FeatureServer/0',
    'http://127.0.0.1/arcgis/rest/services/a/FeatureServer/0',
    'http://169.254.169.254/arcgis/rest/services/a/FeatureServer/0',
    'http://10.0.0.5/arcgis/rest/services/a/FeatureServer/0',
    'http://[::1]/arcgis/rest/services/a/FeatureServer/0',
    'ftp://example.com/arcgis/rest/services/a/FeatureServer/0',
    'https://user:pw@example.com/arcgis/rest/services/a/FeatureServer/0',
    'https://8.8.8.8/not-arcgis',
  ])('refuses %s', async (url) => {
    await expect(assertSafeArcgisUrl(url)).rejects.toMatchObject({ status: 400 });
  });

  it('accepts a public ArcGIS REST link given as an IP', async () => {
    await expect(assertSafeArcgisUrl('https://8.8.8.8/arcgis/rest/services/a/FeatureServer/0')).resolves.toBeInstanceOf(URL);
  });
});

describe('applyKeyMapping', () => {
  it('copies renamed key fields onto the names the linker reads', () => {
    const out = applyKeyMapping({ ZoneCode: 'MH', Code: 'F-1', Farm_Name: 'GH-01' }, { zoneId: 'ZoneCode', farmCode: 'Code' });
    expect(out).toMatchObject({ ZONE_ID: 'MH', Farm_Code: 'F-1', Farm_Name: 'GH-01', ZoneCode: 'MH' });
  });

  it('leaves the feature unchanged without a mapping', () => {
    const p = { ZONE_ID: 'MH' };
    expect(applyKeyMapping(p, null)).toBe(p);
  });
});

describe('form records CSV', () => {
  it('keeps FORM_ID on every row and quotes values safely', () => {
    const csv = toCsv([{ form_id: 'f1', record_id: 'r1', record_date: '2026-10-20', values: { id: 'r1', notes: 'a, "b"' } }]);
    const [head, row] = csv.split('\r\n');
    expect(head.startsWith('form_id,record_id,record_date')).toBe(true);
    expect(row.startsWith('f1,r1,2026-10-20')).toBe(true);
    expect(row).toContain('"a, ""b"""');
  });
});
