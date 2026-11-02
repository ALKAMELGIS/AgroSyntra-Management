/**
 * Migration rollback utility.
 *
 * Usage (via npm scripts):
 *   npm run migrate:rollback          — roll back the last applied migration
 *   npm run migrate:rollback -- --n 3 — roll back the last 3 migrations
 *   npm run migrate:status            — show applied / pending migrations
 *
 * IMPORTANT: Rollback is a manual operation. Each migration's "down" SQL is
 * derived from a companion `.down.sql` file (e.g. 012_tasks.down.sql). If no
 * down file exists, rollback will refuse to proceed unless --force is passed,
 * in which case it only removes the entry from _migrations (no SQL executed).
 */

import { dbPool } from './client';
import { readdir, readFile, access } from 'fs/promises';
import { join } from 'path';

const MIGRATION_LOCK_ID = 123456789;
const migrationsDir = join(__dirname, 'migrations');

// ─── status ─────────────────────────────────────────────────────────
export async function migrationStatus(): Promise<void> {
  const client = await dbPool.connect();
  try {
    // Ensure table exists
    await client.query(`CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT NOW())`);

    const applied = await client.query('SELECT name, applied_at FROM _migrations ORDER BY name');
    const appliedSet = new Set(applied.rows.map((r: any) => r.name));

    let files: string[];
    try {
      files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql') && !f.includes('.down.')).sort();
    } catch {
      console.log('No migrations directory found');
      return;
    }

    console.log('\n  Migration Status\n  ════════════════════════════════════════════');
    for (const file of files) {
      const row = applied.rows.find((r: any) => r.name === file);
      const status = row ? `✓  applied ${new Date(row.applied_at).toISOString().slice(0, 19)}` : '✗  pending';
      console.log(`  ${status}  ${file}`);
    }

    const hasDown = files.filter((f) => {
      const downFile = f.replace('.sql', '.down.sql');
      return appliedSet.has(f); // we check existence below
    });
    console.log(`\n  Total: ${files.length} migrations, ${applied.rows.length} applied\n`);
  } finally {
    client.release();
  }
}

// ─── rollback ───────────────────────────────────────────────────────
export async function rollbackMigrations(count = 1, force = false): Promise<void> {
  const client = await dbPool.connect();
  try {
    // Acquire lock
    const lockResult = await client.query('SELECT pg_try_advisory_lock($1) AS acquired', [MIGRATION_LOCK_ID]);
    if (!lockResult.rows[0]?.acquired) {
      console.error('[rollback] Another instance holds the migration lock');
      return;
    }

    try {
      const applied = await client.query('SELECT name FROM _migrations ORDER BY name DESC');
      if (applied.rows.length === 0) {
        console.log('[rollback] No migrations to roll back');
        return;
      }

      const toRollBack = applied.rows.slice(0, count);
      console.log(`[rollback] Rolling back ${toRollBack.length} migration(s)...\n`);

      for (const row of toRollBack) {
        const name: string = row.name;
        const downFile = name.replace('.sql', '.down.sql');
        const downPath = join(migrationsDir, downFile);

        let hasDownSql = false;
        try {
          await access(downPath);
          hasDownSql = true;
        } catch {
          // no down file
        }

        if (hasDownSql) {
          const sql = await readFile(downPath, 'utf-8');
          await client.query('BEGIN');
          try {
            await client.query(sql);
            await client.query('DELETE FROM _migrations WHERE name = $1', [name]);
            await client.query('COMMIT');
            console.log(`  ✓ Rolled back: ${name} (executed ${downFile})`);
          } catch (err: any) {
            await client.query('ROLLBACK');
            console.error(`  ✗ Failed to roll back ${name}: ${err.message}`);
            break; // stop on failure
          }
        } else if (force) {
          // Force mode: just remove the tracking entry without running SQL
          await client.query('DELETE FROM _migrations WHERE name = $1', [name]);
          console.log(`  ⚠ Removed: ${name} (no .down.sql — record removed only)`);
        } else {
          console.error(`  ✗ No ${downFile} found. Use --force to remove the record without running SQL.`);
          break;
        }
      }

      console.log('\n[rollback] Done');
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]);
    }
  } finally {
    client.release();
  }
}

// ─── CLI entry point ────────────────────────────────────────────────
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0] || 'rollback';

  if (command === 'status') {
    migrationStatus()
      .then(() => process.exit(0))
      .catch((err) => { console.error(err); process.exit(1); });
  } else {
    const nIdx = args.indexOf('--n');
    const count = nIdx >= 0 ? parseInt(args[nIdx + 1], 10) || 1 : 1;
    const force = args.includes('--force');

    rollbackMigrations(count, force)
      .then(() => process.exit(0))
      .catch((err) => { console.error(err); process.exit(1); });
  }
}
