/**
 * Tenant scoping rules for multi-organization isolation.
 *
 * STRICT_ORG_TABLES — operational data; always filter `organization_id = $orgId`.
 * SHARED_CATALOG_TABLES — reference data; allow platform rows (`NULL`) plus org overrides.
 */

export const STRICT_ORG_TABLES = [
  'countries',
  'sites',
  'farm_areas',
  'fields',
  'harvests',
  'ecph_entries',
  'fertigation_entries',
  'irrigation_records',
  'gis_layers',
  'workers',
  'manpower_records',
  'scouting_reports',
  'pesticide_applications',
  'bio_control_releases',
  'bumble_bee_deployments',
  'work_orders',
  'planting_records',
  'users',
] as const;

export const SHARED_CATALOG_TABLES = [
  'crops',
  'field_types',
  'agronomic_thresholds',
  'pest_disease_catalog',
  'pesticide_products',
  'bio_products_catalog',
] as const;

export type StrictOrgTable = (typeof STRICT_ORG_TABLES)[number];
export type SharedCatalogTable = (typeof SHARED_CATALOG_TABLES)[number];

/** SQL fragment for shared catalog reads. */
export function sharedCatalogOrgClause(column = 'organization_id', paramIndex = 1): string {
  return `(${column} IS NULL OR ${column} = $${paramIndex})`;
}

/** SQL fragment for strict org reads. */
export function strictOrgClause(column = 'organization_id', paramIndex = 1): string {
  return `${column} = $${paramIndex}`;
}
