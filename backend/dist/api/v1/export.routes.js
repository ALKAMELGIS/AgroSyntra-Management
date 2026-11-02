"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportRouter = void 0;
const express_1 = require("express");
const archiver_1 = __importDefault(require("archiver"));
const adm_zip_1 = __importDefault(require("adm-zip"));
const multer_1 = __importDefault(require("multer"));
const auth_1 = require("../middleware/auth");
const asyncHandler_1 = require("../../utils/asyncHandler");
const errors_1 = require("../../utils/errors");
const client_1 = require("../../db/client");
const logger_1 = require("../../utils/logger");
const auditLog_service_1 = require("../../services/auditLog.service");
const tenant_1 = require("../middleware/tenant");
const exportRouter = (0, express_1.Router)();
exports.exportRouter = exportRouter;
exportRouter.use(auth_1.auth);
exportRouter.use((0, auth_1.authorize)('ceo', 'farm_manager', 'operation_manager'));
const ENTITY_CONFIGS = {
    harvests: {
        table: 'harvests',
        columns: ['id', 'field_id', 'date', 'total_quantity', 'notes', 'created_at'],
    },
    fertigation: {
        table: 'fertigation_entries',
        columns: ['id', 'field_id', 'date', 'week_number', 'flow_rate', 'frequency', 'daily_water', 'total_fertilizer', 'created_at'],
    },
    ecph: {
        table: 'ecph_entries',
        columns: ['id', 'field_id', 'date', 'time', 'qty_of_water', 'cycle', 'total_water_qty', 'created_at'],
    },
    tasks: {
        table: 'tasks',
        columns: ['id', 'title', 'description', 'status', 'priority', 'task_type', 'due_date', 'created_at'],
    },
    fields: {
        table: 'fields',
        columns: ['id', 'name', 'farm_area_id', 'field_type_id', 'area_hectares', 'created_at'],
    },
    costs: {
        table: 'cost_entries',
        columns: ['id', 'field_id', 'category', 'amount', 'currency', 'description', 'date', 'created_at'],
    },
};
const ALL_TABLES = [
    { name: 'countries', query: 'SELECT * FROM countries ORDER BY name' },
    { name: 'sites', query: 'SELECT * FROM sites WHERE organization_id = $1 ORDER BY name', orgScoped: true },
    { name: 'farm_areas', query: `SELECT fa.* FROM farm_areas fa
    JOIN sites s ON s.id = fa.site_id WHERE s.organization_id = $1 ORDER BY fa.name`, orgScoped: true },
    { name: 'crops', query: 'SELECT * FROM crops ORDER BY name' },
    { name: 'crop_varieties', query: 'SELECT * FROM crop_varieties ORDER BY name' },
    { name: 'field_types', query: 'SELECT * FROM field_types ORDER BY name' },
    { name: 'fields', query: 'SELECT * FROM fields WHERE organization_id = $1 ORDER BY name', orgScoped: true },
    { name: 'recipes', query: `SELECT r.* FROM recipes r
    JOIN fields f ON f.id = r.field_id WHERE f.organization_id = $1 ORDER BY r.name`, orgScoped: true },
    { name: 'recipe_fertilizers', query: `SELECT rf.* FROM recipe_fertilizers rf
    JOIN recipes r ON r.id = rf.recipe_id
    JOIN fields f ON f.id = r.field_id WHERE f.organization_id = $1 ORDER BY rf.recipe_id`, orgScoped: true },
    { name: 'harvests', query: `SELECT h.* FROM harvests h
    JOIN fields f ON f.id = h.field_id WHERE f.organization_id = $1 ORDER BY h.date DESC`, orgScoped: true },
    { name: 'fertigation_entries', query: `SELECT fe.* FROM fertigation_entries fe
    JOIN fields f ON f.id = fe.field_id WHERE f.organization_id = $1 ORDER BY fe.date DESC`, orgScoped: true },
    { name: 'ecph_entries', query: `SELECT ee.* FROM ecph_entries ee
    JOIN fields f ON f.id = ee.field_id WHERE f.organization_id = $1 ORDER BY ee.date DESC`, orgScoped: true },
    { name: 'ecph_valve_readings', query: `SELECT evr.* FROM ecph_valve_readings evr
    JOIN ecph_entries ee ON ee.id = evr.ecph_entry_id
    JOIN fields f ON f.id = ee.field_id WHERE f.organization_id = $1 ORDER BY evr.ecph_entry_id`, orgScoped: true },
    { name: 'tasks', query: 'SELECT * FROM tasks WHERE organization_id = $1 ORDER BY created_at DESC', orgScoped: true },
    { name: 'workers', query: 'SELECT id, employee_id, name, category, is_team_leader, is_active, created_at FROM workers WHERE organization_id = $1 ORDER BY name', orgScoped: true },
    { name: 'manpower_records', query: 'SELECT * FROM manpower_records WHERE organization_id = $1 ORDER BY record_date DESC, worker_id', orgScoped: true },
    { name: 'manpower_activities', query: 'SELECT * FROM manpower_activities ORDER BY name' },
    { name: 'users', query: 'SELECT id, email, display_name, role, is_active, created_at FROM users WHERE organization_id = $1 ORDER BY display_name', orgScoped: true },
];
function rowsToCsv(rows) {
    if (rows.length === 0)
        return '';
    const cols = Object.keys(rows[0]);
    const header = cols.join(',');
    const lines = rows.map((row) => cols.map((col) => {
        const val = row[col];
        if (val === null || val === undefined)
            return '';
        const str = val instanceof Date ? val.toISOString() : String(val);
        return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(','));
    return [header, ...lines].join('\n');
}
/** GET /export/full-backup - download all data as a ZIP of CSVs */
exportRouter.get('/full-backup', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const orgId = (0, tenant_1.requireOrgId)(req);
    logger_1.logger.info({ user: req.user?.userId, orgId }, 'Full data backup requested');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="farm-backup-${timestamp}.zip"`);
    const archive = (0, archiver_1.default)('zip', { zlib: { level: 6 } });
    archive.on('error', (err) => { throw err; });
    archive.pipe(res);
    for (const table of ALL_TABLES) {
        try {
            const params = 'orgScoped' in table && table.orgScoped ? [orgId] : [];
            const result = await client_1.dbPool.query(table.query, params);
            const csv = rowsToCsv(result.rows);
            archive.append(csv, { name: `${table.name}.csv` });
        }
        catch (err) {
            logger_1.logger.warn({ table: table.name, error: err.message }, 'Skipping table in backup');
            archive.append(`Error exporting: ${err.message}`, { name: `${table.name}_ERROR.txt` });
        }
    }
    const meta = {
        exportDate: new Date().toISOString(),
        organizationId: orgId,
        tables: ALL_TABLES.map((t) => t.name),
        version: '1.0',
    };
    archive.append(JSON.stringify(meta, null, 2), { name: 'backup_metadata.json' });
    await archive.finalize();
}));
/** GET /export/:entity - export data as CSV or JSON (must be after /full-backup) */
exportRouter.get('/:entity', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const orgId = (0, tenant_1.requireOrgId)(req);
    const entityConfig = ENTITY_CONFIGS[req.params.entity];
    if (!entityConfig) {
        throw new errors_1.AppError(`Unsupported entity: ${req.params.entity}. Supported: ${Object.keys(ENTITY_CONFIGS).join(', ')}`, 'INVALID_ENTITY', 400);
    }
    const conditions = [];
    const params = [];
    let idx = 1;
    const fieldScopedEntities = ['harvests', 'fertigation', 'ecph', 'costs'];
    if (fieldScopedEntities.includes(req.params.entity)) {
        conditions.push(`field_id IN (SELECT id FROM fields WHERE organization_id = $${idx++})`);
        params.push(orgId);
    }
    else if (req.params.entity === 'fields') {
        conditions.push(`organization_id = $${idx++}`);
        params.push(orgId);
    }
    else if (req.params.entity === 'tasks') {
        conditions.push(`organization_id = $${idx++}`);
        params.push(orgId);
    }
    if (req.query.field_id) {
        conditions.push(`field_id = $${idx++}`);
        params.push(req.query.field_id);
    }
    if (req.query.start_date) {
        const dateCol = entityConfig.columns.includes('date') ? 'date' : 'created_at';
        conditions.push(`${dateCol} >= $${idx++}`);
        params.push(req.query.start_date);
    }
    if (req.query.end_date) {
        const dateCol = entityConfig.columns.includes('date') ? 'date' : 'created_at';
        conditions.push(`${dateCol} <= $${idx++}`);
        params.push(req.query.end_date);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await client_1.dbPool.query(`SELECT ${entityConfig.columns.join(', ')} FROM ${entityConfig.table} ${where} ORDER BY created_at DESC LIMIT 10000`, params);
    const accept = String(req.headers.accept || req.query.format || 'application/json');
    if (accept.includes('text/csv') || req.query.format === 'csv') {
        const headers = entityConfig.columns.join(',');
        const rows = result.rows.map((row) => entityConfig.columns.map((col) => {
            const val = row[col];
            if (val === null || val === undefined)
                return '';
            const str = String(val);
            return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str.replace(/"/g, '""')}"` : str;
        }).join(','));
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${req.params.entity}_export.csv"`);
        res.send([headers, ...rows].join('\n'));
    }
    else {
        res.json({ success: true, data: result.rows, meta: { total: result.rows.length, entity: req.params.entity } });
    }
}));
/* ------------------------------------------------------------------ */
/* Import (restore) — re-hydrate a ZIP backup into the live database. */
/* ------------------------------------------------------------------ */
/**
 * Parse a CSV string produced by our own `rowsToCsv` writer.
 *
 * The writer's quoting rules are simple: a cell is double-quoted iff it
 * contains a comma, a double quote, or a newline, and inner quotes are
 * doubled. Anything else is emitted raw. That's standard RFC-4180, and
 * we implement a small state machine rather than pulling in a CSV lib.
 *
 * Returns an array of row objects keyed by the header names.
 */
