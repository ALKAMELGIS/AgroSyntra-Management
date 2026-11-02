/**
 * Run all database migrations
 * Usage: DATABASE_URL="..." node scripts/run-migrations.js
 */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const migrationsDir = path.join(__dirname, '..', 'src', 'db', 'migrations');

async function runMigrations() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL environment variable is required');
    console.error('Usage: set DATABASE_URL=postgresql://... && node scripts/run-migrations.js');
    process.exit(1);
  }

  console.log('Connecting to database...');
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('railway') ? { rejectUnauthorized: false } : false,
  });

  try {
    // Test connection
    await pool.query('SELECT NOW()');
    console.log('Connected successfully!\n');

    // Get all migration files in order
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    console.log(`Found ${files.length} migration files:\n`);

    for (const file of files) {
      console.log(`Running: ${file}...`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      
      try {
        await pool.query(sql);
        console.log(`  ✓ ${file} completed\n`);
      } catch (err) {
        // Check if error is "already exists" - that's okay
        if (err.message.includes('already exists')) {
          console.log(`  ⚠ ${file} - objects already exist (skipping)\n`);
        } else {
          console.error(`  ✗ ${file} FAILED:`, err.message);
          throw err;
        }
      }
    }

    console.log('\n✓ All migrations completed successfully!');
  } catch (err) {
    console.error('\nMigration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
