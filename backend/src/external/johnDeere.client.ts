/**
 * John Deere Operations Center API client (OAuth 2 + Field Operations).
 *
 * Verified against John Deere's official OAuth2 example
 * (github.com/JohnDeere/OperationsCenterAPI-OAuth2-NodeJS-Example) and the
 * Field Operations API spec (developer.deere.com/dev-docs/field-operations):
 *  - Sign-in metadata: signin.johndeere.com/oauth2/aus78tnlaysMraFhC1t7/.well-known/oauth-authorization-server
 *  - Token requests: form-encoded, HTTP Basic auth with clientId:clientSecret
 *  - API calls: Bearer token, Accept: application/vnd.deere.axiom.v3+json
 *  - Paging: follow the absolute `nextPage` link in each response
 *  - Organization sharing: an organization that still needs to be shared with
 *    the app carries a link with rel "connections"; the user completes it on
 *    connections.deere.com, then returns to redirect_uri
 *  - Field operations: GET /organizations/{orgId}/fields/{fieldId}/fieldOperations
 *    with cropSeason, fieldOperationType (APPLICATION | CARTING | HARVEST |
 *    SEEDING | TILLAGE), startDate / endDate (ISO-8601, a seven-day window,
 *    inclusive) and embed=measurementTypes for totals.
 */

export type JohnDeereEnvironment = 'sandbox' | 'production';

export const JD_ENVIRONMENTS: Record<JohnDeereEnvironment, { label: string; apiUrl: string }> = {
  sandbox: { label: 'Sandbox', apiUrl: 'https://sandboxapi.deere.com/platform' },
  production: { label: 'Production', apiUrl: 'https://partnerapi.deere.com/platform' },
};

export const JD_WELL_KNOWN =
  'https://signin.johndeere.com/oauth2/aus78tnlaysMraFhC1t7/.well-known/oauth-authorization-server';

/** Read-only access to agronomic data, plus a refresh token so syncs keep working. */
export const JD_DEFAULT_SCOPES = 'openid profile offline_access ag1';

export const JD_ACCEPT = 'application/vnd.deere.axiom.v3+json';

export const JD_OPERATION_TYPES = ['SEEDING', 'APPLICATION', 'HARVEST', 'TILLAGE', 'CARTING'] as const;
export type JdOperationType = (typeof JD_OPERATION_TYPES)[number];

/** Deere limits a fieldOperations date filter to seven days (inclusive). */
export const JD_MAX_WINDOW_DAYS = 7;

export interface JdLink { rel: string; uri: string }
export interface JdTokenSet { access_token: string; refresh_token?: string; expires_in?: number; id_token?: string }

export class JohnDeereApiError extends Error {
  constructor(message: string, public status: number, public body?: unknown) {
    super(message);
    this.name = 'JohnDeereApiError';
  }
}

type FetchFn = typeof fetch;

let wellKnownCache: { authorization_endpoint: string; token_endpoint: string } | null = null;

export async function getAuthServer(fetchFn: FetchFn = fetch) {
  if (wellKnownCache) return wellKnownCache;
  const res = await fetchFn(JD_WELL_KNOWN, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new JohnDeereApiError('Could not read John Deere sign-in settings', res.status);
  const meta = (await res.json()) as { authorization_endpoint: string; token_endpoint: string };
  wellKnownCache = { authorization_endpoint: meta.authorization_endpoint, token_endpoint: meta.token_endpoint };
  return wellKnownCache;
}

/** For tests. */
export function resetAuthServerCache() { wellKnownCache = null; }

export async function buildAuthorizeUrl(
  opts: { clientId: string; redirectUri: string; scopes: string; state: string },
  fetchFn: FetchFn = fetch,
): Promise<string> {
  const { authorization_endpoint } = await getAuthServer(fetchFn);
  const params = new URLSearchParams({
    client_id: opts.clientId,
    response_type: 'code',
    scope: opts.scopes,
    redirect_uri: opts.redirectUri,
    state: opts.state,
  });
  return `${authorization_endpoint}?${params.toString()}`;
}

async function tokenRequest(
  body: Record<string, string>,
  creds: { clientId: string; clientSecret: string },
  fetchFn: FetchFn,
): Promise<JdTokenSet> {
  const { token_endpoint } = await getAuthServer(fetchFn);
  const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64');
  const res = await fetchFn(token_endpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body).toString(),
  });
  const json = (await res.json().catch(() => ({}))) as JdTokenSet & { error?: string; error_description?: string };
  if (!res.ok || !json.access_token) {
    throw new JohnDeereApiError(json.error_description || json.error || 'John Deere sign-in failed', res.status, json);
  }
  return json;
}

export function exchangeCode(
  opts: { code: string; redirectUri: string; scopes: string; clientId: string; clientSecret: string },
  fetchFn: FetchFn = fetch,
) {
  return tokenRequest(
    { grant_type: 'authorization_code', code: opts.code, redirect_uri: opts.redirectUri, scope: opts.scopes },
    opts,
    fetchFn,
  );
}

export function refreshTokens(
  opts: { refreshToken: string; redirectUri: string; scopes: string; clientId: string; clientSecret: string },
  fetchFn: FetchFn = fetch,
) {
  return tokenRequest(
    { grant_type: 'refresh_token', refresh_token: opts.refreshToken, redirect_uri: opts.redirectUri, scope: opts.scopes },
    opts,
    fetchFn,
  );
}

