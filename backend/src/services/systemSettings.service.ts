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
