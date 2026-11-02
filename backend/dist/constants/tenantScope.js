"use strict";
/**
 * Tenant scoping rules for multi-organization isolation.
 *
 * STRICT_ORG_TABLES — operational data; always filter `organization_id = $orgId`.
 * SHARED_CATALOG_TABLES — reference data; allow platform rows (`NULL`) plus org overrides.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SHARED_CATALOG_TABLES = exports.STRICT_ORG_TABLES = void 0;
exports.sharedCatalogOrgClause = sharedCatalogOrgClause;
exports.strictOrgClause = strictOrgClause;
exports.STRICT_ORG_TABLES = [
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
];
exports.SHARED_CATALOG_TABLES = [
    'crops',
    'field_types',
    'agronomic_thresholds',
    'pest_disease_catalog',
    'pesticide_products',
    'bio_products_catalog',
];
/** SQL fragment for shared catalog reads. */
function sharedCatalogOrgClause(column = 'organization_id', paramIndex = 1) {
    return `(${column} IS NULL OR ${column} = $${paramIndex})`;
}
/** SQL fragment for strict org reads. */
function strictOrgClause(column = 'organization_id', paramIndex = 1) {
    return `${column} = $${paramIndex}`;
}