function parseCsv(text) {
    const rows = [];
    let field = '';
    let row = [];
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQuotes) {
            if (c === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i++;
                }
                else {
                    inQuotes = false;
                }
            }
            else {
                field += c;
            }
        }
        else {
            if (c === '"') {
                inQuotes = true;
            }
            else if (c === ',') {
                row.push(field);
                field = '';
            }
            else if (c === '\n') {
                row.push(field);
                field = '';
                rows.push(row);
                row = [];
            }
            else if (c === '\r') {
                // skip — lines are terminated by \n in our writer
            }
            else {
                field += c;
            }
        }
    }
    // Flush any trailing field / row that didn't end with a newline.
    if (field.length > 0 || row.length > 0) {
        row.push(field);
        rows.push(row);
    }
    if (rows.length === 0)
        return [];
    const headers = rows[0];
    return rows.slice(1)
        .filter((r) => r.some((cell) => cell !== ''))
        .map((r) => {
        const obj = {};
        headers.forEach((h, idx) => { obj[h] = r[idx] ?? ''; });
        return obj;
    });
}
/**
 * Which tables the importer is allowed to touch, in FK-safe order.
 * We only include reference + lookup tables whose schema is stable and
 * which a DR recovery genuinely needs. Sensitive or auto-generated
 * tables (users, api_keys, sessions, attachments) are intentionally
 * omitted — a re-import is not an identity migration.
 */
