import { dbPool } from '../db/client';
import { AppError } from './errors';

export async function assertFieldInOrganization(fieldId: string, organizationId: string): Promise<void> {
  const result = await dbPool.query(
    `SELECT id FROM fields WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [fieldId, organizationId],
  );
  if (result.rows.length === 0) {
    throw new AppError('Field not found in organization', 'FORBIDDEN', 403);
  }
}

export async function assertSiteInOrganization(siteId: string, organizationId: string): Promise<void> {
  const result = await dbPool.query(
    `SELECT id FROM sites WHERE id = $1 AND organization_id = $2`,
    [siteId, organizationId],
  );
  if (result.rows.length === 0) {
    throw new AppError('Site not found in organization', 'FORBIDDEN', 403);
  }
}
