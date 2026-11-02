/**
 * Biological control record: cell approval state machine and the database helpers
 * the bio routes and the change-request service share.
 *
 * A cell (one product column x one week) holds two value pairs:
 *   - per_m2 / units: the APPROVED values. Only these are ever counted
 *     (page totals, summary, export, scouting summary).
 *   - pending_per_m2 / pending_units (+ pending_clear): what a scouter typed or a
 *     worker imported, waiting for the pest agronomist.
 * A rejected proposal is cleared and its reason kept (rejected_*) for whoever
 * entered it. A row with nothing approved, nothing pending and no rejection note is
 * deleted, so an empty cell never lingers as a row.
 */
import { dbPool } from '../db/client';
import { AppError, NotFoundError } from '../utils/errors';
import { assertFieldInOrganization } from '../utils/tenantValidation';

/** Anything with a pg-style query(): the pool or a transaction client. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Queryable = { query: (text: string, params?: unknown[]) => Promise<any> };

export type BioWriteMode = 'manager' | 'proposer';

export interface BioCellState {
  per_m2: number | null;
  units: number | null;
  pending_per_m2: number | null;
  pending_units: number | null;
  pending_clear: boolean;
  pending_by: string | null;
  pending_at: Date | string | null;
  rejected_reason: string | null;
  rejected_by: string | null;
  rejected_at: Date | string | null;
}

export interface BioCellRow extends BioCellState {
  id: string;
  product_column_id?: string;
  week_number?: number;
}

export interface BioCellInput {
  productColumnId: string;
  weekNumber: number;
  perM2?: number | null;
  units?: number | null;
}

export const EMPTY_BIO_CELL: BioCellState = {
  per_m2: null,
  units: null,
  pending_per_m2: null,
  pending_units: null,
  pending_clear: false,
  pending_by: null,
  pending_at: null,
  rejected_reason: null,
  rejected_by: null,
  rejected_at: null,
};

const CLEARED_PENDING = {
  pending_per_m2: null,
  pending_units: null,
  pending_clear: false,
  pending_by: null,
  pending_at: null,
} as const;

const CLEARED_REJECTION = {
  rejected_reason: null,
  rejected_by: null,
  rejected_at: null,
} as const;

/** Blank, non-numeric and zero all mean "no value" (the grid has always treated 0 as empty). */
export function normalizeBioValue(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return null;
  return n;
}

/** pg returns NUMERIC as strings; bring a row into comparable numbers. */
export function toBioCellState(row: Partial<BioCellState> | null | undefined): BioCellState {
  if (!row) return { ...EMPTY_BIO_CELL };
  return {
    per_m2: normalizeBioValue(row.per_m2),
    units: normalizeBioValue(row.units),
    pending_per_m2: normalizeBioValue(row.pending_per_m2),
    pending_units: normalizeBioValue(row.pending_units),
    pending_clear: Boolean(row.pending_clear),
    pending_by: row.pending_by ?? null,
    pending_at: row.pending_at ?? null,
    rejected_reason: row.rejected_reason ?? null,
    rejected_by: row.rejected_by ?? null,
    rejected_at: row.rejected_at ?? null,
  };
}

export function hasApprovedValue(state: BioCellState): boolean {
  return state.per_m2 != null || state.units != null;
}

export function hasPendingValue(state: BioCellState): boolean {
  return state.pending_at != null;
}

export function isBlankCell(state: BioCellState): boolean {
  return !hasApprovedValue(state) && !hasPendingValue(state) && !state.rejected_reason;
}

function orNull(state: BioCellState): BioCellState | null {
  return isBlankCell(state) ? null : state;
}

/**
 * Bio manager writes a live value. Any pending proposal or rejection note on the cell
 * is cleared: the manager's value is the decision. Returns null when the row should go.
 */
export function applyManagerWrite(
  existing: Partial<BioCellState> | null,
  input: Pick<BioCellInput, 'perM2' | 'units'>,
): BioCellState | null {
  const base = toBioCellState(existing);
  return orNull({
    ...base,
    per_m2: normalizeBioValue(input.perM2),
    units: normalizeBioValue(input.units),
    ...CLEARED_PENDING,
    ...CLEARED_REJECTION,
  });
}

