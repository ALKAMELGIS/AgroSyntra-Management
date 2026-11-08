-- 174: Persistent Form Identity & Data Integration Layer
--
-- Every form (استمارة) gets a permanent identity:
--   FORM_ID   – UUID v5 derived from FORM_KEY with a fixed namespace, so the
--               same form has the same id in every environment, after a
--               restore and after any restart. Never random, never reused.
--   FORM_KEY  – immutable machine key ("ipm.pesticide_application").
--   FORM_PATH – permanent canonical path ("ipm/pesticide-applications/application").
--               The screen route is kept separately (ui_route) because routes
--               change (e.g. /manpower/record → /manpower-record).
--
-- Additive only: no existing table is rewritten, no insert/update/save path
-- changes. Read models for Power BI / GIS live in the separate "bi" schema
-- and are plain views over the live tables (no copied data).

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Fixed namespace for FORM_ID (UUID v5). Never change this value.
CREATE OR REPLACE FUNCTION form_id_for(p_form_key TEXT) RETURNS UUID
LANGUAGE sql IMMUTABLE AS $$
  SELECT uuid_generate_v5('0b9f7c2e-4a51-5d8e-9c3b-6e2a1f4d7c90'::uuid, p_form_key)
$$;

CREATE TABLE IF NOT EXISTS form_registry (
  form_id        UUID PRIMARY KEY,
  form_key       VARCHAR(120) NOT NULL UNIQUE,
  form_path      VARCHAR(255) NOT NULL UNIQUE,
  title_en       VARCHAR(200) NOT NULL,
  title_ar       VARCHAR(200),
  category       VARCHAR(50)  NOT NULL,
  ui_route       VARCHAR(255),
  template_slug  VARCHAR(100),
  organization_id UUID REFERENCES organizations(id),   -- NULL = system form, shared by all organisations
  status         VARCHAR(20)  NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
  version        INTEGER      NOT NULL DEFAULT 1,
  description    TEXT,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT form_registry_id_matches_key CHECK (form_id = form_id_for(form_key)),
  CONSTRAINT form_registry_path_format CHECK (form_path ~ '^[a-z0-9]+(?:[-_/][a-z0-9]+)*$')
);

CREATE INDEX IF NOT EXISTS idx_form_registry_category ON form_registry (category);
CREATE INDEX IF NOT EXISTS idx_form_registry_template_slug ON form_registry (template_slug);

-- Identity is permanent: FORM_ID / FORM_KEY / FORM_PATH cannot be edited and a
-- form cannot be deleted (retire it instead, so old records keep their form).
CREATE OR REPLACE FUNCTION form_registry_guard() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'form_registry rows cannot be deleted (form %); set status = ''retired'' instead', OLD.form_key
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.form_id <> OLD.form_id OR NEW.form_key <> OLD.form_key OR NEW.form_path <> OLD.form_path THEN
    RAISE EXCEPTION 'FORM_ID, FORM_KEY and FORM_PATH are permanent (form %)', OLD.form_key
      USING ERRCODE = 'restrict_violation';
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_form_registry_guard ON form_registry;
CREATE TRIGGER trg_form_registry_guard
  BEFORE UPDATE OR DELETE ON form_registry
  FOR EACH ROW EXECUTE FUNCTION form_registry_guard();

-- Which tables hold each form's data.
--   role = records  : one row per submitted form (header)
--          lines    : child rows of a record (parent_key → records.id)
--          photos   : child photo rows
CREATE TABLE IF NOT EXISTS form_registry_tables (
  form_id           UUID NOT NULL REFERENCES form_registry(form_id),
  table_name        VARCHAR(100) NOT NULL,
  role              VARCHAR(20)  NOT NULL CHECK (role IN ('records', 'lines', 'photos')),
  parent_table      VARCHAR(100),
  parent_key        VARCHAR(100),
  date_column       VARCHAR(100),
  attachment_entity VARCHAR(100),   -- attachments.entity value used for this table
  template_column   VARCHAR(100),   -- records shared by several forms: column pointing at form_templates.id
  is_default        BOOLEAN NOT NULL DEFAULT TRUE, -- the form a row belongs to when it has no template
  PRIMARY KEY (form_id, table_name)
);

