import { dbPool } from '../db/client';
import { UserRole } from '../models/user.model';

const ROLE_MODULE_DEFAULTS: Record<string, Record<string, string[]>> = {
  ceo:               { '*': ['read', 'write', 'admin'] },
  farm_manager:      { '*': ['read', 'write', 'admin'] },
  operation_manager: { '*': ['read', 'write'] },
  agronomist:        { '*': ['read'], recipes: ['read'], inventory: ['read'] },
  worker:            { '*': ['read'] },
};

export async function hasPermission(
  userId: string,
  role: UserRole,
  module: string,
  permission: 'read' | 'write' | 'admin',
): Promise<boolean> {
  const defaults = ROLE_MODULE_DEFAULTS[role] || {};
  const wildcard = defaults['*'] || [];
  const moduleDefaults = defaults[module] || [];
  if (wildcard.includes(permission) || moduleDefaults.includes(permission)) {
    return true;
  }

  try {
    const result = await dbPool.query(
      `SELECT 1 FROM user_permissions
       WHERE user_id = $1 AND module = $2 AND permission = $3
       LIMIT 1`,
      [userId, module, permission],
    );
    return (result.rowCount ?? 0) > 0;
  } catch (err: any) {
    if (err.code === '42P01') return false;
    throw err;
  }
}

export async function listPermissions(userId: string) {
  const result = await dbPool.query(
    `SELECT up.*, u.name AS granted_by_name
     FROM user_permissions up
     LEFT JOIN users u ON u.id = up.granted_by
     WHERE up.user_id = $1
     ORDER BY up.module, up.permission`,
    [userId],
  );
  return result.rows;
}

export async function grantPermission(
  userId: string,
  module: string,
  permission: string,
  grantedBy: string,
) {
  const result = await dbPool.query(
    `INSERT INTO user_permissions (user_id, module, permission, granted_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, module, permission) DO NOTHING
     RETURNING *`,
    [userId, module, permission, grantedBy],
  );
  return result.rows[0];
}

export async function revokePermission(id: string) {
  await dbPool.query('DELETE FROM user_permissions WHERE id = $1', [id]);
}

export async function listUserPermissions(userId: string) {
  return listPermissions(userId);
}

export const AVAILABLE_MODULES = [
  'recipes', 'inventory', 'fertigation', 'ecph', 'harvest',
  'ipm', 'tasks', 'shifts', 'manpower', 'weather',
  'gis', 'costs', 'reports', 'api_integrations',
];