const IMPORT_TABLES = [
    'countries',
    'sites',
    'farm_areas',
    'crops',
    'crop_varieties',
    'field_types',
    'fields',
    'recipes',
    'recipe_fertilizers',
    'harvests',
    'fertigation_entries',
    'ecph_entries',
    'ecph_valve_readings',
    'tasks',
    'workers',
    'manpower_records',
    'manpower_activities',
];
/**
 * Best-effort coercion of CSV string cells to native Postgres-friendly
 * types. CSVs are just strings, so we emit explicit NULLs for empty
 * cells and leave everything else as-is — the DB column's own type will
 * do the final cast.
 */
function coerceCell(value) {
    if (value === '' || value === 'null' || value === 'NULL')
        return null;
    return value;
}
async function importCsvForTable(table, csvText, dryRun) {
    const rows = parseCsv(csvText);
    if (rows.length === 0)
        return { table, totalRows: 0, existingIds: 0, newRows: 0 };
    const columns = Object.keys(rows[0]);
    if (!columns.includes('id')) {
        // Without a stable key we can't do idempotent restore; skip.
        return {
            table,
            totalRows: rows.length,
            existingIds: 0,
            newRows: 0,
            firstError: `skipped — no 'id' column`,
        };
    }
    // How many of these ids already live in the DB? Informs the dry-run
    // preview so the operator knows what's a no-op vs. a real insert.
    const ids = rows.map((r) => r.id).filter(Boolean);
    let existingIds = 0;
    if (ids.length > 0) {
        const { rows: existing } = await client_1.dbPool.query(`SELECT id FROM ${table} WHERE id = ANY($1::uuid[])`, [ids]);
        existingIds = existing.length;
    }
    const newRows = rows.length - existingIds;
    if (dryRun)
        return { table, totalRows: rows.length, existingIds, newRows };
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    const sql = `INSERT INTO ${table} (${columns.map((c) => `"${c}"`).join(', ')})
               VALUES (${placeholders})
               ON CONFLICT (id) DO NOTHING`;
    let firstError;
    for (const row of rows) {
        try {
            await client_1.dbPool.query(sql, columns.map((c) => coerceCell(row[c])));
        }
        catch (err) {
            if (!firstError)
                firstError = `${err.message} (row id=${row.id})`;
        }
    }
    return { table, totalRows: rows.length, existingIds, newRows, firstError };
}
/**
 * POST /export/import-backup
 *
 * Accepts a ZIP produced by `GET /export/full-backup` and re-inserts its
 * rows into the live database. The insert is idempotent (ON CONFLICT
 * DO NOTHING on the primary key), so existing rows are always preserved
 * — this tool is strictly additive, it never overwrites.
 *
 * Pass `?dryRun=true` to preview what *would* be inserted without making
 * any changes. Without that flag, the operation is executed for real
 * and an audit log entry is written.
 *
 * Only CEOs may run this. Use only for disaster recovery.
 */
