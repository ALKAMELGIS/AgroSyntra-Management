import crypto from 'crypto';

/** Display prefix stored on api_keys.key_prefix (`almaha_` + 8 hex chars). */
export const API_KEY_PREFIX_LENGTH = 15;

export function generateApiKey(): { rawKey: string; keyHash: string; keyPrefix: string } {
  const rawKey = `almaha_${crypto.randomBytes(32).toString('hex')}`;
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const keyPrefix = rawKey.substring(0, API_KEY_PREFIX_LENGTH);
  return { rawKey, keyHash, keyPrefix };
}
