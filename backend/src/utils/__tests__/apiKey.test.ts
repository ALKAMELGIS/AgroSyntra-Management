import { API_KEY_PREFIX_LENGTH, generateApiKey } from '../apiKey';

describe('generateApiKey', () => {
  it('stores a prefix that fits api_keys.key_prefix (VARCHAR 32) and identifies almaha_ keys', () => {
    const { rawKey, keyHash, keyPrefix } = generateApiKey();

    expect(rawKey.startsWith('almaha_')).toBe(true);
    expect(rawKey.length).toBeGreaterThan(API_KEY_PREFIX_LENGTH);
    expect(keyPrefix).toBe(rawKey.substring(0, API_KEY_PREFIX_LENGTH));
    expect(keyPrefix.length).toBe(15);
    expect(keyPrefix.length).toBeLessThanOrEqual(32);
    expect(keyHash).toHaveLength(64);
  });
});
