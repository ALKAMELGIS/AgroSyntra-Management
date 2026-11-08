import crypto from 'crypto';
import { dbPool } from '../db/client';

const ENCRYPTION_KEY = process.env.SETTINGS_ENCRYPTION_KEY || process.env.JWT_SECRET || 'fallback-key-min-32-chars-long!!';
const ALGO = 'aes-256-cbc';

function getKey(): Buffer {
  return crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
}

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(payload: string): string {
  const [ivHex, encHex] = payload.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const encrypted = Buffer.from(encHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

export async function get(key: string): Promise<string | null> {
  const res = await dbPool.query('SELECT value, is_encrypted FROM system_settings WHERE key = $1', [key]);
  if (res.rows.length === 0) return null;
  const row = res.rows[0];
  if (row.is_encrypted) {
    try { return decrypt(row.value); } catch { return null; }
  }
  return row.value;
}

export async function set(key: string, value: string, encrypted = false, userId?: string): Promise<void> {
  const stored = encrypted ? encrypt(value) : value;
  await dbPool.query(
    `INSERT INTO system_settings (key, value, is_encrypted, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, is_encrypted = $3, updated_by = $4, updated_at = NOW()`,
    [key, stored, encrypted, userId || null]
  );
}

export async function remove(key: string): Promise<void> {
  await dbPool.query('DELETE FROM system_settings WHERE key = $1', [key]);
}

export async function getAIConfig(): Promise<{ provider: string; model: string; hasKey: boolean; keyMasked: string | null }> {
  const provider = (await get('ai_provider')) || 'anthropic';
  const model = (await get('ai_model')) || 'claude-sonnet-4-20250514';
  const apiKey = await get('ai_api_key');

  let keyMasked: string | null = null;
  if (apiKey) {
    keyMasked = apiKey.substring(0, 7) + '••••••••' + apiKey.slice(-4);
  }

  return { provider, model, hasKey: !!apiKey, keyMasked };
}

export async function setAIConfig(provider: string, model: string, apiKey?: string, userId?: string): Promise<void> {
  await set('ai_provider', provider, false, userId);
  await set('ai_model', model, false, userId);
  if (apiKey) {
    await set('ai_api_key', apiKey, true, userId);
  }
}

export async function getAIKey(): Promise<string | null> {
  return get('ai_api_key');
}

function maskApiKey(apiKey: string): string {
  return apiKey.substring(0, 7) + '••••••••' + apiKey.slice(-4);
}

export async function getOpenWeatherConfig(): Promise<{ hasKey: boolean; keyMasked: string | null }> {
  const apiKey = await resolveOpenWeatherKey();
  if (!apiKey) {
    return { hasKey: false, keyMasked: null };
  }
  return { hasKey: true, keyMasked: maskApiKey(apiKey) };
}

export async function getOpenWeatherKey(): Promise<string | null> {
  return get('openweather_api_key');
}

export async function resolveOpenWeatherKey(): Promise<string | null> {
  const dbKey = await getOpenWeatherKey();
  if (dbKey) return dbKey;
  const envKey = process.env.OPENWEATHER_API_KEY || '';
  return envKey || null;
}

export async function setOpenWeatherKey(apiKey: string, userId?: string): Promise<void> {
  await set('openweather_api_key', apiKey, true, userId);
}

export async function testOpenWeatherConnection(apiKey: string): Promise<{ success: boolean; message: string }> {
  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=24.7136&lon=46.6753&units=metric&appid=${apiKey}`;
    const res = await fetch(url);
    if (res.ok) return { success: true, message: 'Connected successfully to OpenWeatherMap' };
    const err = await res.text();
    return { success: false, message: `API error ${res.status}: ${err.substring(0, 120)}` };
  } catch (err: any) {
    return { success: false, message: `Connection failed: ${err.message}` };
  }
}

export async function testAIConnection(provider: string, model: string, apiKey: string): Promise<{ success: boolean; message: string }> {
  try {
    if (provider === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Say "ok"' }],
        }),
      });
      if (res.ok) return { success: true, message: 'Connected successfully' };
      const err = await res.text();
      return { success: false, message: `API error ${res.status}: ${err.substring(0, 100)}` };
    }

    if (provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Say "ok"' }],
        }),
      });
      if (res.ok) return { success: true, message: 'Connected successfully' };
      const err = await res.text();
      return { success: false, message: `API error ${res.status}: ${err.substring(0, 100)}` };
    }

    return { success: false, message: `Unsupported provider: ${provider}` };
  } catch (err: any) {
    return { success: false, message: `Connection failed: ${err.message}` };
  }
}

// ── Satellite imagery (Sentinel Hub / Copernicus Data Space) ───────────────
// The configuration (instance) ID stays on the server: the browser only gets
// map tiles through /satellite/wms, never the ID itself.

export type SentinelService = 'sentinel-hub' | 'copernicus';
const SENTINEL_HOSTS: Record<SentinelService, string> = {
  'sentinel-hub': 'https://services.sentinel-hub.com/ogc/wms/',
  copernicus: 'https://sh.dataspace.copernicus.eu/ogc/wms/',
};
const INSTANCE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isSentinelInstanceId(id: string): boolean {
  return INSTANCE_ID.test(String(id || '').trim());
}

export function sentinelWmsBase(instanceId: string, service: SentinelService = 'sentinel-hub'): string {
  return `${SENTINEL_HOSTS[service] || SENTINEL_HOSTS['sentinel-hub']}${instanceId}`;
}

/** Saved settings first, then the server environment. */
export async function resolveSentinel(): Promise<{ instanceId: string; service: SentinelService; wmsBase: string; ogcBase: string; baseLayer: string } | null> {
  const service = ((await get('sentinelhub_service')) as SentinelService) || 'sentinel-hub';
  const instanceId = (await get('sentinelhub_instance_id')) || process.env.SENTINELHUB_INSTANCE_ID || '';
  if (!isSentinelInstanceId(instanceId)) return null;
  const envUrl = !((await get('sentinelhub_instance_id'))) && process.env.SENTINELHUB_WMS_URL;
  const wmsBase = envUrl || sentinelWmsBase(instanceId, service);
  // ogcBase + '/wfs/<id>' or '/fis/<id>' for scenes and statistics.
  const ogcBase = wmsBase.replace(/\/wms\/[^/?]+.*$/, '');
  return { instanceId, service, wmsBase, ogcBase, baseLayer: (await get('sentinelhub_base_layer')) || 'TRUE_COLOR' };
}

export async function getSentinelConfig(): Promise<{ configured: boolean; idMasked: string | null; service: SentinelService; label: string | null }> {
  const cfg = await resolveSentinel();
  return {
    configured: Boolean(cfg),
    idMasked: cfg ? `${cfg.instanceId.slice(0, 4)}••••-••••-${cfg.instanceId.slice(-4)}` : null,
    service: cfg?.service || ((await get('sentinelhub_service')) as SentinelService) || 'sentinel-hub',
    label: await get('sentinelhub_label'),
  };
}

/** The configuration layer used as data source for our own index scripts (a Sentinel-2 L2A layer). */
export function pickBaseLayer(layers: Array<{ id: string; title: string }>): string {
  const ids = layers.map((l) => l.id);
  return ids.find((id) => /^TRUE[_-]?COLOR$/i.test(id))
    || ids.find((id) => /TRUE|NATURAL|L2A|NDVI/i.test(id))
    || ids[0] || 'TRUE_COLOR';
}

export async function setSentinelConfig(instanceId: string, service: SentinelService, label: string | null, userId?: string, baseLayer?: string): Promise<void> {
  await set('sentinelhub_instance_id', instanceId.trim(), true, userId);
  await set('sentinelhub_service', service, false, userId);
  if (baseLayer) await set('sentinelhub_base_layer', baseLayer, false, userId);
  if (label !== null) await set('sentinelhub_label', label.slice(0, 120), false, userId);
}

/** Layer names from WMS GetCapabilities, e.g. TRUE_COLOR, NDVI. */
export function parseWmsLayers(xml: string): Array<{ id: string; title: string }> {
  const out: Array<{ id: string; title: string }> = [];
  const re = /<Layer[^>]*>\s*<Name>([^<]+)<\/Name>\s*<Title>([^<]*)<\/Title>/g;
  let m: RegExpExecArray | null;
  // eslint-disable-next-line no-cond-assign
  while ((m = re.exec(xml))) out.push({ id: m[1].trim(), title: m[2].trim() || m[1].trim() });
  return out;
}

export async function testSentinelConnection(instanceId: string, service: SentinelService): Promise<{ success: boolean; message: string; layers: Array<{ id: string; title: string }>; service: SentinelService }> {
  if (!isSentinelInstanceId(instanceId)) {
    return { success: false, message: 'The configuration ID must be a UUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)', layers: [], service };
  }
  // Try the chosen service first, then the other one (the same ID works on only one of them).
  const order: SentinelService[] = service === 'copernicus' ? ['copernicus', 'sentinel-hub'] : ['sentinel-hub', 'copernicus'];
  let last = '';
  for (const svc of order) {
    try {
      const res = await fetch(`${sentinelWmsBase(instanceId, svc)}?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.3.0`, { signal: AbortSignal.timeout(15000) });
      const text = await res.text();
      if (res.ok && /<WMS_Capabilities|<WMT_MS_Capabilities/.test(text)) {
        const layers = parseWmsLayers(text);
        return { success: true, message: `Connected (${svc === 'copernicus' ? 'Copernicus Data Space' : 'Sentinel Hub'}) · ${layers.length} layers`, layers, service: svc };
      }
      last = `${svc}: HTTP ${res.status}`;
    } catch (err: any) {
      last = `${svc}: ${err.message}`;
    }
  }
  return { success: false, message: `Could not read the configuration (${last}).`, layers: [], service };
}