/** Calls the Operations Center API with a valid access token. */
export class JohnDeereApi {
  constructor(
    private env: JohnDeereEnvironment,
    private accessToken: string,
    private fetchFn: FetchFn = fetch,
  ) {}

  get baseUrl() { return JD_ENVIRONMENTS[this.env].apiUrl; }

  async get<T = any>(pathOrUrl: string): Promise<T> {
    const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${this.baseUrl}${pathOrUrl}`;
    let host = '';
    try { const u = new URL(url); host = u.protocol === 'https:' ? u.hostname : ''; } catch { /* invalid */ }
    if (!host.endsWith('.deere.com')) {
      throw new JohnDeereApiError('Refusing to call a non-Deere URL', 400);
    }
    const res = await this.fetchFn(url, {
      headers: { Authorization: `Bearer ${this.accessToken}`, Accept: JD_ACCEPT },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => undefined);
      throw new JohnDeereApiError(`John Deere API ${res.status} for ${url.replace(this.baseUrl, '')}`, res.status, body);
    }
    return (await res.json()) as T;
  }

  /** All values across pages, following `nextPage` links (capped for safety). */
  async getAll<T = any>(path: string, maxPages = 50): Promise<T[]> {
    const out: T[] = [];
    let next: string | undefined = path;
    for (let page = 0; next && page < maxPages; page += 1) {
      const body: { values?: T[]; links?: JdLink[] } = await this.get(next);
      out.push(...(body.values || []));
      next = body.links?.find((l) => l.rel === 'nextPage')?.uri;
    }
    return out;
  }

  /** Organizations the signed-in user can see; `connectionsUri` is set when one still has to be shared with the app. */
  async listOrganizations() {
    const orgs = await this.getAll<{ id: string; name: string; type?: string; member?: boolean; links?: JdLink[] }>('/organizations');
    return orgs.map((o) => ({
      id: String(o.id),
      name: o.name,
      type: o.type,
      connectionsUri: o.links?.find((l) => l.rel === 'connections')?.uri || null,
    }));
  }

  async listFields(orgId: string) {
    const fields = await this.getAll<{ id: string; name: string; archived?: boolean }>(
      `/organizations/${encodeURIComponent(orgId)}/fields`,
    );
    return fields.filter((f) => !f.archived).map((f) => ({ id: String(f.id), name: f.name }));
  }

  /**
   * Field operations for one field. With a date range the request is split
   * into Deere's seven-day windows; results are de-duplicated by operation id.
   */
  async listFieldOperations(
    orgId: string,
    fieldId: string,
    opts: { cropSeason?: string; fieldOperationType?: JdOperationType; startDate?: string; endDate?: string } = {},
  ) {
    const base = `/organizations/${encodeURIComponent(orgId)}/fields/${encodeURIComponent(fieldId)}/fieldOperations`;
    const common: Record<string, string> = { embed: 'measurementTypes' };
    if (opts.cropSeason) common.cropSeason = opts.cropSeason;
    if (opts.fieldOperationType) common.fieldOperationType = opts.fieldOperationType;

    const windows = opts.startDate && opts.endDate ? sevenDayWindows(opts.startDate, opts.endDate) : [null];
    const byId = new Map<string, any>();
    for (const w of windows) {
      const q = new URLSearchParams(common);
      if (w) { q.set('startDate', w.start); q.set('endDate', w.end); }
      const ops = await this.getAll<any>(`${base}?${q.toString()}`);
      ops.forEach((op) => byId.set(String(op.id), op));
    }
    return Array.from(byId.values());
  }
}

/** Splits [start, end] into inclusive windows of at most seven days (ISO-8601 strings). */
export function sevenDayWindows(startIso: string, endIso: string): Array<{ start: string; end: string }> {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    throw new JohnDeereApiError('Invalid date range', 400);
  }
  const out: Array<{ start: string; end: string }> = [];
  const dayMs = 24 * 60 * 60 * 1000;
  let cur = start.getTime();
  while (cur <= end.getTime()) {
    const winEnd = Math.min(cur + JD_MAX_WINDOW_DAYS * dayMs - 1000, end.getTime());
    out.push({ start: new Date(cur).toISOString(), end: new Date(winEnd).toISOString() });
    cur = winEnd + 1000;
  }
  return out;
}

/** Totals worth keeping from an operation's embedded measurementTypes. */
const KEEP = ['area', 'yield', 'averageYield', 'averageMoisture', 'wetMass', 'totalMaterial', 'averageMaterial', 'averageSpeed', 'averageDepth'];

export function summarizeMeasurements(op: any): Record<string, { value: number; unitId?: string }> {
  const out: Record<string, { value: number; unitId?: string }> = {};
  const list: any[] = op?.measurementTypes?.values || op?.measurementTypes || [];
  for (const m of Array.isArray(list) ? list : []) {
    for (const k of KEEP) {
      const v = m?.[k];
      if (v && typeof v.value === 'number' && out[k] === undefined) out[k] = { value: v.value, unitId: v.unitId };
    }
  }
  return out;
}
