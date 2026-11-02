/**
 * Database Restore Script
 * 
 * Restores a database from a SQL backup file.
 * 
 * Usage:
 *   DATABASE_URL="..." node scripts/restore-db.js <backup-file.sql>
 *   
 * WARNING: This will overwrite existing data!
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Get arguments
const backupFile = process.argv[2];
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  console.error('Usage: DATABASE_URL="postgresql://..." node scripts/restore-db.js <backup-file.sql>');
  process.exit(1);
}

if (!backupFile) {
  console.error('ERROR: Backup file path is required');
  console.error('Usage: DATABASE_URL="..." node scripts/restore-db.js <backup-file.sql>');
  
  // List available backups
  const backupsDir = path.join(__dirname, '..', 'backups');
  if (fs.existsSync(backupsDir)) {
    const files = fs.readdirSync(backupsDir).filter(f => f.endsWith('.sql'));
    if (files.length > 0) {
      console.error('');
      console.error('Available backups:');
      files.forEach(f => console.error(`  - backups/${f}`));
    }
  }
  process.exit(1);
}

// Check if backup file exists
const fullPath = path.resolve(backupFile);
if (!fs.existsSync(fullPath)) {
  console.error(`ERROR: Backup file not found: ${fullPath}`);
  process.exit(1);
}

// Confirm restoration
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('');
console.log('⚠️  WARNING: This will restore the database from the backup.');
console.log('   Existing data may be overwritten!');
console.log('');
console.log(`Backup file: ${fullPath}`);
console.log('');

rl.question('Type "RESTORE" to confirm: ', (answer) => {
  rl.close();
  
  if (answer !== 'RESTORE') {
    console.log('Restore cancelled.');
    process.exit(0);
  }

  // Parse the DATABASE_URL
  const url = new URL(databaseUrl);
  const host = url.hostname;
  const port = url.port || '5432';
  const database = url.pathname.slice(1);
  const username = url.username;
  const password = url.password;

  // Set PGPASSWORD environment variable
  process.env.PGPASSWORD = password;

  console.log('');
  console.log('Starting database restore...');

  // Build psql command
  const psqlCmd = `psql -h ${host} -p ${port} -U ${username} -d ${database} -f "${fullPath}"`;

  exec(psqlCmd, (error, stdout, stderr) => {
    if (error) {
      console.error('Restore failed:', error.message);
      if (stderr) console.error(stderr);
      process.exit(1);
    }

    console.log('✓ Database restored successfully!');
    if (stdout) console.log(stdout);
  });
});
