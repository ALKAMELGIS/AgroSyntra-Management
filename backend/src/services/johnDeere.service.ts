import crypto from 'crypto';
import { dbPool } from '../db/client';
import { config } from '../config';
import { logger } from '../utils/logger';
import { seal, open } from '../utils/secretBox';
import {
  JD_DEFAULT_SCOPES, JD_ENVIRONMENTS, JD_OPERATION_TYPES, JohnDeereApi, JohnDeereApiError,
  buildAuthorizeUrl, exchangeCode, refreshTokens, summarizeMeasurements,
  type JdOperationType, type JohnDeereEnvironment, type JdTokenSet,
} from '../external/johnDeere.client';

/**
 * John Deere Operations Center connection for one AgroCloud organization.
 *
 *  1. Settings   — environment (Sandbox / Production), the app's Client ID and secret
 *                  from developer.deere.com, and the redirect URI registered there.
 *  2. Sign in    — OAuth 2 with John Deere; tokens are stored encrypted.
 *  3. Share      — the farm shares its Operations Center organization with the app
 *                  (connections link from Deere), then picks it here.
 *  4. Fields     — Deere fields are linked to AgroCloud fields (suggested by name).
 *  5. Sync       — field operations are read into john_deere_field_operations.
 */

export class JohnDeereError extends Error {
  constructor(message: string, public status = 400, public code = 'JOHN_DEERE') { super(message); }
}

const STATE_TTL_MS = 10 * 60 * 1000;

export function defaultRedirectUri(): string {
  return process.env.JOHN_DEERE_REDIRECT_URI || `${config.appUrl.replace(/\/$/, '')}/api/v1/integrations/john-deere/callback`;
}

async function getRow(orgId: string) {
  const r = await dbPool.query('SELECT * FROM john_deere_connections WHERE organization_id = $1', [orgId]);
  return r.rows[0] || null;
}

function publicStatus(row: any) {
  const env: JohnDeereEnvironment = row?.environment || 'sandbox';
  const mapping = row?.field_mapping || {};
  return {
    environment: env,
    environments: Object.entries(JD_ENVIRONMENTS).map(([key, v]) => ({ key, label: v.label, apiUrl: v.apiUrl })),
    clientId: row?.client_id || '',
    hasClientSecret: Boolean(row?.client_secret_enc),
    redirectUri: row?.redirect_uri || defaultRedirectUri(),
    defaultRedirectUri: defaultRedirectUri(),
    scopes: row?.scopes || JD_DEFAULT_SCOPES,
    signedIn: Boolean(row?.refresh_token_enc || row?.access_token_enc),
    connectedAt: row?.connected_at || null,
    tokenExpiresAt: row?.token_expires_at || null,
    organization: row?.jd_org_id ? { id: row.jd_org_id, name: row.jd_org_name } : null,
    mappedFields: Object.values(mapping).filter(Boolean).length,
    lastSyncAt: row?.last_sync_at || null,
    lastSyncSummary: row?.last_sync_summary || null,
  };
}

export async function getStatus(orgId: string) {
  return publicStatus(await getRow(orgId));
}

