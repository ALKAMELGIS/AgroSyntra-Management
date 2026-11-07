import {
  JohnDeereApi, buildAuthorizeUrl, exchangeCode, resetAuthServerCache, sevenDayWindows, summarizeMeasurements,
  JD_WELL_KNOWN, JD_ACCEPT,
} from '../johnDeere.client';
import { seal, open } from '../../utils/secretBox';

const json = (body: unknown, status = 200) =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) } as any);

const META = { authorization_endpoint: 'https://signin.johndeere.com/oauth2/x/v1/authorize', token_endpoint: 'https://signin.johndeere.com/oauth2/x/v1/token' };

beforeEach(() => resetAuthServerCache());

describe('John Deere sign-in', () => {
  it('builds the authorize URL from the well-known metadata', async () => {
    const fetchFn = jest.fn(() => json(META));
    const url = await buildAuthorizeUrl({ clientId: 'abc', redirectUri: 'https://api.example.com/cb', scopes: 'openid ag1', state: 's1' }, fetchFn as any);
    expect(fetchFn).toHaveBeenCalledWith(JD_WELL_KNOWN, expect.anything());
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe(META.authorization_endpoint);
    expect(u.searchParams.get('response_type')).toBe('code');
    expect(u.searchParams.get('client_id')).toBe('abc');
    expect(u.searchParams.get('redirect_uri')).toBe('https://api.example.com/cb');
    expect(u.searchParams.get('state')).toBe('s1');
  });

  it('exchanges the code with HTTP Basic client credentials, form-encoded', async () => {
    const fetchFn = jest.fn((url: string) => (url === JD_WELL_KNOWN ? json(META) : json({ access_token: 'A', refresh_token: 'R', expires_in: 43200 })));
    const t = await exchangeCode({ code: 'C', redirectUri: 'https://x/cb', scopes: 'openid', clientId: 'id', clientSecret: 'sec' }, fetchFn as any);
    expect(t.access_token).toBe('A');
    const [, init] = fetchFn.mock.calls[1] as any;
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from('id:sec').toString('base64')}`);
    expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    const body = new URLSearchParams(init.body);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('C');
  });

  it('reports the Deere error text when sign-in fails', async () => {
    const fetchFn = jest.fn((url: string) => (url === JD_WELL_KNOWN ? json(META) : json({ error: 'invalid_grant', error_description: 'Code expired' }, 400)));
    await expect(exchangeCode({ code: 'C', redirectUri: 'r', scopes: 's', clientId: 'i', clientSecret: 'x' }, fetchFn as any)).rejects.toThrow('Code expired');
  });
});

describe('Operations Center API', () => {
  it('sends the Deere Accept header and follows nextPage links', async () => {
    const fetchFn = jest.fn((url: string) => {
      if (url.endsWith('/organizations')) {
        return json({ values: [{ id: 1, name: 'Farm A', links: [] }], links: [{ rel: 'nextPage', uri: 'https://sandboxapi.deere.com/platform/organizations;start=1' }] });
      }
      return json({ values: [{ id: 2, name: 'Farm B', links: [{ rel: 'connections', uri: 'https://connections.deere.com/connections/xyz/select-organizations' }] }], links: [] });
    });
    const orgs = await new JohnDeereApi('sandbox', 'tok', fetchFn as any).listOrganizations();
    expect(orgs).toEqual([
      { id: '1', name: 'Farm A', type: undefined, connectionsUri: null },
      { id: '2', name: 'Farm B', type: undefined, connectionsUri: 'https://connections.deere.com/connections/xyz/select-organizations' },
    ]);
    const [url, init] = fetchFn.mock.calls[0] as any;
    expect(url).toBe('https://sandboxapi.deere.com/platform/organizations');
    expect(init.headers.Accept).toBe(JD_ACCEPT);
    expect(init.headers.Authorization).toBe('Bearer tok');
  });

  it('uses the production API for the production environment', () => {
    expect(new JohnDeereApi('production', 't').baseUrl).toBe('https://partnerapi.deere.com/platform');
  });

  it('refuses to send the token to a non-Deere URL', async () => {
    const fetchFn = jest.fn();
    await expect(new JohnDeereApi('sandbox', 'tok', fetchFn as any).get('https://evil.example.com/x')).rejects.toThrow('non-Deere');
    await expect(new JohnDeereApi('sandbox', 'tok', fetchFn as any).get('https://evil.example.com/a.deere.com/x')).rejects.toThrow('non-Deere');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('splits a date range into seven-day windows and de-duplicates operations', async () => {
    const fetchFn = jest.fn(() => json({ values: [{ id: 'op1', fieldOperationType: 'HARVEST' }], links: [] }));
    const ops = await new JohnDeereApi('sandbox', 't', fetchFn as any).listFieldOperations('o', 'f', {
      fieldOperationType: 'HARVEST', startDate: '2026-06-01T00:00:00Z', endDate: '2026-06-20T23:59:59Z',
    });
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(ops).toHaveLength(1);
    const first = new URL((fetchFn.mock.calls[0] as any)[0]);
    expect(first.pathname).toBe('/platform/organizations/o/fields/f/fieldOperations');
    expect(first.searchParams.get('fieldOperationType')).toBe('HARVEST');
    expect(first.searchParams.get('embed')).toBe('measurementTypes');
  });
});

describe('helpers', () => {
  it('sevenDayWindows covers the range with windows of at most seven days', () => {
    const w = sevenDayWindows('2026-01-01T00:00:00Z', '2026-01-15T00:00:00Z');
    expect(w[0].start).toBe('2026-01-01T00:00:00.000Z');
    expect(w[w.length - 1].end).toBe('2026-01-15T00:00:00.000Z');
    w.forEach((x) => expect(new Date(x.end).getTime() - new Date(x.start).getTime()).toBeLessThan(7 * 86400000));
    expect(() => sevenDayWindows('2026-02-01', '2026-01-01')).toThrow();
  });

  it('summarizeMeasurements keeps totals with units', () => {
    const s = summarizeMeasurements({ measurementTypes: { values: [
      { measurementName: 'HarvestYieldResult', area: { value: 12.5, unitId: 'ha' }, averageYield: { value: 8.1, unitId: 't1ha-1' }, ignored: { value: 1 } },
    ] } });
    expect(s).toEqual({ area: { value: 12.5, unitId: 'ha' }, averageYield: { value: 8.1, unitId: 't1ha-1' } });
  });

  it('secretBox round-trips and rejects tampering', () => {
    process.env.SECRET_BOX_KEY = 'test-key';
    const sealed = seal('client-secret') as string;
    expect(sealed).not.toContain('client-secret');
    expect(open(sealed)).toBe('client-secret');
    const parts = sealed.split(':');
    parts[3] = Buffer.from('xxxx').toString('base64');
    expect(open(parts.join(':'))).toBeNull();
    expect(seal('')).toBeNull();
  });
});