-- ── System forms ───────────────────────────────────────────────────────────
INSERT INTO form_registry (form_id, form_key, form_path, title_en, title_ar, category, ui_route, template_slug)
SELECT form_id_for(k), k, p, te, ta, c, r, s FROM (VALUES
  ('ecph.entry',                    'operations/ecph/entry',                       'EC/pH Entry',                    'إدخال EC/pH',                 'ecph',        '/ecph-entry',                                'ecph-standard'),
  ('ecph.farm_plots',               'operations/ecph/farm-plots',                  'EC/pH Farm Plots',               'EC/pH قطع المزرعة',           'ecph',        '/ecph-entry',                                'ecph-farm-plots'),
  ('fertigation.entry',             'operations/fertigation/entry',                'Fertigation Entry',              'إدخال التسميد',               'fertigation', '/fertigation/entry',                         'fertigation-standard'),
  ('fertigation.application_record','operations/fertigation/application-records',  'Fertilizer Application Records', 'سجلات تطبيق الأسمدة',         'fertigation', '/fertigation/entry',                         NULL),
  ('irrigation.entry',              'operations/irrigation/entry',                 'Irrigation Entry',               'إدخال الري',                  'irrigation',  '/irrigation/entry',                          NULL),
  ('irrigation.monthly_record',     'operations/irrigation/monthly-records',       'Irrigation Monthly Records',     'سجلات الري الشهرية',          'irrigation',  '/irrigation/entry',                          NULL),
  ('harvest.entry',                 'operations/harvest/entry',                    'Harvest Entry',                  'إدخال الحصاد',                'harvest',     '/harvest/entry',                             'harvest-standard'),
  ('pump_room.water',               'operations/pump-room/water',                  'Pump Room — Water',              'غرفة المضخات — المياه',       'pump_room',   '/pump-room',                                 NULL),
  ('pump_room.electricity',         'operations/pump-room/electricity',            'Pump Room — Electricity',        'غرفة المضخات — الكهرباء',     'pump_room',   '/pump-room',                                 NULL),
  ('pump_room.fogger',              'operations/pump-room/fogger',                 'Pump Room — Fogger',             'غرفة المضخات — الضباب',       'pump_room',   '/pump-room',                                 NULL),
  ('ipm.pesticide_application',     'ipm/pesticide-applications/application',      'Pesticide Applications',         'تطبيقات المبيدات',            'pest',        '/ipm/pesticide-applications',                'pest-application'),
  ('ipm.pesticide_spray',           'ipm/pesticide-applications/spray',            'Pesticide — Spray',              'المبيدات — رش',               'pest',        '/ipm/pesticide-applications',                'pest-spray'),
  ('ipm.pesticide_drench',          'ipm/pesticide-applications/drench',           'Pesticide — Drench',             'المبيدات — سقاية',            'pest',        '/ipm/pesticide-applications',                'pest-drench'),
  ('ipm.pesticide_pivot_rc109',     'ipm/pesticide-applications/pivot-rc109',      'Pesticide — Pivots (RC-109)',    'المبيدات — المحاور (RC-109)', 'pest',        '/ipm/pesticide-applications',                'pest-pivot-rc109'),
  ('ipm.spray_work_order',          'ipm/spray-work-orders',                       'Spray Work Orders',              'أوامر عمل الرش',              'pest',        '/ipm/pesticide-applications',                NULL),
  ('ipm.scouting_report',           'ipm/scouting/report',                         'Scouting Reports',               'تقارير الكشف',                'scouting',    '/ipm/scouting-reports',                      'scouting-report'),
  ('ipm.scouting_summary',          'ipm/scouting/summary',                        'Scouting Summary',               'ملخص الكشف',                  'scouting',    '/ipm/scouting-reports?tab=summary',          'scouting-summary'),
  ('ipm.biological_control',        'ipm/biological-control/record',               'Biological Control',             'المكافحة الحيوية',            'biological',  '/ipm/biological-control-record',             'biological-control'),
  ('ipm.biological_release',        'ipm/biological-control/releases',             'Biological Control Releases',    'إطلاقات المكافحة الحيوية',    'biological',  '/ipm/biological-control-record',             NULL),
  ('ipm.bumble_bee_deployment',     'ipm/bumble-bees/deployment',                  'Bumble Bee Deployments',         'نشر النحل الطنان',            'biological',  '/ipm/bumble-bees',                           NULL),
  ('ipm.bumble_bee_inspection',     'ipm/bumble-bees/box-inspection',              'Bumble Bee Box Inspections',     'فحص صناديق النحل',            'biological',  '/ipm/bumble-bees',                           NULL),
  ('environment.weather_log',       'environment/weather-log',                     'Weather Log',                    'سجل الطقس',                   'weather',     '/weather-log',                               'weather-log'),
  ('workforce.manpower_record',     'workforce/manpower-record',                   'Manpower Records',               'سجل القوى العاملة',           'workforce',   '/manpower-record',                           'manpower-entry'),
  ('workforce.daily_report',        'workforce/daily-manpower-report',             'Daily Manpower Report',          'تقرير العمالة اليومي',        'workforce',   '/manpower-record?tab=daily',                 'daily-manpower-report'),
  ('planting.planting_record',      'planting/planting-records',                   'Planting & Transplant',          'الزراعة والشتل',              'planting',    '/admin/crop-history',                        'planting-standard'),
  ('planting.open_field_seeding',   'planting/open-field-seeding',                 'Open Field Seeding',             'زراعة الحقول المكشوفة',       'planting',    '/admin/crop-history',                        'open-field-seeding'),
  ('planting.nursery_sowing',       'planting/nursery-sowing',                     'Nursery Sowing',                 'بذر المشتل',                  'planting',    '/admin/crop-history?tab=nursery-sowing',     'nursery-sowing'),
  ('planting.germination',          'planting/germination',                        'Germination Record',             'سجل الإنبات',                 'planting',    '/admin/crop-history?tab=germination',        'germination-record'),
  ('planting.plantation_opening',   'planting/plantation-workbook/opening',        'Plantation Opening',             'فتح الزراعة',                 'planting',    '/admin/crop-history?tab=plantation-workbook','plantation-opening-closing'),
  ('planting.plantation_closing',   'planting/plantation-workbook/closing',        'Plantation Closing',             'إغلاق الزراعة',               'planting',    '/admin/crop-history?tab=plantation-workbook',NULL)
) AS v(k, p, te, ta, c, r, s)
ON CONFLICT (form_key) DO NOTHING;

