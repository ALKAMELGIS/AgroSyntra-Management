/**
 * Per-field Excel import: uproot overlapping cycles then insert/update rows
 * in one transaction so a later 409 cannot leave half a field saved.
 */

import { AppError } from '../utils/errors';
import { createCropHistoryForPlanting, rotationStartDate } from '../utils/cropHistoryForPlanting';
import { coerceOpenFieldPlantingDates } from '../utils/openFieldSowing';
import {
  PlantingTable,
  UprootDb,
  uprootPlanting,
} from './plantingUproot.service';
import { preparePlantingInsert } from './seasons.service';

export interface ImportCycleUproot {
  segments: readonly string[] | 'ALL';
  uprootDate: string;
  afterDate?: string | null;
  beforeDate?: string | null;
  reason?: string | null;
}

export interface ImportCycleEntry {
  existingId?: string | null;
  skipOccupancy?: boolean;
  seedingDate: string;
  fieldId?: string | null;
  segment?: string | null;
  totalArea?: string | null;
  cropId?: string | null;
  varietyId?: string | null;
  cropType?: string | null;
  breederId?: string | null;
  lotBatchNo?: string | null;
  quantity?: number | string | null;
  pmQuantity?: number | string | null;
  uom?: string | null;
  authorizedBy?: string | null;
  cropSubClass?: string | null;
  breeder?: string | null;
  traysPerHec?: string | null;
  ratePerHec?: string | null;
  transplantDate?: string | null;
  sowingRecordId?: string | null;
}

export function assertImportUprootWindow(uproot: ImportCycleUproot): void {
  if (uproot.afterDate && uproot.uprootDate < uproot.afterDate) {
    throw new AppError(
      `Uproot date ${uproot.uprootDate} is before the previous plant ${uproot.afterDate}.`,
      'UPROOT_DATE_INVALID',
      400,
    );
  }
  if (uproot.beforeDate && uproot.uprootDate >= uproot.beforeDate) {
    throw new AppError(
      `Uproot date ${uproot.uprootDate} must be before the next plant ${uproot.beforeDate}.`,
      'UPROOT_DATE_INVALID',
      400,
    );
  }
}

export function inheritImportSegments<T extends { occupancyDate: string; segment?: string | null }>(
  entries: T[],
): T[] {
  const inherited = new Map<string, string>();
  for (const entry of entries) {
    const segment = String(entry.segment || '').trim();
    if (segment && !inherited.has(entry.occupancyDate)) {
      inherited.set(entry.occupancyDate, segment);
    }
  }
  return entries.map((entry) => {
    if (String(entry.segment || '').trim()) return entry;
    const next = inherited.get(entry.occupancyDate);
    return next ? { ...entry, segment: next } : entry;
  });
}

function occupancyDateFor(table: PlantingTable, entry: ImportCycleEntry): string {
  if (table === 'planting_records') {
    return entry.transplantDate || entry.seedingDate;
  }
  return entry.seedingDate;
}

function withCompanionFlags(
  table: PlantingTable,
  entries: ImportCycleEntry[],
): Array<ImportCycleEntry & { occupancyDate: string; skipOccupancy: boolean }> {
  const dated = inheritImportSegments(
    entries.map((entry) => ({ ...entry, occupancyDate: occupancyDateFor(table, entry) })),
  );
  const firstCreate = new Map<string, number>();
  const hasUpdate = new Set<string>();
  dated.forEach((entry, index) => {
    if (entry.existingId) hasUpdate.add(entry.occupancyDate);
    else if (!firstCreate.has(entry.occupancyDate)) firstCreate.set(entry.occupancyDate, index);
  });
  return dated.map((entry, index) => {
    if (entry.existingId) return { ...entry, skipOccupancy: false };
    const skip = hasUpdate.has(entry.occupancyDate)
      || firstCreate.get(entry.occupancyDate) !== index;
    return { ...entry, skipOccupancy: skip };
  });
}

async function updateOpenField(
  entry: ImportCycleEntry,
  fieldId: string,
  db: UprootDb,
): Promise<void> {
  const existing = await db.query(
    `SELECT id, field_id FROM open_field_planting WHERE id = $1::uuid`,
    [entry.existingId],
  );
  if (existing.rows.length === 0) {
    throw new AppError('Planting row to update was not found.', 'NOT_FOUND', 404);
  }
  if (String(existing.rows[0].field_id) !== fieldId) {
    throw new AppError('Update row does not belong to this field.', 'FIELD_MISMATCH', 400);
  }
  await db.query(
    `UPDATE open_field_planting SET
        seeding_date = $1,
        field_id = $2::uuid,
        segment = $3,
        total_area = $4,
        crop_id = $5::uuid,
        variety_id = $6::uuid,
        crop_type = $7,
        breeder_id = $8::uuid,
        lot_batch_no = $9,
        quantity = $10,
        uom = $11,
        authorized_by = $12,
        updated_at = NOW()
      WHERE id = $13::uuid`,
    [
      entry.seedingDate,
      fieldId,
      entry.segment || null,
      entry.totalArea || null,
      entry.cropId || null,
      entry.varietyId || null,
      entry.cropType || 'Annual',
      entry.breederId || null,
      entry.lotBatchNo || null,
      entry.quantity ? Number(entry.quantity) : null,
      entry.uom || null,
      entry.authorizedBy || null,
      entry.existingId,
    ],
  );
}

