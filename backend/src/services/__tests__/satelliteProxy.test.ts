jest.mock('../../db/client', () => {
  const query = jest.fn(async () => ({ rows: [] }));
  return { dbPool: { query, connect: jest.fn(async () => ({ query, release: jest.fn() })), end: jest.fn() }, query };
});
jest.mock('../../cache/client', () => ({ redisClient: { get: jest.fn(), setex: jest.fn(), quit: jest.fn() } }));
jest.mock('../systemSettings.service', () => ({
  resolveSentinel: jest.fn(async () => ({ instanceId: '11111111-2222-4333-8444-555555555555', service: 'sentinel-hub', wmsBase: 'https://services.sentinel-hub.com/ogc/wms/11111111-2222-4333-8444-555555555555', ogcBase: 'https://services.sentinel-hub.com/ogc', baseLayer: 'TRUE_COLOR' })),
  getSentinelConfig: jest.fn(),
  parseWmsLayers: jest.fn(() => []),
}));

import express from 'express';
import type { AddressInfo } from 'net';
import { satelliteRouter } from '../../api/v1/satellite.routes';
import { signTileKey } from '../satelliteTiles';
import jwt from 'jsonwebtoken';
import { config } from '../../config';
import * as settings from '../systemSettings.service';

const bearer = () => ({ Authorization: `Bearer ${jwt.sign({ userId: 'u1', email: 'a@b.c', role: 'agronomist', organizationId: 'org-1' }, config.auth.jwtSecret, { algorithm: 'HS256', expiresIn: '5m' })}` });

const realFetch = global.fetch;
let base = '';
let server: any;
const upstream = jest.fn();

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/satellite', satelliteRouter);
  app.use((err: any, _req: any, res: any, _next: any) => res.status(err.status || err.statusCode || 500).json({ error: err.message }));
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  global.fetch = (async (url: any, init?: any) => {
    if (String(url).startsWith(base)) return realFetch(url, init);
    return upstream(String(url));
  }) as any;
});
afterAll(() => { global.fetch = realFetch; server.close(); });
beforeEach(() => upstream.mockReset());

const tile = 'LAYERS=NDVI&BBOX=6200000,2700000,6210000,2710000&WIDTH=256&HEIGHT=256&CRS=EPSG:3857&TIME=2026-10-01/2026-11-08';

test('tiles need a valid signed key; the configuration ID is added only on the server', async () => {
  upstream.mockResolvedValue(new Response(Buffer.from([137, 80, 78, 71]), { status: 200, headers: { 'content-type': 'image/png' } }));
  expect((await realFetch(`${base}/satellite/wms?${tile}`)).status).toBe(401);
  expect((await realFetch(`${base}/satellite/wms?${tile}&k=forged.1.x`)).status).toBe(401);
  const { key } = signTileKey('org-1');
  const ok = await realFetch(`${base}/satellite/wms?${tile}&k=${key}`);
  expect(ok.status).toBe(200);
  expect(ok.headers.get('content-type')).toBe('image/png');
  const called = upstream.mock.calls[0][0];
  expect(called).toMatch(/^https:\/\/services\.sentinel-hub\.com\/ogc\/wms\/11111111-2222-4333-8444-555555555555\?/);
  expect(called).not.toContain(key);
});

test('bad parameters and non-image answers are not passed on', async () => {
  const { key } = signTileKey('org-1');
  expect((await realFetch(`${base}/satellite/wms?LAYERS=NDVI&BBOX=1,2&k=${key}`)).status).toBe(400);
  upstream.mockResolvedValue(new Response('<ServiceException>bad</ServiceException>', { status: 200, headers: { 'content-type': 'application/xml' } }));
  expect((await realFetch(`${base}/satellite/wms?${tile}&k=${key}`)).status).toBe(502);
});

test('everything else requires sign-in (including the OAuth token route)', async () => {
  expect((await realFetch(`${base}/satellite/status`)).status).toBe(401);
  expect((await realFetch(`${base}/satellite/tile-key`)).status).toBe(401);
  expect((await realFetch(`${base}/satellite/token`, { method: 'POST' })).status).toBe(401);
  expect((await realFetch(`${base}/satellite/layers`)).status).toBe(401);
});

test('scene search groups Sentinel-2 tiles by date with their cloud cover', async () => {
  upstream.mockResolvedValue(new Response(JSON.stringify({ features: [
    { properties: { date: '2026-11-05', cloudCoverPercentage: 3.2 } },
    { properties: { date: '2026-11-05', cloudCoverPercentage: 7.9 } },
    { properties: { date: '2026-10-31', cloudCoverPercentage: 41 } },
  ] }), { status: 200, headers: { 'content-type': 'application/json' } }));
  const r = await realFetch(`${base}/satellite/scenes?bbox=55.7,24.2,55.8,24.3&from=2026-10-01&to=2026-11-08&maxcc=50`, { headers: bearer() });
  expect(r.status).toBe(200);
  expect((await r.json()).data).toEqual([
    { date: '2026-11-05', cloud: 7.9, tiles: 2, time: null },
    { date: '2026-10-31', cloud: 41, tiles: 1, time: null },
  ]);
  expect(upstream.mock.calls[0][0]).toMatch(/\/ogc\/wfs\/11111111-2222-4333-8444-555555555555\?.*TYPENAMES=DSS2.*BBOX=24\.2%2C55\.7%2C24\.3%2C55\.8/);
});

test('time series returns mean / min / max per date for an index over the AOI', async () => {
  upstream.mockResolvedValue(new Response(JSON.stringify({ C0: [
    { date: '2026-11-05', basicStats: { min: 0.1, max: 0.8, mean: 0.61234 } },
    { date: '2026-10-21', basicStats: { min: 0.05, max: 0.7, mean: 0.5 } },
  ] }), { status: 200, headers: { 'content-type': 'application/json' } }));
  const wkt = 'POLYGON((6200000 2700000, 6201000 2700000, 6201000 2701000, 6200000 2700000))';
  const r = await realFetch(`${base}/satellite/stats`, { method: 'POST', headers: { ...bearer(), 'Content-Type': 'application/json' }, body: JSON.stringify({ index: 'NDVI', geometry: wkt, from: '2026-10-01', to: '2026-11-08' }) });
  expect(r.status).toBe(200);
  expect((await r.json()).data).toEqual([
    { date: '2026-10-21', mean: 0.5, min: 0.05, max: 0.7 },
    { date: '2026-11-05', mean: 0.612, min: 0.1, max: 0.8 },
  ]);
  const bad = await realFetch(`${base}/satellite/stats`, { method: 'POST', headers: { ...bearer(), 'Content-Type': 'application/json' }, body: JSON.stringify({ index: 'TRUE_COLOR', geometry: wkt, from: '2026-10-01', to: '2026-11-08' }) });
  expect(bad.status).toBe(400);
  (settings.resolveSentinel as jest.Mock).mockResolvedValueOnce({ instanceId: 'x', service: 'copernicus', wmsBase: '', ogcBase: '', baseLayer: 'L' });
  const cop = await realFetch(`${base}/satellite/stats`, { method: 'POST', headers: { ...bearer(), 'Content-Type': 'application/json' }, body: JSON.stringify({ index: 'NDVI', geometry: wkt, from: '2026-10-01', to: '2026-11-08' }) });
  expect(cop.status).toBe(501);
});
