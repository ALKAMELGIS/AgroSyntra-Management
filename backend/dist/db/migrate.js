"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMigrations = runMigrations;
const client_1 = require("./client");
const promises_1 = require("fs/promises");
const path_1 = require("path");
// Arbitrary lock ID for migrations - must be unique within the application
const MIGRATION_LOCK_ID = 123456789;
async function runMigrations() {
    // Acquire an advisory lock so only one instance runs migrations at a time.
    // pg_try_advisory_lock returns true immediately if acquired, false if another
    // session already holds the lock.
    const client = await client_1.dbPool.connect();
    try {
        const lockResult = await client.query('SELECT pg_try_advisory_lock($1) AS acquired', [MIGRATION_LOCK_ID]);
        const acquired = lockResult.rows[0]?.acquired;
        if (!acquired) {
            console.log('[migrate] Another instance is running migrations, skipping');
            return;
        }
        try {
            // Create migrations tracking table if it doesn't exist
            await client.query(`
        CREATE TABLE IF NOT EXISTS _migrations (
          name TEXT PRIMARY KEY,
          applied_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
            // Get already applied migrations
            const applied = await client.query('SELECT name FROM _migrations ORDER BY name');
            const appliedSet = new Set(applied.rows.map((r) => r.name));
            // Read migration files
            const migrationsDir = (0, path_1.join)(__dirname, 'migrations');
            let files;
            try {
                files = await (0, promises_1.readdir)(migrationsDir);
            }
            catch {
                console.log('[migrate] No migrations directory found, skipping');
                return;
            }
            const sqlFiles = files
                .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
                .sort();
            const signatures = [
                { file: '001_initial_schema.sql', table: 'countries' },
                { file: '023_scouting.sql', table: 'scouting_reports' },
                { file: '030_fix_missing_tables.sql', table: 'scouting_reports' },
                { file: '030z_ensure_ipm_tables.sql', table: 'scouting_reports' },
                { file: '052_scouting_report_full.sql', table: 'scouting_observations' },
            ];
            const probeSql = signatures
                .map((s, i) => `to_regclass('public.${s.table}') AS t${i}`)
                .join(', ');
            const probe = await client.query(`SELECT ${probeSql}`);
            const probeRow = probe.rows[0] || {};
            let marked = 0;
            let unmarked = 0;
            for (let i = 0; i < signatures.length; i++) {
                const { file, table } = signatures[i];
                const tablePresent = probeRow[`t${i}`] !== null;
                // Only consider files that are actually present on disk. (If an older
                // migration was renamed or removed, skip it instead of erroring.)
                if (!sqlFiles.includes(file))
                    continue;
                if (tablePresent && !appliedSet.has(file)) {
                    await client.query('INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [file]);
                    appliedSet.add(file);
                    marked++;
                    console.log(`[migrate] Sync: marked ${file} applied (table ${table} exists)`);
                }
                else if (!tablePresent && appliedSet.has(file)) {
                    await client.query('DELETE FROM _migrations WHERE name = $1', [file]);
                    appliedSet.delete(file);
                    unmarked++;
                    console.log(`[migrate] Sync: unmarked ${file} (table ${table} missing — will re-run)`);
                }
            }
            if (marked > 0 || unmarked > 0) {
                console.log(`[migrate] Signature sync complete (${marked} marked, ${unmarked} unmarked)`);
            }
            let count = 0;
            const failed = [];
            for (const file of sqlFiles) {
                if (appliedSet.has(file))
                    continue;
                const sql = await (0, promises_1.readFile)((0, path_1.join)(migrationsDir, file), 'utf-8');
                try {
                    await client.query(sql);
                    await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
                    count++;
                    console.log(`[migrate] Applied: ${file}`);
                }
                catch (err) {
                    const message = err?.message || String(err);
                    console.error(`[migrate] Error applying ${file}: ${message}`);
                    failed.push({ file, error: message });
                    // Stop on the first failure — do NOT silently continue with a
                    // half-applied schema. Later migrations often depend on earlier
                    // ones, and a half-migrated DB means runtime 42P01 / 42883 errors
                    // that look like "Database schema not ready" from user APIs.
                    break;
                }
            }
            if (failed.length > 0) {
                const summary = failed
                    .map((f) => `  - ${f.file}: ${f.error}`)
                    .join('\n');
                throw new Error(`[migrate] Aborting boot — ${failed.length} migration(s) failed to apply:\n${summary}`);
            }
            if (count === 0) {
                console.log('[migrate] All migrations already applied');
            }
            else {
                console.log(`[migrate] Applied ${count} new migration(s)`);
            }
        }
        finally {
            // Release the advisory lock
            await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]);
        }
    }
    finally {
        client.release();
    }
}
