jest.mock('../../db/client', () => ({ dbPool: { query: jest.fn(), connect: jest.fn() } }));

import http from 'http';
import type { AddressInfo } from 'net';
import { writeArrayBuffer, fromArrayBuffer } from 'geotiff';
import { readPixel, resolveFileUrl, pointProfile, getDataset, datasetCatalog, soilApplies } from '../soilGrids.service';

/** 20 × 10 px EPSG:4326 raster over 55–57 E, 24–25 N; value = column + 60 (pH × 10), one nodata pixel. */
function makeTiff(): ArrayBuffer {
  const w = 20; const h = 10;
  const data = new Uint8Array(w * h).map((_, i) => 60 + (i % w));
  data[0] = 255;
  return writeArrayBuffer(data, {
    width: w, height: h, BitsPerSample: [8], SampleFormat: [1],
    ModelPixelScale: [0.1, 0.1, 0], ModelTiepoint: [0, 0, 0, 55, 25, 0],
    GTModelTypeGeoKey: 2, GeographicTypeGeoKey: 4326, GTRasterTypeGeoKey: 1,
  } as any);
}

describe('reading soil values from GeoTIFF', () => {
  test('pixel under a lon/lat, nodata and outside the raster', async () => {
    const tiff = await fromArrayBuffer(makeTiff());
    expect(await readPixel(tiff, 55.05, 24.95)).toBe(255); // first pixel is the nodata value…
    expect(await readPixel(tiff, 55.05, 24.95, [255])).toBeNull(); // …and is dropped when nodata is listed
    expect(await readPixel(tiff, 56.25, 24.5, [255])).toBe(72); // column 12
    expect(await readPixel(tiff, 54.9, 24.5, [255])).toBeNull();
    expect(await readPixel(tiff, 56, 25.5, [255])).toBeNull();
  });

  test('catalogue lists the soil properties with their depths', () => {
    const keys = datasetCatalog().map((d) => d.key);
    expect(keys).toEqual(['ph', 'organic_carbon', 'clay', 'sand', 'bulk_density', 'water_33kpa', 'texture']);
    expect(getDataset('ph')!.convert(65)).toBe(6.5);
    expect(getDataset('organic_carbon')!.convert(4)).toBe(20);
    expect(getDataset('texture')!.convert(7)).toBe('Loam');
  });
});

describe('end to end: Zenodo record → file → range read', () => {
  let server: http.Server;
  let base = '';
  const buf = Buffer.from(makeTiff());
  let ranged = 0;
  const realFetch = global.fetch;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const m = /bytes=(\d+)-(\d+)?/.exec(String(req.headers.range || ''));
      if (m) {
        ranged += 1;
        const start = Number(m[1]); const end = Math.min(m[2] ? Number(m[2]) : buf.length - 1, buf.length - 1);
        res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${buf.length}`, 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes', 'Content-Type': 'image/tiff' });
        res.end(buf.subarray(start, end + 1));
      } else {
        res.writeHead(200, { 'Content-Length': buf.length, 'Accept-Ranges': 'bytes' }); res.end(buf);
      }
    });
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    global.fetch = (async (url: any, init?: any) => {
      const u = String(url);
      if (u.startsWith('https://zenodo.org/api/records/')) {
        return new Response(JSON.stringify({ id: 2525664, files: [
          { key: 'sol_ph.h2o_usda.4c1a2a_m_250m_b0..0cm_1950..2017_v0.2.tif', links: { self: `${base}/ph0.tif` } },
          { key: 'sol_ph.h2o_usda.4c1a2a_m_250m_b30..30cm_1950..2017_v0.2.tif', links: { self: `${base}/ph30.tif` } },
          { key: 'sol_ph.h2o_usda.4c1a2a_md_250m_b0..0cm_1950..2017_v0.2.tif', links: { self: `${base}/wrong.tif` } },
        ] }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return realFetch(url, init);
    }) as any;
  });
  afterAll(() => { global.fetch = realFetch; server.close(); });

  test('the mean ("_m_") file for the depth is chosen, not the "_md_" one', async () => {
    expect(await resolveFileUrl(getDataset('ph')!, 0)).toBe(`${base}/ph0.tif`);
    expect(await resolveFileUrl(getDataset('ph')!, 30)).toBe(`${base}/ph30.tif`);
  });

  test('a point profile reads only byte ranges and converts the values', async () => {
    const p = await pointProfile(56.25, 24.5, ['ph'], [0, 30]);
    expect(p.rows).toEqual([{ key: 'ph', property: 'Soil pH (H2O)', unit: 'pH', '0cm': 7.2, '30cm': 7.2 }]);
    expect(ranged).toBeGreaterThan(0);
    await expect(pointProfile(200, 24, ['ph'])).rejects.toThrow(/out of range/);
  });
});

test('soil maps apply to open fields and pivots only', () => {
  ['Open Field', 'Pivot', 'Center pivot', 'Farm Plots'].forEach((t) => expect(soilApplies(t).allowed).toBe(true));
  ['Greenhouse', 'Green House', 'NetHouse', 'Net house', 'Glasshouse', 'Tunnel', 'Cravo', 'Shade house'].forEach((t) => expect(soilApplies(t).allowed).toBe(false));
  expect(soilApplies(null).allowed).toBe(false);
});
