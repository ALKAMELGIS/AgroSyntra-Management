import { dbPool } from '../db/client';
import { logger } from '../utils/logger';

/** Calendar days until clear date (orange/red). Clearance uses phi_end_date > NOW() (exact time). */
const PHI_DAYS_REMAINING_SQL = `GREATEST(0, (pa.phi_end_date::date - CURRENT_DATE))::int`;
const PHI_STILL_ACTIVE_SQL = `pa.phi_end_date > NOW()`;

export interface FieldSummary {
  field: {
    id: string;
    name: string;
    farmAreaName: string;
    siteName: string;
    cropName: string | null;
    varietyName: string | null;
    area: number | null;
  };
  harvest: {
    totalKg: number;
    count: number;
    period: string;
  };
  ecph: {
    avgEcIn: number | null;
    avgEcOut: number | null;
    avgPhIn: number | null;
    avgPhOut: number | null;
    period: string;
  };
  water: {
    totalM3: number;
    period: string;
  };
  pesticides: Array<{
    applicationDate: string;
    productName: string;
    dosage: number | null;
    dosageUnit: string | null;
    targetPest: string | null;
    phiEndDate: string | null;
    phiRemaining: number | null;
  }>;
  bioReleases: Array<{
    releaseDate: string;
    productName: string;
    quantity: number;
    targetPest: string | null;
  }>;
  scouting: Array<{
    reportDate: string;
    pestName: string | null;
    customPestName: string | null;
    severity: string | null;
    infestationPct: number | null;
    status: string;
  }>;
  activePhi: Array<{
    productName: string;
    phiEndDate: string;
    daysRemaining: number;
    phiDays: number;
    segment?: string | null;
  }>;
}

export async function getPhiStatusBatch(organizationId: string): Promise<
  Array<{ fieldId: string; fieldName: string; hasActivePhi: boolean; daysRemaining: number; productName: string }>
> {
  const result = await dbPool.query(
    `SELECT pa.field_id, f.name AS field_name, pp.name AS product_name,
            ${PHI_DAYS_REMAINING_SQL} AS days_remaining
     FROM pesticide_applications pa
     JOIN fields f ON f.id = pa.field_id
     LEFT JOIN pesticide_products pp ON pp.id = pa.product_id
     WHERE pa.approval_status = 'approved'
       AND ${PHI_STILL_ACTIVE_SQL}
       AND f.deleted_at IS NULL
       AND COALESCE(pa.organization_id, f.organization_id) = $1
     ORDER BY pa.phi_end_date ASC`,
    [organizationId],
  );

  const byField = new Map<string, { fieldId: string; fieldName: string; daysRemaining: number; productName: string }>();
  for (const r of result.rows) {
    const existing = byField.get(r.field_id);
    const days = Number(r.days_remaining);
    if (!existing || days < existing.daysRemaining) {
      byField.set(r.field_id, {
        fieldId: r.field_id,
        fieldName: r.field_name,
        daysRemaining: days,
        productName: r.product_name || 'Unknown',
      });
    }
  }

  return Array.from(byField.values()).map((e) => ({
    ...e,
    hasActivePhi: true,
  }));
}