export async function saveSettings(
  orgId: string,
  input: { environment?: string; clientId?: string; clientSecret?: string; redirectUri?: string },
) {
  const env = (input.environment || 'sandbox') as JohnDeereEnvironment;
  if (!JD_ENVIRONMENTS[env]) throw new JohnDeereError('Unknown environment');
  const clientId = (input.clientId || '').trim();
  if (!clientId) throw new JohnDeereError('Client ID is required');
  const redirectUri = (input.redirectUri || '').trim() || defaultRedirectUri();
  if (!/^https?:\/\//.test(redirectUri)) throw new JohnDeereError('Redirect URI must start with https://');

  const existing = await getRow(orgId);
  const secretEnc = input.clientSecret ? seal(input.clientSecret.trim()) : existing?.client_secret_enc || null;
  if (!secretEnc) throw new JohnDeereError('Client secret is required');
  // A different app or environment means different access: sign in again.
  const resetTokens = existing && (existing.client_id !== clientId || existing.environment !== env);

  await dbPool.query(
    `INSERT INTO john_deere_connections (organization_id, environment, client_id, client_secret_enc, redirect_uri, scopes)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (organization_id) DO UPDATE SET
       environment = EXCLUDED.environment, client_id = EXCLUDED.client_id,
       client_secret_enc = EXCLUDED.client_secret_enc, redirect_uri = EXCLUDED.redirect_uri,
       updated_at = NOW()
       ${resetTokens ? ', access_token_enc = NULL, refresh_token_enc = NULL, token_expires_at = NULL, jd_org_id = NULL, jd_org_name = NULL' : ''}`,
    [orgId, env, clientId, secretEnc, redirectUri, JD_DEFAULT_SCOPES],
  );
  return getStatus(orgId);
}

/** Step 2: the URL that sends the user to John Deere's sign-in page. */
export async function startAuthorization(orgId: string, userId?: string) {
  const row = await getRow(orgId);
  if (!row?.client_id || !row?.client_secret_enc) throw new JohnDeereError('Save the John Deere app settings first');
  const state = crypto.randomBytes(24).toString('hex');
  await dbPool.query(
    `UPDATE john_deere_connections SET oauth_state = $2, oauth_state_expires_at = $3,
       connected_by = COALESCE($4::uuid, connected_by), updated_at = NOW() WHERE organization_id = $1`,
    [orgId, state, new Date(Date.now() + STATE_TTL_MS), userId || null],
  );
  const url = await buildAuthorizeUrl({ clientId: row.client_id, redirectUri: row.redirect_uri || defaultRedirectUri(), scopes: row.scopes, state });
  return { url };
}

async function storeTokens(orgId: string, tokens: JdTokenSet, completing?: { userId?: string | null }) {
  const expiresAt = new Date(Date.now() + Math.max(60, (tokens.expires_in || 3600) - 60) * 1000);
  const params: unknown[] = [orgId, seal(tokens.access_token), tokens.refresh_token ? seal(tokens.refresh_token) : null, expiresAt];
  let extra = '';
  if (completing) {
    params.push(completing.userId || null);
    extra = `, oauth_state = NULL, oauth_state_expires_at = NULL, connected_at = NOW(), connected_by = COALESCE($5::uuid, connected_by)`;
  }
  await dbPool.query(
    `UPDATE john_deere_connections SET access_token_enc = $2,
       refresh_token_enc = COALESCE($3, refresh_token_enc), token_expires_at = $4, updated_at = NOW()${extra}
     WHERE organization_id = $1`,
    params,
  );
}

/** Deere redirects back here with ?code&state (no AgroCloud session on this request). */
export async function completeAuthorization(state: string, code: string, userId?: string) {
  if (!state || !code) throw new JohnDeereError('Missing sign-in response from John Deere');
  const r = await dbPool.query(
    `SELECT * FROM john_deere_connections WHERE oauth_state = $1 AND oauth_state_expires_at > NOW()`,
    [state],
  );
  const row = r.rows[0];
  if (!row) throw new JohnDeereError('This sign-in link has expired. Start again from AgroCloud.', 400, 'STATE');
  const tokens = await exchangeCode({
    code, redirectUri: row.redirect_uri || defaultRedirectUri(), scopes: row.scopes,
    clientId: row.client_id, clientSecret: open(row.client_secret_enc) || '',
  });
  await storeTokens(row.organization_id, tokens, { userId: userId || null });
  return { organizationId: row.organization_id };
}

/** An API client with a valid access token (refreshed when it is about to expire). */
export async function getApi(orgId: string): Promise<JohnDeereApi> {
  const row = await getRow(orgId);
  if (!row?.access_token_enc && !row?.refresh_token_enc) throw new JohnDeereError('Not signed in to John Deere', 409, 'NOT_SIGNED_IN');
  let access = open(row.access_token_enc);
  const expiring = !row.token_expires_at || new Date(row.token_expires_at).getTime() < Date.now() + 60_000;
  if (!access || expiring) {
    const refresh = open(row.refresh_token_enc);
    if (!refresh) throw new JohnDeereError('John Deere sign-in has expired. Sign in again.', 409, 'NOT_SIGNED_IN');
    try {
      const tokens = await refreshTokens({
        refreshToken: refresh, redirectUri: row.redirect_uri || defaultRedirectUri(), scopes: row.scopes,
        clientId: row.client_id, clientSecret: open(row.client_secret_enc) || '',
      });
      await storeTokens(orgId, tokens);
      access = tokens.access_token;
    } catch (e) {
      logger.warn({ orgId, error: (e as Error).message }, 'John Deere token refresh failed');
      throw new JohnDeereError('John Deere sign-in has expired. Sign in again.', 409, 'NOT_SIGNED_IN');
    }
  }
  return new JohnDeereApi(row.environment, access as string);
}

/** Step 3: Operations Center organizations; `connectionsUri` = still needs to be shared with the app. */
export async function listOrganizations(orgId: string, returnUrl?: string) {
  const api = await getApi(orgId);
  const orgs = await api.listOrganizations();
  const back = returnUrl || `${config.appUrl.replace(/\/$/, '')}/admin/integrations/john-deere`;
  return orgs.map((o) => ({
    ...o,
    connectionsUri: o.connectionsUri ? `${o.connectionsUri}${o.connectionsUri.includes('?') ? '&' : '?'}redirect_uri=${encodeURIComponent(back)}` : null,
  }));
}

export async function selectOrganization(orgId: string, jdOrgId: string, jdOrgName?: string) {
  if (!jdOrgId) throw new JohnDeereError('Choose an organization');
  await dbPool.query(
    `UPDATE john_deere_connections SET jd_org_id = $2, jd_org_name = $3, field_mapping = '{}'::jsonb, updated_at = NOW() WHERE organization_id = $1`,
    [orgId, String(jdOrgId), jdOrgName || null],
  );
  return getStatus(orgId);
}

const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, '');

