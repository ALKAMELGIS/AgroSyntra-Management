-- Rollback: 030_fix_missing_tables.sql
-- WARNING: This drops tables and data. Only use if you need to undo this migration.

DROP INDEX IF EXISTS idx_phi_notifications_app;
DROP INDEX IF EXISTS idx_scouting_reports_date;
DROP INDEX IF EXISTS idx_scouting_reports_field;
DROP INDEX IF EXISTS idx_bumble_bees_field;
DROP INDEX IF EXISTS idx_bio_releases_field;
DROP INDEX IF EXISTS idx_pesticide_apps_phi;
DROP INDEX IF EXISTS idx_pesticide_apps_date;
DROP INDEX IF EXISTS idx_pesticide_apps_field;

DROP TABLE IF EXISTS scouting_thresholds CASCADE;
DROP TABLE IF EXISTS phi_notifications CASCADE;
DROP TABLE IF EXISTS bumble_bee_deployments CASCADE;
DROP TABLE IF EXISTS bio_control_releases CASCADE;
DROP TABLE IF EXISTS bio_control_products CASCADE;
DROP TABLE IF EXISTS pesticide_applications CASCADE;
DROP TABLE IF EXISTS pesticide_products CASCADE;
DROP TABLE IF EXISTS team_assignments CASCADE;
DROP TABLE IF EXISTS scouting_photos CASCADE;
DROP TABLE IF EXISTS scouting_reports CASCADE;
DROP TABLE IF EXISTS pest_disease_catalog CASCADE;

ALTER TABLE tasks DROP COLUMN IF EXISTS parent_task_id;
ALTER TABLE tasks DROP COLUMN IF EXISTS delegated_by;
ALTER TABLE tasks DROP COLUMN IF EXISTS team_leader_id;

-- Note: We keep organizations table since users depend on it