async function insertOpenField(
  entry: ImportCycleEntry & { occupancyDate: string; skipOccupancy: boolean },
  fieldId: string,
  organizationId: string | null,
  db: UprootDb,
): Promise<void> {
  let cropHistoryId: string | null = null;
  if (fieldId && entry.seedingDate && entry.cropId) {
    cropHistoryId = await createCropHistoryForPlanting(
      fieldId, entry.cropId, entry.varietyId || null,
      entry.seedingDate, db,
    );
  }
  const { seasonId, cycleNumber } = await preparePlantingInsert(
    'open_field_planting',
    {
      fieldId,
      segment: entry.segment || null,
      cropId: entry.cropId || null,
      occupancyDate: entry.occupancyDate,
      skipOccupancy: entry.skipOccupancy,
    },
    db,
  );
  await db.query(
    `INSERT INTO open_field_planting
     (organization_id, seeding_date, field_id, segment, total_area,
      crop_id, variety_id, crop_type, breeder_id,
      lot_batch_no, quantity, uom, authorized_by, crop_history_id,
      season_id, cycle_number)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [
      organizationId, entry.seedingDate, fieldId, entry.segment || null, entry.totalArea || null,
      entry.cropId || null, entry.varietyId || null, entry.cropType || 'Annual',
      entry.breederId || null, entry.lotBatchNo || null,
      entry.quantity ? Number(entry.quantity) : null, entry.uom || null,
      entry.authorizedBy || null, cropHistoryId, seasonId, cycleNumber,
    ],
  );
}

async function updatePlantingRecord(
  entry: ImportCycleEntry,
  fieldId: string,
  db: UprootDb,
): Promise<void> {
  const existing = await db.query(
    `SELECT id, field_id, seeding_date FROM planting_records WHERE id = $1::uuid`,
    [entry.existingId],
  );
  if (existing.rows.length === 0) {
    throw new AppError('Planting row to update was not found.', 'NOT_FOUND', 404);
  }
  if (String(existing.rows[0].field_id) !== fieldId) {
    throw new AppError('Update row does not belong to this field.', 'FIELD_MISMATCH', 400);
  }
  const data = await coerceOpenFieldPlantingDates(
    {
      seedingDate: entry.seedingDate,
      fieldId,
      segment: entry.segment,
      totalArea: entry.totalArea,
      cropId: entry.cropId,
      varietyId: entry.varietyId,
      cropSubClass: entry.cropSubClass,
      cropType: entry.cropType,
      breeder: entry.breeder,
      breederId: entry.breederId,
      lotBatchNo: entry.lotBatchNo,
      pmQuantity: entry.pmQuantity,
      uom: entry.uom,
      traysPerHec: entry.traysPerHec,
      ratePerHec: entry.ratePerHec,
      transplantDate: entry.transplantDate,
      authorizedBy: entry.authorizedBy,
      sowingRecordId: entry.sowingRecordId,
    },
    existing.rows[0],
    db,
  );
  await db.query(
    `UPDATE planting_records SET
        seeding_date = $1,
        field_id = $2::uuid,
        segment = $3,
        total_area = $4,
        crop_id = $5::uuid,
        variety_id = $6::uuid,
        crop_sub_class = $7,
        crop_type = $8,
        breeder = $9,
        breeder_id = $10::uuid,
        lot_batch_no = $11,
        pm_quantity = $12,
        uom = $13,
        trays_per_hec = $14,
        rate_per_hec = $15,
        transplant_date = $16,
        authorized_by = $17,
        sowing_record_id = $18::uuid,
        updated_at = NOW()
      WHERE id = $19::uuid`,
    [
      data.seedingDate,
      fieldId,
      data.segment || null,
      data.totalArea || null,
      data.cropId || null,
      data.varietyId || null,
      data.cropSubClass || null,
      data.cropType || 'Annual',
      data.breeder || null,
      data.breederId || null,
      data.lotBatchNo || null,
      data.pmQuantity ? Number(data.pmQuantity) : null,
      data.uom || null,
      data.traysPerHec || null,
      data.ratePerHec || null,
      data.transplantDate || null,
      data.authorizedBy || null,
      data.sowingRecordId ?? null,
      entry.existingId,
    ],
  );
}

async function insertPlantingRecord(
  entry: ImportCycleEntry & { occupancyDate: string; skipOccupancy: boolean },
  fieldId: string,
  organizationId: string | null,
  db: UprootDb,
): Promise<void> {
  const data = await coerceOpenFieldPlantingDates(
    {
      seedingDate: entry.seedingDate,
      fieldId,
      segment: entry.segment,
      totalArea: entry.totalArea,
      cropId: entry.cropId,
      varietyId: entry.varietyId,
      cropSubClass: entry.cropSubClass,
      cropType: entry.cropType,
      breeder: entry.breeder,
      breederId: entry.breederId,
      lotBatchNo: entry.lotBatchNo,
      pmQuantity: entry.pmQuantity,
      uom: entry.uom,
      traysPerHec: entry.traysPerHec,
      ratePerHec: entry.ratePerHec,
      transplantDate: entry.transplantDate,
      authorizedBy: entry.authorizedBy,
      sowingRecordId: entry.sowingRecordId,
    },
    null,
    db,
  );
  let cropHistoryId: string | null = null;
  const rotationStart = rotationStartDate(data.transplantDate, data.seedingDate);
  if (fieldId && data.cropId && rotationStart) {
    cropHistoryId = await createCropHistoryForPlanting(
      fieldId, data.cropId, data.varietyId || null,
      rotationStart, db,
    );
  }
  const occupancyDate = data.transplantDate || data.seedingDate;
  const { seasonId, cycleNumber } = await preparePlantingInsert(
    'planting_records',
    {
      fieldId,
      segment: data.segment || null,
      cropId: data.cropId || null,
      occupancyDate,
      skipOccupancy: entry.skipOccupancy,
    },
    db,
  );
  await db.query(
    `INSERT INTO planting_records
     (organization_id, seeding_date, field_id, segment, total_area,
      crop_id, variety_id, crop_sub_class, crop_type, breeder, breeder_id,
      lot_batch_no, pm_quantity, uom, trays_per_hec, rate_per_hec,
      transplant_date, authorized_by, crop_history_id, sowing_record_id,
      season_id, cycle_number)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
    [
      organizationId, data.seedingDate, fieldId, data.segment || null, data.totalArea || null,
      data.cropId || null, data.varietyId || null, data.cropSubClass || null, data.cropType || 'Annual',
      data.breeder || null, data.breederId || null, data.lotBatchNo || null,
      data.pmQuantity ? Number(data.pmQuantity) : null, data.uom || null,
      data.traysPerHec || null, data.ratePerHec || null,
      data.transplantDate || null, data.authorizedBy || null, cropHistoryId,
      data.sowingRecordId || null, seasonId, cycleNumber,
    ],
  );
}

