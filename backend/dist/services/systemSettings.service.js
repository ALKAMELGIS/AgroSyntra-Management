"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.get = get;
exports.set = set;
exports.remove = remove;
exports.getAIConfig = getAIConfig;
exports.setAIConfig = setAIConfig;
exports.getAIKey = getAIKey;
exports.getOpenWeatherConfig = getOpenWeatherConfig;
exports.getOpenWeatherKey = getOpenWeatherKey;
exports.resolveOpenWeatherKey = resolveOpenWeatherKey;
exports.setOpenWeatherKey = setOpenWeatherKey;
exports.testOpenWeatherConnection = testOpenWeatherConnection;
exports.testAIConnection = testAIConnection;
const crypto_1 = __importDefault(require("crypto"));
const client_1 = require("../db/client");
const ENCRYPTION_KEY = process.env.SETTINGS_ENCRYPTION_KEY || process.env.JWT_SECRET || 'fallback-key-min-32-chars-long!!';
const ALGO = 'aes-256-cbc';
function getKey() {
    return crypto_1.default.createHash('sha256').update(ENCRYPTION_KEY).digest();
}
function encrypt(text) {
    const iv = crypto_1.default.randomBytes(16);
    const cipher = crypto_1.default.createCipheriv(ALGO, getKey(), iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}
function decrypt(payload) {
    const [ivHex, encHex] = payload.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const encrypted = Buffer.from(encHex, 'hex');
    const decipher = crypto_1.default.createDecipheriv(ALGO, getKey(), iv);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
async function get(key) {
    const res = await client_1.dbPool.query('SELECT value, is_encrypted FROM system_settings WHERE key = $1', [key]);
    if (res.rows.length === 0)
        return null;
    const row = res.rows[0];
    if (row.is_encrypted) {
        try {
            return decrypt(row.value);
        }
        catch {
            return null;
        }
    }
    return row.value;
}
async function set(key, value, encrypted = false, userId) {
    const stored = encrypted ? encrypt(value) : value;
    await client_1.dbPool.query(`INSERT INTO system_settings (key, value, is_encrypted, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, is_encrypted = $3, updated_by = $4, updated_at = NOW()`, [key, stored, encrypted, userId || null]);
}
async function remove(key) {
    await client_1.dbPool.query('DELETE FROM system_settings WHERE key = $1', [key]);
}
async function getAIConfig() {
    const provider = (await get('ai_provider')) || 'anthropic';
    const model = (await get('ai_model')) || 'claude-sonnet-4-20250514';
    const apiKey = await get('ai_api_key');
    let keyMasked = null;
    if (apiKey) {
        keyMasked = apiKey.substring(0, 7) + '••••••••' + apiKey.slice(-4);
    }
    return { provider, model, hasKey: !!apiKey, keyMasked };
}
async function setAIConfig(provider, model, apiKey, userId) {
    await set('ai_provider', provider, false, userId);
    await set('ai_model', model, false, userId);
    if (apiKey) {
        await set('ai_api_key', apiKey, true, userId);
    }
}
async function getAIKey() {
    return get('ai_api_key');
}
function maskApiKey(apiKey) {
    return apiKey.substring(0, 7) + '••••••••' + apiKey.slice(-4);
}
async function getOpenWeatherConfig() {
    const apiKey = await resolveOpenWeatherKey();
    if (!apiKey) {
        return { hasKey: false, keyMasked: null };
    }
    return { hasKey: true, keyMasked: maskApiKey(apiKey) };
}
async function getOpenWeatherKey() {
    return get('openweather_api_key');
}
async function resolveOpenWeatherKey() {
    const dbKey = await getOpenWeatherKey();
    if (dbKey)
        return dbKey;
    const envKey = process.env.OPENWEATHER_API_KEY || '';
    return envKey || null;
}
async function setOpenWeatherKey(apiKey, userId) {
    await set('openweather_api_key', apiKey, true, userId);
}
async function testOpenWeatherConnection(apiKey) {
    try {
        const url = `https://api.openweathermap.org/data/2.5/weather?lat=24.7136&lon=46.6753&units=metric&appid=${apiKey}`;
        const res = await fetch(url);
        if (res.ok)
            return { success: true, message: 'Connected successfully to OpenWeatherMap' };
        const err = await res.text();
        return { success: false, message: `API error ${res.status}: ${err.substring(0, 120)}` };
    }
    catch (err) {
        return { success: false, message: `Connection failed: ${err.message}` };
    }
}
async function testAIConnection(provider, model, apiKey) {
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
            if (res.ok)
                return { success: true, message: 'Connected successfully' };
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
            if (res.ok)
                return { success: true, message: 'Connected successfully' };
            const err = await res.text();
            return { success: false, message: `API error ${res.status}: ${err.substring(0, 100)}` };
        }
        return { success: false, message: `Unsupported provider: ${provider}` };
    }
    catch (err) {
        return { success: false, message: `Connection failed: ${err.message}` };
    }
}
