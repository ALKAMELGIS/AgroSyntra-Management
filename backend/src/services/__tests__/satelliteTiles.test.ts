import { signTileKey, verifyTileKey, wmsTileParams } from '../satelliteTiles';
import { parseWmsLayers, isSentinelInstanceId, sentinelWmsBase } from '../systemSettings.service';

describe('satellite tile keys', () => {
  test('a signed key verifies, a changed or expired key does not', () => {
    const { key } = signTileKey('org-1', Date.now());
    expect(verifyTileKey(key)).toEqual({ subject: 'org-1' });
    const [sub, exp, sig] = key.split('.');
    expect(verifyTileKey(`${sub}.${Number(exp) + 999}.${sig}`)).toBeNull();
    expect(verifyTileKey(`${sub}.${exp}.${sig.slice(0, -2)}xx`)).toBeNull();
    expect(verifyTileKey(key, Date.now() + 13 * 3600 * 1000)).toBeNull();
    expect(verifyTileKey('')).toBeNull();
  });
});

describe('WMS parameters passed to the satellite service', () => {
  const base = { service: 'WMS', request: 'GetMap', layers: 'NDVI', bbox: '6200000,2700000,6210000,2710000', width: '256', height: '256', crs: 'EPSG:3857', time: '2026-10-01/2026-11-08', maxcc: '30' };
  test('a normal Leaflet tile request passes, with the ID never part of it', () => {
    const p = wmsTileParams(base)!;
    expect(p.get('LAYERS')).toBe('NDVI');
    expect(p.get('CRS')).toBe('EPSG:3857');
    expect(p.get('TIME')).toBe('2026-10-01/2026-11-08');
    expect(p.toString()).not.toMatch(/instance/i);
  });
  test('anything unusual is refused', () => {
    expect(wmsTileParams({ ...base, layers: 'NDVI&REQUEST=GetCapabilities' })).toBeNull();
    expect(wmsTileParams({ ...base, bbox: '1,2,3' })).toBeNull();
    expect(wmsTileParams({ ...base, width: '5000' })).toBeNull();
    expect(wmsTileParams({ ...base, crs: 'EPSG:9999' })).toBeNull();
    expect(wmsTileParams({ ...base, time: 'now; drop' })).toBeNull();
    expect(wmsTileParams({ ...base, maxcc: '500' })).toBeNull();
  });
  test('extra parameters are dropped', () => {
    const p = wmsTileParams({ ...base, evalscript: 'x', k: 'secret' })!;
    expect(p.has('EVALSCRIPT')).toBe(false);
    expect(p.has('K')).toBe(false);
  });
});

describe('satellite configuration', () => {
  test('configuration IDs and service URLs', () => {
    expect(isSentinelInstanceId('11111111-2222-4333-8444-555555555555')).toBe(true);
    expect(isSentinelInstanceId('not-an-id')).toBe(false);
    expect(sentinelWmsBase('abc', 'copernicus')).toBe('https://sh.dataspace.copernicus.eu/ogc/wms/abc');
    expect(sentinelWmsBase('abc')).toBe('https://services.sentinel-hub.com/ogc/wms/abc');
  });
  test('layer names are read from GetCapabilities', () => {
    const xml = '<WMS_Capabilities><Capability><Layer><Title>root</Title><Layer queryable="1"><Name>TRUE_COLOR</Name><Title>True color</Title></Layer><Layer><Name>NDVI</Name><Title>NDVI</Title></Layer></Layer></Capability></WMS_Capabilities>';
    expect(parseWmsLayers(xml)).toEqual([{ id: 'TRUE_COLOR', title: 'True color' }, { id: 'NDVI', title: 'NDVI' }]);
  });
});

describe('indices and AOI clipping', () => {
  const tile = { layers: 'x', bbox: '6200000,2700000,6210000,2710000', width: '256', height: '256', crs: 'EPSG:3857' };
  test('an index uses our own script on the configuration layer', () => {
    const p = wmsTileParams({ ...tile, index: 'NDVI' }, 'TRUE-COLOR-L2A')!;
    expect(p.get('LAYERS')).toBe('TRUE-COLOR-L2A');
    expect(Buffer.from(p.get('EVALSCRIPT')!, 'base64').toString()).toContain('(s.B08 - s.B04) / (s.B08 + s.B04)');
    expect(wmsTileParams({ ...tile, index: 'EVIL' }, 'L')).toBeNull();
  });
  test('the AOI clips the image only when it is a plain polygon', () => {
    const wkt = 'POLYGON((6200000 2700000, 6201000 2700000, 6201000 2701000, 6200000 2700000))';
    expect(wmsTileParams({ ...tile, index: 'NDVI', geometry: wkt }, 'L')!.get('GEOMETRY')).toBe(wkt);
    expect(wmsTileParams({ ...tile, index: 'NDVI', geometry: 'MULTIPOLYGON(((1 2, 3 4, 5 6, 1 2)),((7 8, 9 10, 11 12, 7 8)))' }, 'L')).not.toBeNull();
    expect(wmsTileParams({ ...tile, index: 'NDVI', geometry: "POLYGON((1 2, 3 4)); DROP" }, 'L')).toBeNull();
    expect(wmsTileParams({ ...tile, index: 'NDVI', geometry: 'POINT(1 2)' }, 'L')).toBeNull();
  });
});