-- ── Where each form's data lives ───────────────────────────────────────────
INSERT INTO form_registry_tables (form_id, table_name, role, parent_table, parent_key, date_column, attachment_entity, template_column, is_default)
SELECT form_id_for(k), t, r, pt, pk, dc, ae, tc, d FROM (VALUES
  ('ecph.entry',                     'ecph_entries',                  'records', NULL, NULL, 'date',            NULL,                         'template_id', TRUE),
  ('ecph.entry',                     'ecph_valve_readings',           'lines',   'ecph_entries', 'ecph_entry_id', NULL, NULL,                NULL,          TRUE),
  ('ecph.farm_plots',                'ecph_entries',                  'records', NULL, NULL, 'date',            NULL,                         'template_id', FALSE),
  ('fertigation.entry',              'fertigation_entries',           'records', NULL, NULL, 'date',            NULL,                         NULL,          TRUE),
  ('fertigation.application_record', 'fertilizer_application_records','records', NULL, NULL, 'date',            NULL,                         NULL,          TRUE),
  ('irrigation.entry',               'irrigation_entries',            'records', NULL, NULL, 'date',            NULL,                         NULL,          TRUE),
  ('irrigation.monthly_record',      'irrigation_records',            'records', NULL, NULL, 'date',            NULL,                         NULL,          TRUE),
  ('harvest.entry',                  'harvests',                      'records', NULL, NULL, 'date',            NULL,                         NULL,          TRUE),
  ('harvest.entry',                  'harvest_varieties',             'lines',   'harvests', 'harvest_id', NULL, NULL,                       NULL,          TRUE),
  ('pump_room.water',                'pump_room_water',               'records', NULL, NULL, 'record_date',     NULL,                         NULL,          TRUE),
  ('pump_room.electricity',          'pump_room_electricity',         'records', NULL, NULL, 'record_date',     NULL,                         NULL,          TRUE),
  ('pump_room.fogger',               'pump_room_fogger',              'records', NULL, NULL, 'record_date',     NULL,                         NULL,          TRUE),
  ('ipm.pesticide_application',      'pesticide_applications',        'records', NULL, NULL, 'application_date','pesticide_application',      'template_id', TRUE),
  ('ipm.pesticide_spray',            'pesticide_applications',        'records', NULL, NULL, 'application_date','pesticide_application',      'template_id', FALSE),
  ('ipm.pesticide_drench',           'pesticide_applications',        'records', NULL, NULL, 'application_date','pesticide_application',      'template_id', FALSE),
  ('ipm.pesticide_pivot_rc109',      'pesticide_applications',        'records', NULL, NULL, 'application_date','pesticide_application',      'template_id', FALSE),
  ('ipm.spray_work_order',           'spray_work_orders',             'records', NULL, NULL, 'date_issued',     NULL,                         NULL,          TRUE),
  ('ipm.spray_work_order',           'spray_work_order_items',        'lines',   'spray_work_orders', 'work_order_id', NULL, NULL,          NULL,          TRUE),
  ('ipm.scouting_report',            'scouting_reports',              'records', NULL, NULL, 'report_date',     NULL,                         NULL,          TRUE),
  ('ipm.scouting_report',            'scouting_observations',         'lines',   'scouting_reports', 'scouting_report_id', NULL, NULL,      NULL,          TRUE),
  ('ipm.scouting_report',            'scouting_trap_cards',           'lines',   'scouting_reports', 'scouting_report_id', NULL, NULL,      NULL,          TRUE),
  ('ipm.scouting_report',            'scouting_growth_stage',         'lines',   'scouting_reports', 'scouting_report_id', NULL, NULL,      NULL,          TRUE),
  ('ipm.scouting_report',            'scouting_photos',               'photos',  'scouting_reports', 'scouting_report_id', NULL, NULL,      NULL,          TRUE),
  ('ipm.biological_control',         'bio_record_field_setup',        'records', NULL, NULL, 'start_date',      'bio_field_setup',            NULL,          TRUE),
  ('ipm.biological_control',         'bio_record_entries',            'lines',   'bio_record_field_setup', 'field_setup_id', NULL, 'bio_record', NULL,     TRUE),
  ('ipm.biological_control',         'bio_record_field_products',     'lines',   'bio_record_field_setup', 'field_setup_id', NULL, NULL,     NULL,          TRUE),
  ('ipm.biological_release',         'bio_control_releases',          'records', NULL, NULL, 'release_date',    NULL,                         NULL,          TRUE),
  ('ipm.bumble_bee_deployment',      'bumble_bee_deployments',        'records', NULL, NULL, 'date_placed',     NULL,                         NULL,          TRUE),
  ('ipm.bumble_bee_inspection',      'bumble_bee_box_inspections',    'records', NULL, NULL, 'inspection_date', 'bumble_bee_box_inspection',  NULL,          TRUE),
  ('environment.weather_log',        'weather_logs',                  'records', NULL, NULL, 'date',            NULL,                         NULL,          TRUE),
  ('workforce.manpower_record',      'manpower_records',              'records', NULL, NULL, 'record_date',     NULL,                         NULL,          TRUE),
  ('planting.planting_record',       'planting_records',              'records', NULL, NULL, 'seeding_date',    NULL,                         NULL,          TRUE),
  ('planting.open_field_seeding',    'open_field_planting',           'records', NULL, NULL, 'seeding_date',    NULL,                         NULL,          TRUE),
  ('planting.nursery_sowing',        'nursery_sowing_records',        'records', NULL, NULL, 'seeding_date',    NULL,                         NULL,          TRUE),
  ('planting.germination',           'germination_records',           'records', NULL, NULL, NULL,              NULL,                         NULL,          TRUE),
  ('planting.plantation_opening',    'plantation_opening_records',    'records', NULL, NULL, 'requested_date',  'plantation_opening',         NULL,          TRUE),
  ('planting.plantation_closing',    'plantation_closing_records',    'records', NULL, NULL, 'requested_date',  'plantation_closing',         NULL,          TRUE)
) AS v(k, t, r, pt, pk, dc, ae, tc, d)
-- Skip tables a deployment does not have (older databases) instead of failing.
WHERE EXISTS (SELECT 1 FROM information_schema.tables it WHERE it.table_schema = 'public' AND it.table_name = v.t)
ON CONFLICT (form_id, table_name) DO NOTHING;

