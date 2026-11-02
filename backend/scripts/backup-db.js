/**
 * Database Backup Script
 * 
 * Creates a SQL dump of the database that can be used for restoration.
 * 
 * Usage:
 *   DATABASE_URL="..." node scripts/backup-db.js
 *   
 * The backup will be saved to: backups/backup-YYYY-MM-DD-HH-MM.sql
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Get database URL from environment
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  console.error('Usage: DATABASE_URL="postgresql://..." node scripts/backup-db.js');
  process.exit(1);
}

// Create backups directory if it doesn't exist
const backupsDir = path.join(__dirname, '..', 'backups');
if (!fs.existsSync(backupsDir)) {
  fs.mkdirSync(backupsDir, { recursive: true });
}

// Generate backup filename with timestamp
const now = new Date();
const timestamp = now.toISOString()
  .replace(/[:.]/g, '-')
  .replace('T', '-')
  .slice(0, 19);
const backupFile = path.join(backupsDir, `backup-${timestamp}.sql`);

console.log('Starting database backup...');
console.log(`Backup file: ${backupFile}`);

// Parse the DATABASE_URL to extract connection details
const url = new URL(databaseUrl);
const host = url.hostname;
const port = url.port || '5432';
const database = url.pathname.slice(1);
const username = url.username;
const password = url.password;

// Set PGPASSWORD environment variable for pg_dump
process.env.PGPASSWORD = password;

// Build pg_dump command
const pgDumpCmd = `pg_dump -h ${host} -p ${port} -U ${username} -d ${database} --no-owner --no-privileges -f "${backupFile}"`;

// Check if pg_dump is available
exec('pg_dump --version', (error) => {
  if (error) {
    console.error('ERROR: pg_dump not found. Please install PostgreSQL client tools.');
    console.error('');
    console.error('Install instructions:');
    console.error('  Windows: Download from https://www.postgresql.org/download/windows/');
    console.error('  macOS: brew install postgresql');
    console.error('  Linux: apt install postgresql-client');
    console.error('');
    console.error('Alternative: Use Railway\'s built-in backup feature in the Postgres service settings.');
    process.exit(1);
  }

  // Run pg_dump
  exec(pgDumpCmd, (error, stdout, stderr) => {
    if (error) {
      console.error('Backup failed:', error.message);
      if (stderr) console.error(stderr);
      process.exit(1);
    }

    // Check if backup file was created
    if (fs.existsSync(backupFile)) {
      const stats = fs.statSync(backupFile);
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
      console.log(`✓ Backup completed successfully!`);
      console.log(`  File: ${backupFile}`);
      console.log(`  Size: ${sizeMB} MB`);
    } else {
      console.error('Backup file was not created.');
      process.exit(1);
    }
  });
});
