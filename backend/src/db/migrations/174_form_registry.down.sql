-- Reverses 174_form_registry (read models and registry only; no record data is touched).
DROP SCHEMA IF EXISTS bi CASCADE;
DROP TRIGGER IF EXISTS trg_form_templates_register ON form_templates;
DROP FUNCTION IF EXISTS form_templates_register();
DROP INDEX IF EXISTS uq_form_templates_system_slug;
ALTER TABLE form_templates DROP COLUMN IF EXISTS form_id;
DROP TABLE IF EXISTS form_registry_tables;
DROP TRIGGER IF EXISTS trg_form_registry_guard ON form_registry;
DROP TABLE IF EXISTS form_registry;
DROP FUNCTION IF EXISTS form_registry_guard();
DROP FUNCTION IF EXISTS form_id_for(TEXT);
