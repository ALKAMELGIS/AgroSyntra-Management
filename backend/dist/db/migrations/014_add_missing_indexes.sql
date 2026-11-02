-- Migration 014: Add missing database indexes for performance
-- These indexes cover foreign key columns and common query patterns

-- Master data relationships
CREATE INDEX IF NOT EXISTS idx_sites_country_id ON sites(country_id);
CREATE INDEX IF NOT EXISTS idx_farm_areas_site_id ON farm_areas(site_id);
CREATE INDEX IF NOT EXISTS idx_fields_current_crop ON fields(current_crop_id);
CREATE INDEX IF NOT EXISTS idx_fields_farm_area ON fields(farm_area_id);

-- Soft-delete optimization
CREATE INDEX IF NOT EXISTS idx_fields_deleted_at ON fields(deleted_at) WHERE deleted_at IS NOT NULL;

-- Recipe relationships
CREATE INDEX IF NOT EXISTS idx_recipe_fertilizers_recipe ON recipe_fertilizers(recipe_id);

-- Harvest data
CREATE INDEX IF NOT EXISTS idx_harvest_varieties_harvest ON harvest_varieties(harvest_id);

-- Farm area crops many-to-many
CREATE INDEX IF NOT EXISTS idx_farm_area_crops_farm_area ON farm_area_crops(farm_area_id);
CREATE INDEX IF NOT EXISTS idx_farm_area_crops_crop ON farm_area_crops(crop_id);

-- Crop history time-range queries
CREATE INDEX IF NOT EXISTS idx_crop_history_field ON crop_history(field_id);
CREATE INDEX IF NOT EXISTS idx_crop_history_dates ON crop_history(start_date, end_date);

-- Token expiry cleanup
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires ON password_reset_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_email_verifications_expires ON email_verifications(expires_at);

-- Weather logs
CREATE INDEX IF NOT EXISTS idx_weather_logs_country ON weather_logs(country_id);
CREATE INDEX IF NOT EXISTS idx_weather_logs_date ON weather_logs(date);

-- Scheduled reports
CREATE INDEX IF NOT EXISTS idx_scheduled_reports_creator ON scheduled_reports(created_by);

-- Tasks
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date) WHERE due_date IS NOT NULL;

-- Task comments and checklists
CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_checklists_task ON task_checklists(task_id);

-- Alert events
CREATE INDEX IF NOT EXISTS idx_alert_events_entity ON alert_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_alert_events_created ON alert_events(created_at);

-- User notifications
CREATE INDEX IF NOT EXISTS idx_user_notifications_user_read ON user_notifications(user_id, is_read);