export async function getFieldSummary(fieldId: string): Promise<FieldSummary> {
  const [
    fieldResult,
    harvestResult,
    ecphResult,
    waterResult,
    pesticidesResult,
    bioResult,
    scoutingResult,
    phiResult,
  ] = await Promise.all([
    dbPool.query(
      `SELECT f.id, f.name, f.area,
              fa.name AS farm_area_name,
              s.name AS site_name,
              c.name AS crop_name,
              cv.name AS variety_name
       FROM fields f
       LEFT JOIN farm_areas fa ON fa.id = f.farm_area_id
       LEFT JOIN sites s ON s.id = fa.site_id
       LEFT JOIN crops c ON c.id = f.current_crop_id
       LEFT JOIN crop_varieties cv ON cv.id = f.variety_id
       WHERE f.id = $1`,
      [fieldId],
    ),
    dbPool.query(
      `SELECT COALESCE(SUM(total_quantity), 0) AS total_kg, COUNT(*) AS count
       FROM harvests WHERE field_id = $1 AND date >= NOW() - INTERVAL '30 days'`,
      [fieldId],
    ),
    dbPool.query(
      `SELECT AVG(vr.ec_in) AS avg_ec_in, AVG(vr.ec) AS avg_ec_out,
              AVG(vr.ph_in) AS avg_ph_in, AVG(vr.ph) AS avg_ph_out
       FROM ecph_entries e
       JOIN ecph_valve_readings vr ON vr.ecph_entry_id = e.id
       WHERE e.field_id = $1 AND e.date >= NOW() - INTERVAL '7 days'`,
      [fieldId],
    ),
    dbPool.query(
      `SELECT COALESCE(SUM(daily_water), 0) AS total_water
       FROM fertigation_entries WHERE field_id = $1 AND date >= NOW() - INTERVAL '30 days'`,
      [fieldId],
    ),
    dbPool.query(
      `SELECT pa.application_date, pp.name AS product_name,
              pa.dosage, pa.dosage_unit, pa.target_pest,
              pa.phi_end_date,
              CASE WHEN ${PHI_STILL_ACTIVE_SQL}
                THEN ${PHI_DAYS_REMAINING_SQL}
                ELSE NULL END AS phi_remaining
       FROM pesticide_applications pa
       LEFT JOIN pesticide_products pp ON pp.id = pa.product_id
       WHERE pa.field_id = $1
       ORDER BY pa.application_date DESC LIMIT 5`,
      [fieldId],
    ),
    dbPool.query(
      `SELECT br.release_date, bp.name AS product_name,
              br.quantity, br.target_pest
       FROM bio_control_releases br
       LEFT JOIN bio_control_products bp ON bp.id = br.product_id
       WHERE br.field_id = $1
       ORDER BY br.release_date DESC LIMIT 5`,
      [fieldId],
    ),
    dbPool.query(
      `SELECT sr.report_date, pdc.name AS pest_name, sr.custom_pest_name,
              sr.severity, sr.infestation_pct, sr.status
       FROM scouting_reports sr
       LEFT JOIN pest_disease_catalog pdc ON pdc.id = sr.pest_disease_id
       WHERE sr.field_id = $1
       ORDER BY sr.report_date DESC LIMIT 5`,
      [fieldId],
    ),
    dbPool.query(
      `SELECT pp.name AS product_name, pa.phi_end_date,
              pp.phi_days, pa.segment_id,
              ${PHI_DAYS_REMAINING_SQL} AS days_remaining
       FROM pesticide_applications pa
       LEFT JOIN pesticide_products pp ON pp.id = pa.product_id
       WHERE pa.field_id = $1
         AND pa.approval_status = 'approved'
         AND ${PHI_STILL_ACTIVE_SQL}
       ORDER BY pa.phi_end_date ASC`,
      [fieldId],
    ),
  ]);

  const field = fieldResult.rows[0];
  if (!field) {
    throw new Error('Field not found');
  }

  const h = harvestResult.rows[0];
  const e = ecphResult.rows[0];
  const w = waterResult.rows[0];

  return {
    field: {
      id: field.id,
      name: field.name,
      farmAreaName: field.farm_area_name || '',
      siteName: field.site_name || '',
      cropName: field.crop_name,
      varietyName: field.variety_name,
      area: field.area ? Number(field.area) : null,
    },
    harvest: {
      totalKg: Number(h?.total_kg || 0),
      count: Number(h?.count || 0),
      period: '30 days',
    },
    ecph: {
      avgEcIn: e?.avg_ec_in ? Number(Number(e.avg_ec_in).toFixed(2)) : null,
      avgEcOut: e?.avg_ec_out ? Number(Number(e.avg_ec_out).toFixed(2)) : null,
      avgPhIn: e?.avg_ph_in ? Number(Number(e.avg_ph_in).toFixed(2)) : null,
      avgPhOut: e?.avg_ph_out ? Number(Number(e.avg_ph_out).toFixed(2)) : null,
      period: '7 days',
    },
    water: {
      totalM3: Number(w?.total_water || 0),
      period: '30 days',
    },
    pesticides: pesticidesResult.rows.map((r: any) => ({
      applicationDate: r.application_date,
      productName: r.product_name || 'Unknown',
      dosage: r.dosage ? Number(r.dosage) : null,
      dosageUnit: r.dosage_unit,
      targetPest: r.target_pest,
      phiEndDate: r.phi_end_date,
      phiRemaining: r.phi_remaining != null ? Number(r.phi_remaining) : null,
    })),
    bioReleases: bioResult.rows.map((r: any) => ({
      releaseDate: r.release_date,
      productName: r.product_name || 'Unknown',
      quantity: Number(r.quantity),
      targetPest: r.target_pest,
    })),
    scouting: scoutingResult.rows.map((r: any) => ({
      reportDate: r.report_date,
      pestName: r.pest_name,
      customPestName: r.custom_pest_name,
      severity: r.severity,
      infestationPct: r.infestation_pct ? Number(r.infestation_pct) : null,
      status: r.status,
    })),
    activePhi: phiResult.rows.map((r: any) => ({
      productName: r.product_name || 'Unknown',
      phiEndDate: r.phi_end_date,
      daysRemaining: Number(r.days_remaining),
      phiDays: Number(r.phi_days),
      segment: r.segment_id || null,
    })),
  };
}
