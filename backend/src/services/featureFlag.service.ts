import { dbPool } from '../db/client';
import { logger } from '../utils/logger';

interface FeatureFlag {
  id: string;
  key: string;
  enabled: boolean;
  description: string;
  roles: string[];
  created_at: string;
  updated_at: string;
}

let cache: Map<string, FeatureFlag> = new Map();
let cacheExpiry = 0;
const CACHE_TTL_MS = 60_000;

async function refreshCache(): Promise<void> {
  if (Date.now() < cacheExpiry) return;
  try {
    const result = await dbPool.query('SELECT * FROM feature_flags');
    cache = new Map(result.rows.map((r: FeatureFlag) => [r.key, r]));
    cacheExpiry = Date.now() + CACHE_TTL_MS;
  } catch (err: any) {
    if (err.code === '42P01') {
      cache = new Map();
      cacheExpiry = Date.now() + CACHE_TTL_MS;
      return;
    }
    logger.error({ err: err.message }, 'Failed to refresh feature flag cache');
  }
}

export async function isFeatureEnabled(key: string, userRole?: string): Promise<boolean> {
  await refreshCache();
  const flag = cache.get(key);
  if (!flag) return true;
  if (!flag.enabled) return false;
  if (flag.roles && flag.roles.length > 0 && userRole) {
    return flag.roles.includes(userRole);
  }
  return true;
}

export async function listFlags(): Promise<FeatureFlag[]> {
  const result = await dbPool.query('SELECT * FROM feature_flags ORDER BY key');
  return result.rows;
}

export async function updateFlag(id: string, data: Partial<{ enabled: boolean; description: string; roles: string[] }>) {
  const sets: string[] = [];
  const vals: any[] = [];
  let p = 1;
  if (data.enabled !== undefined) { sets.push(`enabled = $${p++}`); vals.push(data.enabled); }
  if (data.description !== undefined) { sets.push(`description = $${p++}`); vals.push(data.description); }
  if (data.roles !== undefined) { sets.push(`roles = $${p++}`); vals.push(data.roles); }
  sets.push(`updated_at = NOW()`);
  vals.push(id);

  const result = await dbPool.query(
    `UPDATE feature_flags SET ${sets.join(', ')} WHERE id = $${p} RETURNING *`,
    vals,
  );
  cacheExpiry = 0;
  return result.rows[0];
}

export async function createFlag(key: string, description: string, enabled = false) {
  const result = await dbPool.query(
    `INSERT INTO feature_flags (key, description, enabled) VALUES ($1, $2, $3) RETURNING *`,
    [key, description, enabled],
  );
  cacheExpiry = 0;
  return result.rows[0];
}

export async function deleteFlag(id: string) {
  await dbPool.query('DELETE FROM feature_flags WHERE id = $1', [id]);
  cacheExpiry = 0;
}