/**
 * Scouter (or worker import) proposes a value. Never touches per_m2 / units.
 *  - both empty over an approved value  -> pending_clear (ask to remove it)
 *  - both empty with nothing approved   -> withdraw the pending proposal
 *  - same as the approved value         -> withdraw (nothing to approve)
 *  - otherwise                          -> pending value, waiting for approval
 */
export function applyProposal(
  existing: Partial<BioCellState> | null,
  input: Pick<BioCellInput, 'perM2' | 'units'>,
  actorId: string,
  now: Date,
): BioCellState | null {
  const base = toBioCellState(existing);
  const perM2 = normalizeBioValue(input.perM2);
  const units = normalizeBioValue(input.units);
  const approved = hasApprovedValue(base);

  if (perM2 == null && units == null) {
    if (approved) {
      return {
        ...base,
        pending_per_m2: null,
        pending_units: null,
        pending_clear: true,
        pending_by: actorId,
        pending_at: now,
        ...CLEARED_REJECTION,
      };
    }
    return orNull({ ...base, ...CLEARED_PENDING, ...CLEARED_REJECTION });
  }

  if (approved && perM2 === base.per_m2 && units === base.units) {
    return orNull({ ...base, ...CLEARED_PENDING, ...CLEARED_REJECTION });
  }

  return {
    ...base,
    pending_per_m2: perM2,
    pending_units: units,
    pending_clear: false,
    pending_by: actorId,
    pending_at: now,
    ...CLEARED_REJECTION,
  };
}

/** Pending becomes approved (or the approved value is removed for pending_clear). */
export function applyApprove(existing: Partial<BioCellState>): BioCellState | null {
  const base = toBioCellState(existing);
  if (!hasPendingValue(base)) return orNull(base);
  const next: BioCellState = {
    ...base,
    per_m2: base.pending_clear ? null : base.pending_per_m2,
    units: base.pending_clear ? null : base.pending_units,
    ...CLEARED_PENDING,
    ...CLEARED_REJECTION,
  };
  return orNull(next);
}

/**
 * Pending is dropped; the approved value (if any) stays counted. pending_by is kept so
 * the person who entered the value can see the rejection reason on their cell.
 */
export function applyReject(
  existing: Partial<BioCellState>,
  reason: string,
  actorId: string,
  now: Date,
): BioCellState {
  const base = toBioCellState(existing);
  if (!hasPendingValue(base)) return base;
  return {
    ...base,
    pending_per_m2: null,
    pending_units: null,
    pending_clear: false,
    pending_at: null,
    rejected_reason: reason,
    rejected_by: actorId,
    rejected_at: now,
  };
}

// ─── Persistence ────────────────────────────────────────────────

const ENTRY_COLUMNS = `id, product_column_id, week_number, per_m2, units, pending_per_m2, pending_units,
  pending_clear, pending_by, pending_at, rejected_reason, rejected_by, rejected_at`;

async function lockCell(
  db: Queryable,
  setupId: string,
  productColumnId: string,
  weekNumber: number,
): Promise<BioCellRow | null> {
  const result = await db.query(
    `SELECT ${ENTRY_COLUMNS}
     FROM bio_record_entries
     WHERE field_setup_id = $1 AND product_column_id = $2 AND week_number = $3
     FOR UPDATE`,
    [setupId, productColumnId, weekNumber],
  );
  return result.rows[0] || null;
}

