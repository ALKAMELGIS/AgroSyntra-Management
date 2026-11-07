import crypto from 'crypto';

/**
 * Small authenticated-encryption helper (AES-256-GCM) for secrets kept in the
 * database: third-party client secrets and OAuth tokens.
 *
 * Key: SECRET_BOX_KEY (any string, hashed to 32 bytes) or, if unset, derived
 * from JWT_SECRET. Rotating the key makes stored values unreadable (the user
 * reconnects), never readable by the wrong key.
 *
 * Format: "v1:<iv b64>:<tag b64>:<ciphertext b64>"
 */
function key(): Buffer {
  const material = process.env.SECRET_BOX_KEY || process.env.JWT_SECRET;
  if (!material) throw new Error('SECRET_BOX_KEY or JWT_SECRET must be set to store secrets');
  return crypto.createHash('sha256').update(`agrocloud-secret-box:${material}`).digest();
}

export function seal(plain: string | null | undefined): string | null {
  if (plain === null || plain === undefined || plain === '') return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

export function open(sealed: string | null | undefined): string | null {
  if (!sealed) return null;
  const parts = sealed.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') return null;
  try {
    const [, ivB64, tagB64, dataB64] = parts;
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null; // wrong key or tampered value
  }
}