/** Step 4: Deere fields with their linked AgroCloud field (or a suggestion by name). */
export async function listFieldsWithMapping(orgId: string) {
  const row = await getRow(orgId);
  if (!row?.jd_org_id) throw new JohnDeereError('Choose an Operations Center organization first', 409, 'NO_ORG');
  const api = await getApi(orgId);
  const jdFields = await api.listFields(row.jd_org_id);
  const ours = (await dbPool.query(
    `SELECT id, name FROM fields WHERE organization_id = $1 AND deleted_at IS NULL ORDER BY name`, [orgId],
  )).rows as Array<{ id: string; name: string }>;
  const byName = new Map(ours.map((f) => [norm(f.name), f.id]));
  const mapping = row.field_mapping || {};
  return {
    agrocloudFields: ours,
    fields: jdFields.map((f) => ({
      jdFieldId: f.id,
      jdFieldName: f.name,
      fieldId: mapping[f.id] || null,
      suggestedFieldId: mapping[f.id] ? null : byName.get(norm(f.name)) || null,
    })),
  };
}

export async function saveFieldMapping(orgId: string, mapping: Record<string, string | null>) {
  const ids = Object.values(mapping || {}).filter(Boolean) as string[];
  if (ids.length) {
    const ok = await dbPool.query(
      `SELECT id FROM fields WHERE organization_id = $1 AND id = ANY($2::uuid[]) AND deleted_at IS NULL`, [orgId, ids],
    );
    if (ok.rowCount !== new Set(ids).size) throw new JohnDeereError('A linked field does not belong to this organization');
  }
  const clean: Record<string, string> = {};
  Object.entries(mapping || {}).forEach(([k, v]) => { if (v) clean[String(k)] = String(v); });
  await dbPool.query(
    `UPDATE john_deere_connections SET field_mapping = $2::jsonb, updated_at = NOW() WHERE organization_id = $1`,
    [orgId, JSON.stringify(clean)],
  );
  // Re-link operations already read.
  await dbPool.query(
    `UPDATE john_deere_field_operations o SET field_id = (m.value)::uuid
       FROM jsonb_each_text($2::jsonb) m
      WHERE o.organization_id = $1 AND o.jd_field_id = m.key`,
    [orgId, JSON.stringify(clean)],
  );
  return getStatus(orgId);
}