async function persistCell(
  db: Queryable,
  setupId: string,
  cell: { productColumnId: string; weekNumber: number },
  existing: BioCellRow | null,
  next: BioCellState | null,
  actorId: string,
): Promise<void> {
  if (!next) {
    if (existing) {
      await db.query(`DELETE FROM bio_record_entries WHERE id = $1`, [existing.id]);
    }
    return;
  }
  const values = [
    next.per_m2, next.units, next.pending_per_m2, next.pending_units, next.pending_clear,
    next.pending_by, next.pending_at, next.rejected_reason, next.rejected_by, next.rejected_at,
  ];
  if (!existing) {
    await db.query(
      `INSERT INTO bio_record_entries
         (field_setup_id, product_column_id, week_number, per_m2, units, pending_per_m2, pending_units,
          pending_clear, pending_by, pending_at, rejected_reason, rejected_by, rejected_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [setupId, cell.productColumnId, cell.weekNumber, ...values, actorId],
    );
    return;
  }
  await db.query(
    `UPDATE bio_record_entries
     SET per_m2 = $2, units = $3, pending_per_m2 = $4, pending_units = $5, pending_clear = $6,
         pending_by = $7, pending_at = $8, rejected_reason = $9, rejected_by = $10, rejected_at = $11,
         updated_at = NOW()
     WHERE id = $1`,
    [existing.id, ...values],
  );
}

/** Deduplicate by cell; the last value for a cell wins. */
export function uniqueCells(cells: BioCellInput[]): BioCellInput[] {
  const byKey = new Map<string, BioCellInput>();
  for (const cell of cells) byKey.set(`${cell.productColumnId}_${cell.weekNumber}`, cell);
  return [...byKey.values()];
}

/**
 * Write changed cells. Manager -> approved values; proposer -> pending values only.
 * Returns how many cells now wait for approval because of this write.
 */
export async function saveBioCells(
  db: Queryable,
  opts: {
    setupId: string;
    cells: BioCellInput[];
    mode: BioWriteMode;
    actorId: string;
    now?: Date;
    /**
     * Import: a blank half of a cell (per m² or units) keeps the approved value
     * instead of clearing it, so an import never removes data.
     */
    keepApprovedWhereBlank?: boolean;
  },
): Promise<{ written: number; pending: number }> {
  const now = opts.now ?? new Date();
  let written = 0;
  let pending = 0;
  for (const raw of uniqueCells(opts.cells)) {
    const existing = await lockCell(db, opts.setupId, raw.productColumnId, raw.weekNumber);
    let cell = raw;
    if (opts.keepApprovedWhereBlank && existing) {
      const base = toBioCellState(existing);
      cell = {
        ...raw,
        perM2: normalizeBioValue(raw.perM2) ?? base.per_m2,
        units: normalizeBioValue(raw.units) ?? base.units,
      };
    }
    const next = opts.mode === 'manager'
      ? applyManagerWrite(existing, cell)
      : applyProposal(existing, cell, opts.actorId, now);
    await persistCell(db, opts.setupId, cell, existing, next, opts.actorId);
    written++;
    if (opts.mode === 'proposer' && next && hasPendingValue(next)) pending++;
  }
  return { written, pending };
}

/**
 * Approve or reject pending cells of one field table. No `cells` = every pending cell.
 * Returns the number of cells decided and who had proposed them.
 */
export async function reviewBioCells(
  db: Queryable,
  opts: {
    setupId: string;
    cells?: Array<{ productColumnId: string; weekNumber: number }>;
    decision: 'approve' | 'reject';
    reason?: string;
    actorId: string;
    now?: Date;
  },
): Promise<{ count: number; proposers: string[] }> {
  const now = opts.now ?? new Date();
  const reason = (opts.reason || '').trim();
  if (opts.decision === 'reject' && !reason) {
    throw new AppError('A reason is required to reject values', 'VALIDATION_ERROR', 400);
  }
  const result = await db.query(
    `SELECT ${ENTRY_COLUMNS}
     FROM bio_record_entries
     WHERE field_setup_id = $1 AND pending_at IS NOT NULL
     ORDER BY week_number, product_column_id
     FOR UPDATE`,
    [opts.setupId],
  );
  const wanted = opts.cells?.length
    ? new Set(opts.cells.map((c) => `${c.productColumnId}_${c.weekNumber}`))
    : null;
  const proposers = new Set<string>();
  let count = 0;
  for (const row of result.rows as BioCellRow[]) {
    const key = `${row.product_column_id}_${row.week_number}`;
    if (wanted && !wanted.has(key)) continue;
    if (row.pending_by) proposers.add(row.pending_by);
    const next = opts.decision === 'approve'
      ? applyApprove(row)
      : applyReject(row, reason, opts.actorId, now);
    await persistCell(
      db,
      opts.setupId,
      { productColumnId: String(row.product_column_id), weekNumber: Number(row.week_number) },
      row,
      next,
      opts.actorId,
    );
    count++;
  }
  return { count, proposers: [...proposers] };
}

// ─── Setups ─────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Load a field table the caller's organization owns (legacy rows with no
 * organization_id count as the organization of the field's site). Anything else,
 * including a malformed id, is reported as not found.
 */
export async function loadBioSetupInOrg(
  db: Queryable,
  setupId: string,
  orgId: string | null,
  opts: { lock?: boolean } = {},
) {
  if (!UUID_RE.test(String(setupId || ''))) throw new NotFoundError('Field setup not found');
  const result = await db.query(
    `SELECT bs.*, f.name AS field_name, c.name AS crop_name, s.name AS season_name, fa.site_id
     FROM bio_record_field_setup bs
     JOIN fields f ON f.id = bs.field_id
     LEFT JOIN farm_areas fa ON fa.id = f.farm_area_id
     LEFT JOIN sites st ON st.id = fa.site_id
     LEFT JOIN crops c ON c.id = bs.crop_id
     LEFT JOIN seasons s ON s.id = bs.season_id
     WHERE bs.id = $1
       AND ($2::uuid IS NULL OR bs.organization_id = $2
            OR (bs.organization_id IS NULL AND st.organization_id = $2))${opts.lock ? '\n     FOR UPDATE OF bs' : ''}`,
    [setupId, orgId],
  );
  if (!result.rows[0]) throw new NotFoundError('Field setup not found');
  return result.rows[0];
}

/** Every productColumnId must be a column of this field table. */
export async function assertProductColumnsInSetup(
  db: Queryable,
  setupId: string,
  productColumnIds: string[],
): Promise<void> {
  const ids = [...new Set(productColumnIds)];
  if (ids.length === 0) return;
  const result = await db.query(
    `SELECT id FROM bio_record_field_products WHERE field_setup_id = $1 AND id = ANY($2::uuid[])`,
    [setupId, ids],
  );
  if (result.rows.length !== ids.length) {
    throw new AppError('Product column does not belong to this field table', 'VALIDATION_ERROR', 400);
  }
}

/** Delete a field table with its product columns and cells. Caller checks the organization. */
export async function deleteBioFieldSetup(db: Queryable, setupId: string): Promise<void> {
  await db.query(`DELETE FROM bio_record_entries WHERE field_setup_id = $1`, [setupId]);
  await db.query(`DELETE FROM bio_record_field_products WHERE field_setup_id = $1`, [setupId]);
  await db.query(`DELETE FROM bio_record_field_setup WHERE id = $1`, [setupId]);
}

/** What a reviewer sees on a "delete this table" change request. */
export async function getBioFieldSetupSnapshot(setupId: string, orgId: string) {
  const setup = await loadBioSetupInOrg(dbPool, setupId, orgId);
  const counts = await dbPool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM bio_record_field_products WHERE field_setup_id = $1) AS product_count,
       (SELECT COUNT(*)::int FROM bio_record_entries
          WHERE field_setup_id = $1 AND (per_m2 IS NOT NULL OR units IS NOT NULL)) AS entry_count,
       (SELECT COUNT(*)::int FROM bio_record_entries
          WHERE field_setup_id = $1 AND pending_at IS NOT NULL) AS pending_count`,
    [setupId],
  );
  const c = counts.rows[0] || {};
  const label = [setup.field_name, setup.crop_name, setup.season_name].filter(Boolean).join(' · ');
  return {
    id: setup.id,
    organization_id: setup.organization_id || orgId,
    field_id: setup.field_id,
    field_name: setup.field_name ?? null,
    crop_id: setup.crop_id,
    crop_name: setup.crop_name ?? null,
    season_id: setup.season_id,
    season_name: setup.season_name ?? null,
    product_count: Number(c.product_count) || 0,
    entry_count: Number(c.entry_count) || 0,
    pending_count: Number(c.pending_count) || 0,
    label: label || 'Biological control table',
  };
}

// ─── Seasons ────────────────────────────────────────────────────

export async function loadSeasonForField(seasonId: string, fieldId: string, orgId: string | null) {
  const result = await dbPool.query(
    `SELECT s.id, s.site_id, s.start_date, s.end_date, s.planned_end_date,
            EXTRACT(YEAR FROM s.start_date)::int AS start_year
     FROM seasons s
     JOIN fields f ON f.id = $2
     JOIN farm_areas fa ON fa.id = f.farm_area_id AND fa.site_id = s.site_id
     WHERE s.id = $1
       AND ($3::uuid IS NULL OR s.organization_id IS NULL OR s.organization_id = $3)`,
    [seasonId, fieldId, orgId],
  );
  if (!result.rows[0]) {
    throw new AppError('Season does not belong to this field site', 'VALIDATION_ERROR', 400);
  }
  return result.rows[0];
}

// ─── Excel import ───────────────────────────────────────────────

export interface BioImportSheet {
  fieldId: string;
  cropId: string;
  surfaceM2?: number | null;
  plantsPerM2?: number | null;
  numberOfPlants?: number | null;
  startWeek?: number | null;
  weekCount?: number | null;
  products: Array<{
    itemCode?: string | null;
    productName: string;
    perPackage?: number | null;
    pricePerPackage?: number | null;
  }>;
  entries: Array<{
    weekNumber: number;
    productIndex: number;
    perM2?: number | null;
    units?: number | null;
  }>;
}

function lc(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function generatedItemCode(productName: string): string {
  return productName.substring(0, 20).replace(/\s+/g, '-').toUpperCase().trim();
}

/**
 * Import sheets WITHOUT deleting anything: missing field tables, product columns and
 * weeks are added; only the cells present in the file are written (approved for the
 * manager, pending for a worker). Cells not in the file are left exactly as they are.
 */
export async function importBioSheets(
  db: Queryable,
  opts: {
    orgId: string;
    actorId: string;
    seasonId: string;
    sheets: BioImportSheet[];
    mode: BioWriteMode;
    now?: Date;
  },
): Promise<{ sheets: number; entries: number; pending: number; setupIds: string[] }> {
  const now = opts.now ?? new Date();
  const isManager = opts.mode === 'manager';
  let written = 0;
  let pending = 0;
  const setupIds: string[] = [];

  for (const sheet of opts.sheets) {
    await assertFieldInOrganization(sheet.fieldId, opts.orgId);
    const season = await loadSeasonForField(opts.seasonId, sheet.fieldId, opts.orgId);
    const year = Number(season.start_year);

    const cells = sheet.entries.filter((e) => (
      e.productIndex >= 0
      && e.productIndex < sheet.products.length
      && e.weekNumber >= 1
      && e.weekNumber <= 53
      && (normalizeBioValue(e.perM2) != null || normalizeBioValue(e.units) != null)
    ));
    const maxWeek = cells.reduce((m, e) => Math.max(m, e.weekNumber), 0);

    const existing = await db.query(
      `SELECT id, week_count FROM bio_record_field_setup
       WHERE field_id = $1 AND crop_id = $2 AND season_id = $3
       FOR UPDATE`,
      [sheet.fieldId, sheet.cropId, opts.seasonId],
    );
    let setupId: string;
    if (!existing.rows[0]) {
      const inserted = await db.query(
        `INSERT INTO bio_record_field_setup
           (organization_id, field_id, crop_id, year, season_id, surface_m2, plants_per_m2, number_of_plants,
            start_week, week_count, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, GREATEST(COALESCE($10, 52), $11), $12)
         RETURNING id`,
        [opts.orgId, sheet.fieldId, sheet.cropId, year, opts.seasonId,
         sheet.surfaceM2 ?? null, sheet.plantsPerM2 ?? null, sheet.numberOfPlants ?? null,
         sheet.startWeek ?? 1, sheet.weekCount ?? null, maxWeek, opts.actorId],
      );
      setupId = inserted.rows[0].id;
    } else {
      setupId = existing.rows[0].id;
      if (isManager) {
        // Fill in what the file has; never blank out what the table already holds.
        await db.query(
          `UPDATE bio_record_field_setup
           SET surface_m2 = COALESCE($2, surface_m2),
               plants_per_m2 = COALESCE($3, plants_per_m2),
               number_of_plants = COALESCE($4, number_of_plants),
               start_week = COALESCE($5, start_week),
               week_count = GREATEST(COALESCE(week_count, 0), COALESCE($6, 0), $7),
               updated_at = NOW()
           WHERE id = $1`,
          [setupId, sheet.surfaceM2 ?? null, sheet.plantsPerM2 ?? null, sheet.numberOfPlants ?? null,
           sheet.startWeek ?? null, sheet.weekCount ?? null, maxWeek],
        );
      } else if (maxWeek > (Number(existing.rows[0].week_count) || 0)) {
        await db.query(
          `UPDATE bio_record_field_setup SET week_count = $2, updated_at = NOW() WHERE id = $1`,
          [setupId, maxWeek],
        );
      }
    }
    setupIds.push(setupId);

    const productRows = await db.query(
      `SELECT id, item_code, product_name, sort_order
       FROM bio_record_field_products WHERE field_setup_id = $1 ORDER BY sort_order`,
      [setupId],
    );
    const byCode = new Map<string, string>();
    const byName = new Map<string, string>();
    let nextSort = 0;
    for (const p of productRows.rows) {
      if (p.item_code && !byCode.has(lc(p.item_code))) byCode.set(lc(p.item_code), p.id);
      if (p.product_name && !byName.has(lc(p.product_name))) byName.set(lc(p.product_name), p.id);
      nextSort = Math.max(nextSort, (Number(p.sort_order) || 0) + 1);
    }

    const productIds: string[] = [];
    for (const p of sheet.products) {
      const code = (p.itemCode || generatedItemCode(p.productName)).trim();
      const found = (p.itemCode && byCode.get(lc(p.itemCode)))
        || byName.get(lc(p.productName))
        || byCode.get(lc(code));
      if (found) {
        productIds.push(found);
        continue;
      }
      let catalogId: string | null = null;
      if (isManager) {
        const catUpsert = await db.query(
          `INSERT INTO bio_products_catalog (item_code, item_name, per_package, price_per_package, organization_id)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (organization_id, item_code) DO UPDATE SET
             item_name = EXCLUDED.item_name,
             per_package = COALESCE(EXCLUDED.per_package, bio_products_catalog.per_package),
             price_per_package = COALESCE(EXCLUDED.price_per_package, bio_products_catalog.price_per_package)
           RETURNING id`,
          [code, p.productName.trim(), p.perPackage ?? null, p.pricePerPackage ?? null, opts.orgId],
        );
        catalogId = catUpsert.rows[0]?.id ?? null;
      } else {
        // A worker links to an existing catalog product but never edits the catalog.
        const cat = await db.query(
          `SELECT id FROM bio_products_catalog
           WHERE (organization_id IS NULL OR organization_id = $1)
             AND lower(trim(item_code)) = lower(trim($2))
           ORDER BY organization_id NULLS LAST
           LIMIT 1`,
          [opts.orgId, code],
        );
        catalogId = cat.rows[0]?.id ?? null;
      }
      const ins = await db.query(
        `INSERT INTO bio_record_field_products
           (field_setup_id, product_catalog_id, item_code, product_name, per_package, price_per_package, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [setupId, catalogId, code, p.productName, p.perPackage || null, p.pricePerPackage || null, nextSort],
      );
      nextSort++;
      const newId = ins.rows[0].id;
      byCode.set(lc(code), newId);
      byName.set(lc(p.productName), newId);
      productIds.push(newId);
    }

    const saved = await saveBioCells(db, {
      setupId,
      cells: cells.map((e) => ({
        productColumnId: productIds[e.productIndex],
        weekNumber: e.weekNumber,
        perM2: e.perM2 ?? null,
        units: e.units ?? null,
      })),
      mode: opts.mode,
      actorId: opts.actorId,
      now,
      keepApprovedWhereBlank: true,
    });
    written += saved.written;
    pending += saved.pending;
  }

  return { sheets: opts.sheets.length, entries: written, pending, setupIds };
}
