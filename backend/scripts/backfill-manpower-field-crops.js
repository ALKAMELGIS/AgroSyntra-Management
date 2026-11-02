/**
 * Backfill field crops + normalize manpower location for crop reporting.
 * Usage: DATABASE_URL="..." node scripts/backfill-manpower-field-crops.js
 */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const migrationsDir = path.join(__dirname, '..', 'src', 'db', 'migrations');
const migrationPaths = [
  path.join(migrationsDir, '135_backfill_manpower_field_crops.sql'),
  path.join(migrationsDir, '136_manpower_location_normalize.sql'),
];

async function countDiagnostics(pool) {
  const noField = await pool.query(`
    SELECT COUNT(*)::int AS n
    FROM manpower_records r
    WHERE r.deleted_at IS NULL
      AND NULLIF(TRIM(r.location), '') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM fields f
        WHERE f.deleted_at IS NULL
          AND normalize_manpower_location(f.name) = normalize_manpower_location(r.location)
      )
  `);
  const noCrop = await pool.query(`
    SELECT COUNT(*)::int AS n
    FROM manpower_records r
    JOIN fields f ON f.deleted_at IS NULL
      AND normalize_manpower_location(f.name) = normalize_manpower_location(r.location)
    LEFT JOIN crops c ON c.id = f.current_crop_id
    WHERE r.deleted_at IS NULL
      AND NULLIF(TRIM(r.location), '') IS NOT NULL
      AND c.id IS NULL
  `);
  const fieldsWithoutCrop = await pool.query(`
    SELECT COUNT(*)::int AS n
    FROM fields f
    WHERE f.deleted_at IS NULL
      AND f.current_crop_id IS NULL
  `);
  return {
    recordsLocationNoField: noField.rows[0].n,
    recordsLocationNoCrop: noCrop.rows[0].n,
    fieldsWithoutCrop: fieldsWithoutCrop.rows[0].n,
  };
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL is required');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('railway') ? { rejectUnauthorized: false } : false,
  });

  try {
    console.log('Before backfill:');
    try {
      console.table(await countDiagnostics(pool));
    } catch (err) {
      console.log('(Diagnostics skipped — normalize_manpower_location not yet created)');
    }

    for (const migrationPath of migrationPaths) {
      const label = path.basename(migrationPath);
      console.log(`\nApplying ${label}...`);
      const sql = fs.readFileSync(migrationPath, 'utf8');
      await pool.query(sql);
    }

    console.log('\nBackfill SQL applied.\nAfter backfill:');
    console.table(await countDiagnostics(pool));
  } catch (err) {
    console.error('Backfill failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