const uploadBackup = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB plenty for prototype scale
});
exportRouter.post('/import-backup', (0, auth_1.authorize)('ceo'), (req, res, next) => {
    uploadBackup.single('file')(req, res, (err) => {
        if (err) {
            return res.status(400).json({
                success: false,
                error: { code: 'UPLOAD_ERROR', message: err.message },
            });
        }
        next();
    });
}, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const file = req.file;
    if (!file) {
        throw new errors_1.AppError('No backup file provided', 'NO_FILE', 400);
    }
    const dryRun = String(req.query.dryRun ?? 'true').toLowerCase() !== 'false';
    // adm-zip does its own magic-number check; a bad file throws here.
    let zip;
    try {
        zip = new adm_zip_1.default(file.buffer);
    }
    catch (err) {
        throw new errors_1.AppError(`Not a valid ZIP archive: ${err.message}`, 'BAD_ZIP', 400);
    }
    const entries = zip.getEntries();
    const byName = new Map();
    for (const e of entries) {
        if (e.isDirectory)
            continue;
        byName.set(e.entryName, e.getData());
    }
    const plan = [];
    for (const table of IMPORT_TABLES) {
        const buf = byName.get(`${table}.csv`);
        if (!buf)
            continue;
        const csv = buf.toString('utf8');
        plan.push(await importCsvForTable(table, csv, dryRun));
    }
    if (!dryRun) {
        await (0, auditLog_service_1.logAuditEvent)({
            userId: req.user.userId,
            action: 'IMPORT',
            entity: 'report',
            changes: {
                source: 'full-backup.zip',
                tablesTouched: plan.length,
                rowsConsidered: plan.reduce((n, p) => n + p.totalRows, 0),
                rowsInserted: plan.reduce((n, p) => n + p.newRows, 0),
            },
            metadata: { filename: file.originalname, sizeBytes: file.size },
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
        });
        logger_1.logger.warn({ user: req.user.userId, plan }, 'CSV backup imported');
    }
    res.json({
        success: true,
        data: {
            dryRun,
            plan,
            summary: {
                tables: plan.length,
                totalRows: plan.reduce((n, p) => n + p.totalRows, 0),
                newRows: plan.reduce((n, p) => n + p.newRows, 0),
                skippedExistingRows: plan.reduce((n, p) => n + p.existingIds, 0),
            },
        },
    });
}));
