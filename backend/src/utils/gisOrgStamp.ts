import { dbPool } from '../db/client';

export type OrgStampTable = 'countries' | 'sites' | 'fields';

export function stampOrgIfNullSql(table: OrgStampTable): string {
  switch (table) {
    case 'countries':
      return `UPDATE countries SET organization_id = $2, updated_at = NOW() WHERE id = $1 AND organization_id IS NULL`;
    case 'sites':
      return `UPDATE sites SET organization_id = $2, updated_at = NOW() WHERE id = $1 AND organization_id IS NULL`;
    case 'fields':
      return `UPDATE fields SET organization_id = $2, updated_at = NOW() WHERE id = $1 AND organization_id IS NULL`;
    default: {
      const _exhaustive: never = table;
      throw new Error(`Unknown org stamp table: ${_exhaustive}`);
    }
  }
}

export async function stampOrgIfNull(
  table: OrgStampTable,
  id: string,
  organizationId: string,
): Promise<void> {
  await dbPool.query(stampOrgIfNullSql(table), [id, organizationId]);
}
