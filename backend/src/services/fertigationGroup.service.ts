import { dbPool } from '../db/client';
import { AppError, NotFoundError } from '../utils/errors';
import { assertRecipesApproved } from './recipe.service';

export interface FertigationFieldGroup {
  id: string;
  organizationId: string;
  siteId: string;
  name: string;
  fieldIds: string[];
  defaultRecipeId?: string | null;
  createdAt: string;
  updatedAt: string;
}

function mapGroup(row: Record<string, unknown>): FertigationFieldGroup {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    siteId: row.site_id as string,
    name: row.name as string,
    fieldIds: (row.field_ids as string[]) || [],
    defaultRecipeId: (row.default_recipe_id as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

async function assertFieldsBelongToSite(siteId: string, fieldIds: string[], organizationId: string) {
  if (!fieldIds.length) {
    throw new AppError('At least one field is required', 'VALIDATION_ERROR', 400);
  }

  const result = await dbPool.query(
    `SELECT f.id
     FROM fields f
     JOIN farm_areas fa ON fa.id = f.farm_area_id
     JOIN sites s ON s.id = fa.site_id
     WHERE fa.site_id = $1
       AND f.deleted_at IS NULL
       AND f.id = ANY($2::uuid[])
       AND COALESCE(f.organization_id, s.organization_id) = $3`,
    [siteId, fieldIds, organizationId],
  );

  if (result.rowCount !== fieldIds.length) {
    throw new AppError('One or more fields do not belong to this site', 'VALIDATION_ERROR', 400);
  }
}

export async function listGroups(siteId: string, organizationId: string): Promise<FertigationFieldGroup[]> {
  const result = await dbPool.query(
    `SELECT *
     FROM fertigation_field_groups
     WHERE site_id = $1 AND organization_id = $2
     ORDER BY name ASC`,
    [siteId, organizationId],
  );
  return result.rows.map(mapGroup);
}

export async function createGroup(input: {
  organizationId: string;
  siteId: string;
  name: string;
  fieldIds: string[];
  defaultRecipeId?: string | null;
}): Promise<FertigationFieldGroup> {
  const name = input.name.trim();
  if (!name) throw new AppError('Group name is required', 'VALIDATION_ERROR', 400);

  await assertFieldsBelongToSite(input.siteId, input.fieldIds, input.organizationId);
  await assertRecipesApproved([input.defaultRecipeId]);

  const result = await dbPool.query(
    `INSERT INTO fertigation_field_groups
       (organization_id, site_id, name, field_ids, default_recipe_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [input.organizationId, input.siteId, name, input.fieldIds, input.defaultRecipeId ?? null],
  );
  return mapGroup(result.rows[0]);
}

export async function updateGroup(
  id: string,
  organizationId: string,
  input: {
    name?: string;
    fieldIds?: string[];
    defaultRecipeId?: string | null;
  },
): Promise<FertigationFieldGroup> {
  const existing = await dbPool.query(
    `SELECT * FROM fertigation_field_groups WHERE id = $1 AND organization_id = $2`,
    [id, organizationId],
  );
  if (!existing.rowCount) throw new NotFoundError('Field group not found');

  const current = mapGroup(existing.rows[0]);
  const name = input.name !== undefined ? input.name.trim() : current.name;
  const fieldIds = input.fieldIds ?? current.fieldIds;
  const defaultRecipeId = input.defaultRecipeId !== undefined ? input.defaultRecipeId : current.defaultRecipeId;

  if (!name) throw new AppError('Group name is required', 'VALIDATION_ERROR', 400);
  await assertFieldsBelongToSite(current.siteId, fieldIds, organizationId);
  // Only check when the default recipe changes, so renaming a group whose
  // existing default was later sent back to draft still works.
  if (defaultRecipeId && defaultRecipeId !== current.defaultRecipeId) {
    await assertRecipesApproved([defaultRecipeId]);
  }

  const result = await dbPool.query(
    `UPDATE fertigation_field_groups
     SET name = $1, field_ids = $2, default_recipe_id = $3, updated_at = NOW()
     WHERE id = $4 AND organization_id = $5
     RETURNING *`,
    [name, fieldIds, defaultRecipeId ?? null, id, organizationId],
  );
  return mapGroup(result.rows[0]);
}

export async function deleteGroup(id: string, organizationId: string): Promise<void> {
  const result = await dbPool.query(
    `DELETE FROM fertigation_field_groups WHERE id = $1 AND organization_id = $2`,
    [id, organizationId],
  );
  if (!result.rowCount) throw new NotFoundError('Field group not found');
}
