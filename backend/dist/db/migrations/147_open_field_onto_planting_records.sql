-- Open field uses the same Planting & Transplant sheet as greenhouse/nethouse.
-- Seeding date and transplant date are the same day (sowing in place). Existing
-- open_field_planting rows are copied onto planting_records, harvest FKs are
-- remapped, and the OF rows are kept as an archive via migrated_to_*.

ALTER TABLE open_field_planting
  ADD COLUMN IF NOT EXISTS migrated_to_planting_record_id UUID REFERENCES planting_records(id);

CREATE INDEX IF NOT EXISTS idx_ofp_migrated
  ON open_field_planting (migrated_to_planting_record_id)
  WHERE migrated_to_planting_record_id IS NOT NULL;

-- Prefer an existing planting_records row that already describes the same cycle
-- (operators who recorded OF on Planting & Transplant before this migrate).
UPDATE open_field_planting ofp
   SET migrated_to_planting_record_id = matched.pr_id
  FROM (
    SELECT DISTINCT ON (ofp.id) ofp.id AS ofp_id, pr.id AS pr_id
      FROM open_field_planting ofp
      JOIN planting_records pr
        ON ofp.field_id IS NOT DISTINCT FROM pr.field_id
       AND ofp.seeding_date = pr.seeding_date
       AND COALESCE(ofp.segment, '') = COALESCE(pr.segment, '')
       AND ofp.crop_id IS NOT DISTINCT FROM pr.crop_id
     WHERE ofp.migrated_to_planting_record_id IS NULL
     ORDER BY ofp.id, pr.created_at ASC
  ) matched
 WHERE ofp.id = matched.ofp_id
   AND ofp.migrated_to_planting_record_id IS NULL;

WITH mapped AS (
  SELECT ofp.id AS ofp_id, uuid_generate_v4() AS pr_id
    FROM open_field_planting ofp
   WHERE ofp.migrated_to_planting_record_id IS NULL
),
ins AS (
  INSERT INTO planting_records (
    id, organization_id, seeding_date, field_id, segment, total_area,
    crop_id, variety_id, crop_type, breeder_id, lot_batch_no,
    pm_quantity, uom, transplant_date, authorized_by, crop_history_id,
    status, uprooted_at, uprooted_by, uproot_reason,
    season_id, cycle_number, created_at, updated_at
  )
  SELECT
    m.pr_id,
    ofp.organization_id,
    ofp.seeding_date,
    ofp.field_id,
    ofp.segment,
    ofp.total_area,
    ofp.crop_id,
    ofp.variety_id,
    ofp.crop_type,
    ofp.breeder_id,
    ofp.lot_batch_no,
    ofp.quantity,
    ofp.uom,
    ofp.seeding_date,
    ofp.authorized_by,
    ofp.crop_history_id,
    ofp.status,
    ofp.uprooted_at,
    ofp.uprooted_by,
    ofp.uproot_reason,
    ofp.season_id,
    ofp.cycle_number,
    ofp.created_at,
    NOW()
  FROM mapped m
  JOIN open_field_planting ofp ON ofp.id = m.ofp_id
)
UPDATE open_field_planting ofp
   SET migrated_to_planting_record_id = m.pr_id
  FROM mapped m
 WHERE ofp.id = m.ofp_id;

UPDATE harvests h
   SET planting_record_id = ofp.migrated_to_planting_record_id,
       open_field_planting_id = NULL
  FROM open_field_planting ofp
 WHERE h.open_field_planting_id = ofp.id
   AND ofp.migrated_to_planting_record_id IS NOT NULL
   AND h.planting_record_id IS NULL;

-- Sites that recorded OF on the old sheet must see Planting & Transplant.
INSERT INTO site_form_templates (site_id, template_id, sort_order, is_visible)
SELECT of_sft.site_id, pst.id,
       COALESCE((SELECT MAX(sort_order) + 1 FROM site_form_templates WHERE site_id = of_sft.site_id), 0),
       TRUE
  FROM site_form_templates of_sft
  JOIN form_templates oft ON oft.id = of_sft.template_id AND oft.slug = 'open-field-seeding'
 CROSS JOIN form_templates pst
 WHERE pst.slug = 'planting-standard'
   AND NOT EXISTS (
     SELECT 1 FROM site_form_templates x
      WHERE x.site_id = of_sft.site_id AND x.template_id = pst.id
   );

UPDATE site_form_templates planting
   SET is_visible = TRUE
  FROM form_templates pst,
       site_form_templates of_sft
  JOIN form_templates oft ON oft.id = of_sft.template_id AND oft.slug = 'open-field-seeding'
 WHERE pst.id = planting.template_id
   AND pst.slug = 'planting-standard'
   AND planting.site_id = of_sft.site_id
   AND of_sft.is_visible = TRUE;

UPDATE site_form_templates sft
   SET is_visible = FALSE
  FROM form_templates ft
 WHERE ft.id = sft.template_id
   AND ft.slug = 'open-field-seeding';