-- ── Templates point at their form ──────────────────────────────────────────
ALTER TABLE form_templates ADD COLUMN IF NOT EXISTS form_id UUID REFERENCES form_registry(form_id);
CREATE INDEX IF NOT EXISTS idx_form_templates_form_id ON form_templates (form_id);

-- System and organisation copies of a built-in template share the built-in form.
UPDATE form_templates ft
   SET form_id = fr.form_id
  FROM form_registry fr
 WHERE fr.template_slug = ft.slug
   AND fr.organization_id IS NULL
   AND ft.form_id IS NULL;

-- Templates created by staff (not built-in) become forms of their own. The key
-- is derived from the template's own id, which never changes after creation.
CREATE OR REPLACE FUNCTION form_templates_register() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_key  TEXT;
  v_form UUID;
BEGIN
  IF NEW.form_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  SELECT form_id INTO v_form FROM form_registry
   WHERE template_slug = NEW.slug AND organization_id IS NULL LIMIT 1;
  IF v_form IS NULL THEN
    v_key := 'template.' || NEW.id::text;
    INSERT INTO form_registry (form_id, form_key, form_path, title_en, category, ui_route, template_slug, organization_id)
    VALUES (form_id_for(v_key), v_key, 'templates/' || NEW.id::text, COALESCE(NEW.name, NEW.slug),
            COALESCE(NULLIF(NEW.category, ''), 'custom'), NEW.route_path, NEW.slug, NEW.organization_id)
    ON CONFLICT (form_key) DO NOTHING;
    v_form := form_id_for(v_key);
  END IF;
  NEW.form_id := v_form;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_form_templates_register ON form_templates;