export async function importPlantingCycles(
  input: {
    table: PlantingTable;
    fieldId: string;
    uproots: ImportCycleUproot[];
    entries: ImportCycleEntry[];
    organizationId?: string | null;
    userId?: string | null;
  },
  db: UprootDb,
): Promise<{ created: number; updated: number }> {
  const uproots = [...input.uproots].sort((a, b) => a.uprootDate.localeCompare(b.uprootDate));
  for (const uproot of uproots) {
    assertImportUprootWindow(uproot);
    await uprootPlanting(
      {
        table: input.table,
        fieldId: input.fieldId,
        segments: uproot.segments,
        uprootDate: uproot.uprootDate,
        reason: uproot.reason || 'Imported cycle',
        userId: input.userId ?? null,
        organizationId: input.organizationId ?? null,
      },
      db,
    );
  }

  const entries = withCompanionFlags(input.table, input.entries)
    .sort((a, b) => a.occupancyDate.localeCompare(b.occupancyDate));

  let created = 0;
  let updated = 0;
  for (const entry of entries) {
    if (entry.existingId) {
      switch (input.table) {
        case 'open_field_planting':
          await updateOpenField(entry, input.fieldId, db);
          break;
        case 'planting_records':
          await updatePlantingRecord(entry, input.fieldId, db);
          break;
        default: {
          const _exhaustive: never = input.table;
          throw new AppError(`Unsupported planting table: ${_exhaustive}`, 'INTERNAL_ERROR', 500);
        }
      }
      updated += 1;
      continue;
    }
    switch (input.table) {
      case 'open_field_planting':
        await insertOpenField(entry, input.fieldId, input.organizationId ?? null, db);
        break;
      case 'planting_records':
        await insertPlantingRecord(entry, input.fieldId, input.organizationId ?? null, db);
        break;
      default: {
        const _exhaustive: never = input.table;
        throw new AppError(`Unsupported planting table: ${_exhaustive}`, 'INTERNAL_ERROR', 500);
      }
    }
    created += 1;
  }

  return { created, updated };
}
