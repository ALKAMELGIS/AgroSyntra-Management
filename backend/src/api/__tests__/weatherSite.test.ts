jest.mock('../../db/client', () => ({ dbPool: { query: jest.fn() } }));
jest.mock('../../cache/client', () => ({ cache: { get: jest.fn(), set: jest.fn() } }));

import { dbPool } from '../../db/client';
import { siteCoordinates } from '../v1/weather.routes';

const query = dbPool.query as jest.Mock;

describe('weather by site', () => {
  beforeEach(() => query.mockReset());

  it('averages the site fields and scopes the lookup to the organisation', async () => {
    query.mockResolvedValue({ rows: [{ lat: '24.45', lon: '54.38' }] });
    await expect(siteCoordinates('f3d2d151-6b55-476f-b733-483639db57e0', 'org-1')).resolves.toEqual({ lat: 24.45, lon: 54.38 });
    expect(query.mock.calls[0][1]).toEqual(['f3d2d151-6b55-476f-b733-483639db57e0', 'org-1']);
  });

  it('returns null when the site has no located fields or there is no organisation', async () => {
    query.mockResolvedValue({ rows: [{ lat: null, lon: null }] });
    await expect(siteCoordinates('s', 'org-1')).resolves.toBeNull();
    await expect(siteCoordinates('s', undefined)).resolves.toBeNull();
  });
});