CREATE TRIGGER trg_form_templates_register
  BEFORE INSERT ON form_templates
  FOR EACH ROW EXECUTE FUNCTION form_templates_register();

-- Existing staff-made templates (no built-in slug) get their form now.
DO $$
DECLARE r RECORD; v_key TEXT;
BEGIN
  FOR r IN SELECT * FROM form_templates WHERE form_id IS NULL LOOP
    v_key := 'template.' || r.id::text;
    INSERT INTO form_registry (form_id, form_key, form_path, title_en, category, ui_route, template_slug, organization_id)
    VALUES (form_id_for(v_key), v_key, 'templates/' || r.id::text, COALESCE(r.name, r.slug),
            COALESCE(NULLIF(r.category, ''), 'custom'), r.route_path, r.slug, r.organization_id)
    ON CONFLICT (form_key) DO NOTHING;
    UPDATE form_templates SET form_id = form_id_for(v_key) WHERE id = r.id;
  END LOOP;
END $$;

-- A built-in template must exist once only. The existing UNIQUE(organization_id, slug)
-- does not cover rows whose organization_id is NULL (NULLs never compare equal).
-- Added only when the data is already clean, so the migration never fails on a
-- database that has duplicates; bi.form_template_duplicates lists them instead.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM form_templates WHERE organization_id IS NULL GROUP BY slug HAVING COUNT(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_form_templates_system_slug
      ON form_templates (slug) WHERE organization_id IS NULL;
  ELSE
    RAISE NOTICE 'form_templates has duplicate system slugs; unique index not created (see bi.form_template_duplicates)';
  END IF;
END $$;

-- ── Read models for Power BI / GIS (schema "bi", views only) ───────────────
CREATE SCHEMA IF NOT EXISTS bi;

-- Builds every bi view from form_registry_tables, so a new table or form only
-- needs a registry row and a call to bi.rebuild_views(). Columns a table does
-- not have are simply left NULL.
CREATE OR REPLACE FUNCTION bi.rebuild_views() RETURNS VOID
LANGUAGE plpgsql AS $fn$
DECLARE
  t RECORD;
  has_org BOOLEAN; has_site BOOLEAN; has_field BOOLEAN; has_upd BOOLEAN; has_tpl BOOLEAN;
  form_expr TEXT; org_expr TEXT; site_expr TEXT; field_expr TEXT; date_expr TEXT; upd_expr TEXT;
  drop_keys TEXT;
  rec_parts TEXT[] := ARRAY[]::TEXT[];
  val_parts TEXT[] := ARRAY[]::TEXT[];
  line_parts TEXT[] := ARRAY[]::TEXT[];
  col_exists TEXT := 'SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = ''public'' AND table_name = $1 AND column_name = $2)';
BEGIN
  -- One branch per records table (a table shared by several forms appears once;
  -- each row is assigned its form through its template).
  FOR t IN
    SELECT table_name,
           MAX(date_column) AS date_column,
           MAX(template_column) AS template_column,
           (array_agg(form_id ORDER BY is_default DESC, form_id))[1] AS default_form
      FROM form_registry_tables
     WHERE role = 'records'
       AND EXISTS (SELECT 1 FROM information_schema.tables it WHERE it.table_schema = 'public' AND it.table_name = form_registry_tables.table_name)
     GROUP BY table_name
     ORDER BY table_name
  LOOP
    EXECUTE col_exists INTO has_org   USING t.table_name, 'organization_id';
    EXECUTE col_exists INTO has_site  USING t.table_name, 'site_id';
    EXECUTE col_exists INTO has_field USING t.table_name, 'field_id';
    EXECUTE col_exists INTO has_upd   USING t.table_name, 'updated_at';
    has_tpl := FALSE;
    IF t.template_column IS NOT NULL THEN
      EXECUTE col_exists INTO has_tpl USING t.table_name, t.template_column;
    END IF;

    form_expr := CASE WHEN has_tpl
      THEN format('COALESCE((SELECT ft.form_id FROM public.form_templates ft WHERE ft.id = t.%I), %L::uuid)', t.template_column, t.default_form)
      ELSE format('%L::uuid', t.default_form) END;
    field_expr := CASE WHEN has_field THEN 't.field_id' ELSE 'NULL::uuid' END;
    site_expr  := CASE WHEN has_site THEN 'COALESCE(t.site_id, fa.site_id)' ELSE 'fa.site_id' END;
    org_expr   := CASE WHEN has_org THEN 'COALESCE(t.organization_id, f.organization_id, s.organization_id)'
                       ELSE 'COALESCE(f.organization_id, s.organization_id)' END;
    date_expr  := CASE WHEN t.date_column IS NOT NULL THEN format('t.%I::date', t.date_column) ELSE 't.created_at::date' END;
    upd_expr   := CASE WHEN has_upd THEN 'COALESCE(t.updated_at, t.created_at)' ELSE 't.created_at' END;

    rec_parts := rec_parts || format($q$
      SELECT %s AS form_id, t.id AS record_id, %L::text AS source_table,
             %s AS organization_id, %s AS site_id, %s AS field_id,
             %s AS record_date, t.created_at, %s AS updated_at
        FROM public.%I t
        LEFT JOIN public.fields f      ON f.id = %s
        LEFT JOIN public.farm_areas fa ON fa.id = f.farm_area_id
        LEFT JOIN public.sites s       ON s.id = %s$q$,
      form_expr, t.table_name, org_expr, site_expr, field_expr, date_expr, upd_expr,
      t.table_name, field_expr, site_expr);

    -- Geometry / binary columns stay out of the value list (GIS reads geometry from fields / gis_features).
    SELECT COALESCE(string_agg(quote_literal(column_name), ' - '), '')
      INTO drop_keys
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = t.table_name
       AND (udt_name IN ('geometry', 'geography', 'bytea'));

    val_parts := val_parts || format($q$
      SELECT x.form_id, x.record_id, %L::text AS source_table, kv.key AS field_key,
             jsonb_typeof(kv.value) AS value_type, kv.value #>> '{}' AS value_text
        FROM (SELECT %s AS form_id, t.id AS record_id, to_jsonb(t) %s AS doc FROM public.%I t) x,
             LATERAL jsonb_each(x.doc) kv$q$,
      t.table_name, form_expr, CASE WHEN drop_keys = '' THEN '' ELSE '- ' || drop_keys END, t.table_name);
  END LOOP;

  FOR t IN
    SELECT DISTINCT table_name, parent_table, parent_key, role
      FROM form_registry_tables
     WHERE role IN ('lines', 'photos')
       AND EXISTS (SELECT 1 FROM information_schema.tables it WHERE it.table_schema = 'public' AND it.table_name = form_registry_tables.table_name)
  LOOP
    line_parts := line_parts || format($q$
      SELECT r.form_id, r.record_id, %L::text AS source_table, %L::text AS role, l.id AS line_id, to_jsonb(l) AS doc
        FROM public.%I l
        JOIN bi.form_records r ON r.record_id = l.%I AND r.source_table = %L$q$,
      t.table_name, t.role, t.table_name, t.parent_key, t.parent_table);
  END LOOP;

  EXECUTE 'DROP VIEW IF EXISTS bi.gis_key_forms, bi.form_attachments, bi.form_lines, bi.form_record_values, bi.gis_feature_forms, bi.form_records CASCADE';

  EXECUTE 'CREATE VIEW bi.form_records AS ' || array_to_string(rec_parts, E'\n UNION ALL ');
  EXECUTE 'CREATE VIEW bi.form_record_values AS ' || array_to_string(val_parts, E'\n UNION ALL ');
  IF array_length(line_parts, 1) > 0 THEN
    EXECUTE 'CREATE VIEW bi.form_lines AS ' || array_to_string(line_parts, E'\n UNION ALL ');
  END IF;

  EXECUTE $v$
    CREATE VIEW bi.form_attachments AS
    SELECT r.form_id, r.record_id, r.source_table, a.id AS attachment_id, a.original_name, a.filename,
           a.mime_type, a.size_bytes, a.url, a.created_at
      FROM public.attachments a
      JOIN (SELECT DISTINCT table_name, attachment_entity FROM public.form_registry_tables WHERE role = 'records') rt
        ON rt.attachment_entity = a.entity
      JOIN bi.form_records r ON r.record_id = a.entity_id AND r.source_table = rt.table_name
    UNION ALL
    SELECT r.form_id, r.record_id, r.source_table, a.id, a.original_name, a.filename,
           a.mime_type, a.size_bytes, a.url, a.created_at
      FROM public.attachments a
      JOIN (SELECT DISTINCT table_name, attachment_entity FROM public.form_registry_tables WHERE role = 'lines') rt
        ON rt.attachment_entity = a.entity
      JOIN bi.form_lines l ON l.line_id = a.entity_id AND l.source_table = rt.table_name
      JOIN bi.form_records r ON r.record_id = l.record_id AND r.form_id = l.form_id
  $v$;

  -- GIS: every synced feature with the forms recorded on its linked field.
  EXECUTE $v$
    CREATE VIEW bi.gis_feature_forms AS
    SELECT g.layer_id, g.id AS feature_id, g.external_id AS object_id,
           g.properties ->> COALESCE(l.attribute_mapping ->> 'globalId', 'GlobalID')  AS global_id,
           g.properties ->> COALESCE(l.attribute_mapping ->> 'zoneId',   'ZONE_ID')   AS zone_id,
           g.properties ->> COALESCE(l.attribute_mapping ->> 'farmCode', 'Farm_Code') AS farm_code,
           g.linked_field_id AS field_id,
           r.form_id, COUNT(r.record_id) AS record_count,
           MIN(r.record_date) AS first_record_date, MAX(r.record_date) AS last_record_date,
           MAX(r.updated_at) AS last_updated_at
      FROM public.gis_features g
      JOIN public.gis_layers l ON l.id = g.layer_id
      LEFT JOIN bi.form_records r ON r.field_id = g.linked_field_id
     GROUP BY g.layer_id, g.id, g.external_id, global_id, zone_id, farm_code, g.linked_field_id, r.form_id
  $v$;

  -- Records of every form per ZONE_ID + Farm_Code (needs the GIS keys added in migration 175).
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'bi' AND table_name = 'dim_location' AND column_name = 'gis_link_key') THEN
    EXECUTE $v$
      CREATE VIEW bi.gis_key_forms AS
      SELECT l.gis_link_key, l.gis_zone_id AS zone_id, l.gis_farm_code AS farm_code, l.field_id, l.organization_id,
             r.form_id, COUNT(r.record_id) AS record_count,
             MIN(r.record_date) AS first_record_date, MAX(r.record_date) AS last_record_date,
             MAX(r.updated_at) AS last_updated_at
        FROM bi.dim_location l
        JOIN bi.form_records r ON r.field_id = l.field_id
       WHERE l.gis_link_key IS NOT NULL
       GROUP BY l.gis_link_key, l.gis_zone_id, l.gis_farm_code, l.field_id, l.organization_id, r.form_id
    $v$;
  END IF;