/** Step 5: read field operations into AgroCloud. */
export async function syncFieldOperations(
  orgId: string,
  opts: { cropSeason?: string; types?: string[]; startDate?: string; endDate?: string; onlyMapped?: boolean },
) {
  const row = await getRow(orgId);
  if (!row?.jd_org_id) throw new JohnDeereError('Choose an Operations Center organization first', 409, 'NO_ORG');
  if (!opts.cropSeason && !(opts.startDate && opts.endDate)) throw new JohnDeereError('Choose a crop season or a date range');
  const types = (opts.types && opts.types.length ? opts.types : [...JD_OPERATION_TYPES])
    .map((t) => t.toUpperCase()).filter((t): t is JdOperationType => (JD_OPERATION_TYPES as readonly string[]).includes(t));
  const api = await getApi(orgId);
  const mapping: Record<string, string> = row.field_mapping || {};
  const jdFields = await api.listFields(row.jd_org_id);
  const fields = opts.onlyMapped === false ? jdFields : jdFields.filter((f) => mapping[f.id]);

  const summary: Record<string, number> = {};
  const errors: string[] = [];
  let saved = 0;
  for (const f of fields) {
    for (const type of types) {
      try {
        const ops = await api.listFieldOperations(row.jd_org_id, f.id, {
          cropSeason: opts.cropSeason, fieldOperationType: type, startDate: opts.startDate, endDate: opts.endDate,
        });
        for (const op of ops) {
          await dbPool.query(
            `INSERT INTO john_deere_field_operations
               (organization_id, jd_operation_id, jd_org_id, jd_field_id, jd_field_name, field_id, operation_type,
                crop_season, crop_name, start_date, end_date, modified_time, measurements, products, varieties, raw, synced_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW())
             ON CONFLICT (organization_id, jd_operation_id) DO UPDATE SET
               jd_field_name = EXCLUDED.jd_field_name, field_id = EXCLUDED.field_id, operation_type = EXCLUDED.operation_type,
               crop_season = EXCLUDED.crop_season, crop_name = EXCLUDED.crop_name, start_date = EXCLUDED.start_date,
               end_date = EXCLUDED.end_date, modified_time = EXCLUDED.modified_time, measurements = EXCLUDED.measurements,
               products = EXCLUDED.products, varieties = EXCLUDED.varieties, raw = EXCLUDED.raw, synced_at = NOW()`,
            [
              orgId, String(op.id), row.jd_org_id, f.id, f.name, mapping[f.id] || null,
              String(op.fieldOperationType || type).toUpperCase(), op.cropSeason || null, op.cropName || null,
              op.startDate || null, op.endDate || null, op.modifiedTime || null,
              JSON.stringify(summarizeMeasurements(op)), JSON.stringify(op.products ?? null), JSON.stringify(op.varieties ?? null),
              JSON.stringify(op),
            ],
          );
          saved += 1;
          summary[type] = (summary[type] || 0) + 1;
        }
      } catch (e) {
        if (e instanceof JohnDeereApiError && e.status === 403) {
          errors.push(`${f.name}: no access to ${type.toLowerCase()} data`);
        } else {
          errors.push(`${f.name} (${type.toLowerCase()}): ${(e as Error).message}`);
        }
      }
    }
  }
  const result = { fieldsScanned: fields.length, operations: saved, byType: summary, errors: errors.slice(0, 20) };
  await dbPool.query(
    `UPDATE john_deere_connections SET last_sync_at = NOW(), last_sync_summary = $2::jsonb, updated_at = NOW() WHERE organization_id = $1`,
    [orgId, JSON.stringify(result)],
  );
  return result;
}

export async function listOperations(orgId: string, q: { type?: string; fieldId?: string; season?: string; limit?: number }) {
  const where = ['o.organization_id = $1'];
  const params: unknown[] = [orgId];
  if (q.type) { params.push(q.type.toUpperCase()); where.push(`o.operation_type = $${params.length}`); }
  if (q.fieldId) { params.push(q.fieldId); where.push(`o.field_id = $${params.length}`); }
  if (q.season) { params.push(q.season); where.push(`o.crop_season = $${params.length}`); }
  params.push(Math.min(Math.max(Number(q.limit) || 200, 1), 1000));
  const r = await dbPool.query(
    `SELECT o.id, o.jd_operation_id, o.jd_field_id, o.jd_field_name, o.field_id, f.name AS field_name,
            o.operation_type, o.crop_season, o.crop_name, o.start_date, o.end_date, o.measurements,
            o.products, o.varieties, o.synced_at
       FROM john_deere_field_operations o
       LEFT JOIN fields f ON f.id = o.field_id
      WHERE ${where.join(' AND ')}
      ORDER BY o.start_date DESC NULLS LAST
      LIMIT $${params.length}`,
    params,
  );
  return r.rows;
}

export async function disconnect(orgId: string) {
  await dbPool.query(
    `UPDATE john_deere_connections SET access_token_enc = NULL, refresh_token_enc = NULL, token_expires_at = NULL,
       jd_org_id = NULL, jd_org_name = NULL, oauth_state = NULL, connected_at = NULL, updated_at = NOW()
     WHERE organization_id = $1`, [orgId],
  );
  return getStatus(orgId);
}
