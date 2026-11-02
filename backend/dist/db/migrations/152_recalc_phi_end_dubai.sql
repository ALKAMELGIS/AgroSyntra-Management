-- Recalculate PHI end in Asia/Dubai from spray start (else end) plus PHI days.
-- Do not JOIN the UPDATE target in FROM (Postgres: invalid reference to "pa").

UPDATE pesticide_applications pa
SET phi_end_date = (
  (
    pa.application_date::timestamp
    + COALESCE(
        NULLIF(substring(trim(COALESCE(pa.application_start_time::text, '')) from '^[0-9]{1,2}:[0-9]{2}'), '')::time,
        NULLIF(substring(trim(COALESCE(pa.application_end_time::text, '')) from '^[0-9]{1,2}:[0-9]{2}'), '')::time,
        TIME '00:00'
      )
  ) AT TIME ZONE 'Asia/Dubai'
) + (
  COALESCE(
    (
      SELECT ov.phi_days
      FROM fields f
      JOIN farm_areas fa ON fa.id = f.farm_area_id
      JOIN site_product_crop_phi ov
        ON ov.product_id = pa.product_id
       AND ov.site_id = fa.site_id
       AND LOWER(TRIM(ov.crop_name)) = LOWER(TRIM(COALESCE(pa.crop_name, '')))
      WHERE f.id = pa.field_id
      LIMIT 1
    ),
    (SELECT pp.phi_days FROM pesticide_products pp WHERE pp.id = pa.product_id),
    0
  ) * INTERVAL '1 day'
)
WHERE pa.application_date IS NOT NULL;