END;
$fn$;

CREATE OR REPLACE VIEW bi.forms AS
SELECT fr.form_id, fr.form_key, fr.form_path, fr.title_en, fr.title_ar, fr.category, fr.ui_route,
       fr.template_slug, fr.organization_id, fr.status, fr.version, fr.created_at, fr.updated_at
  FROM form_registry fr;

-- Every column of every table that makes up a form (the form's "fields").
CREATE OR REPLACE VIEW bi.form_fields AS
SELECT rt.form_id, rt.table_name, rt.role, c.column_name AS field_key, c.data_type, c.ordinal_position,
       c.is_nullable = 'YES' AS nullable
  FROM form_registry_tables rt
  JOIN information_schema.columns c ON c.table_schema = 'public' AND c.table_name = rt.table_name
 WHERE c.udt_name NOT IN ('geometry', 'geography', 'bytea');

-- Location dimension: zone › site › farm area › field, with the field's GIS keys.
CREATE OR REPLACE VIEW bi.dim_location AS
SELECT f.id AS field_id, f.name AS field_name, f.organization_id,
       fa.id AS farm_area_id, fa.name AS farm_area_name,
       s.id AS site_id, s.name AS site_name,
       c.id AS zone_uuid, c.code AS zone_code, c.name AS zone_name,
       ft.name AS field_type,
       f.gis_external_id,
       f.latitude, f.longitude,
       CASE WHEN f.polygon IS NOT NULL THEN ST_Y(ST_PointOnSurface(f.polygon)) END AS centroid_lat,
       CASE WHEN f.polygon IS NOT NULL THEN ST_X(ST_PointOnSurface(f.polygon)) END AS centroid_lon,
       f.deleted_at IS NOT NULL AS is_deleted
  FROM fields f
  LEFT JOIN farm_areas fa ON fa.id = f.farm_area_id
  LEFT JOIN sites s ON s.id = fa.site_id
  LEFT JOIN countries c ON c.id = s.country_id
  LEFT JOIN field_types ft ON ft.id = f.field_type_id;

CREATE OR REPLACE VIEW bi.form_template_duplicates AS
SELECT slug, COUNT(*) AS copies, array_agg(id) AS template_ids
  FROM form_templates WHERE organization_id IS NULL GROUP BY slug HAVING COUNT(*) > 1;

SELECT bi.rebuild_views();
