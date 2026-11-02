"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_routes_1 = require("./auth.routes");
const microsoft_auth_routes_1 = require("./microsoft-auth.routes");
const password_reset_routes_1 = require("./password-reset.routes");
const health_routes_1 = require("./health.routes");
const sync_routes_1 = require("./sync.routes");
const assignments_routes_1 = require("./assignments.routes");
const notifications_routes_1 = require("./notifications.routes");
const countries_routes_1 = require("./countries.routes");
const crops_routes_1 = require("./crops.routes");
const ecph_routes_1 = require("./ecph.routes");
const field_types_routes_1 = require("./field-types.routes");
const farm_areas_routes_1 = require("./farm-areas.routes");
const fertigation_routes_1 = require("./fertigation.routes");
const fields_routes_1 = require("./fields.routes");
const harvests_routes_1 = require("./harvests.routes");
const recipes_routes_1 = require("./recipes.routes");
const satellite_routes_1 = require("./satellite.routes");
const sites_routes_1 = require("./sites.routes");
const seasons_routes_1 = require("./seasons.routes");
const weather_routes_1 = require("./weather.routes");
const weather_logs_routes_1 = require("./weather-logs.routes");
const analytics_routes_1 = require("./analytics.routes");
const users_routes_1 = require("./users.routes");
const fieldStaff_routes_1 = require("./fieldStaff.routes");
const audit_routes_1 = __importDefault(require("./audit.routes"));
const uploads_routes_1 = require("./uploads.routes");
const files_routes_1 = require("./files.routes");
const historicalImport_routes_1 = require("./historicalImport.routes");
const alerts_routes_1 = require("./alerts.routes");
const tasks_routes_1 = require("./tasks.routes");
const irrigation_routes_1 = require("./irrigation.routes");
const irrigationRecord_routes_1 = require("./irrigationRecord.routes");
const irrigationDrip_routes_1 = require("./irrigationDrip.routes");
const fertilizerApplication_routes_1 = require("./fertilizerApplication.routes");
const activity_routes_1 = require("./activity.routes");
const comments_routes_1 = require("./comments.routes");
const costs_routes_1 = require("./costs.routes");
const shifts_routes_1 = require("./shifts.routes");
const apikeys_routes_1 = require("./apikeys.routes");
const webhooks_routes_1 = require("./webhooks.routes");
const export_routes_1 = require("./export.routes");
const predictions_routes_1 = require("./predictions.routes");
const gps_routes_1 = require("./gps.routes");
const organization_routes_1 = require("./organization.routes");
const scouting_routes_1 = require("./scouting.routes");
const ipm_routes_1 = require("./ipm.routes");
const manpower_routes_1 = require("./manpower.routes");
const inventory_routes_1 = require("./inventory.routes");
const api_integrations_routes_1 = require("./api-integrations.routes");
const soil_sensor_routes_1 = require("./soil-sensor.routes");
const gis_routes_1 = require("./gis.routes");
const permissions_routes_1 = require("./permissions.routes");
const feature_flags_routes_1 = require("./feature-flags.routes");
const agronomic_routes_1 = require("./agronomic.routes");
const cropHistory_routes_1 = require("./cropHistory.routes");
const plantingRecord_routes_1 = require("./plantingRecord.routes");
const nurserySowingRecord_routes_1 = require("./nurserySowingRecord.routes");
const openFieldPlanting_routes_1 = require("./openFieldPlanting.routes");
const plantationWorkbook_routes_1 = require("./plantationWorkbook.routes");
const breeders_routes_1 = require("./breeders.routes");
const formTemplate_routes_1 = require("./formTemplate.routes");
const bioRecord_routes_1 = require("./bioRecord.routes");
const germinationRecord_routes_1 = require("./germinationRecord.routes");
const pumpRoom_routes_1 = require("./pumpRoom.routes");
const admin_routes_1 = require("./admin.routes");
const training_routes_1 = require("./training.routes");
const settings_routes_1 = require("./settings.routes");
const appSummary_routes_1 = require("./appSummary.routes");
const phiAuditLog_routes_1 = require("./phiAuditLog.routes");
const batchTrace_routes_1 = require("./batchTrace.routes");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// Health check - no auth required
router.use('/health', health_routes_1.healthRouter);
// Auth routes - no auth required
router.use('/auth', auth_routes_1.authRouter);
router.use('/auth/microsoft', microsoft_auth_routes_1.microsoftAuthRouter);
router.use('/auth/password', password_reset_routes_1.passwordResetRouter);
// Sync routes - requires auth (handled in router)
router.use('/sync', sync_routes_1.syncRouter);
// Assignments routes - requires auth (handled in router)
router.use('/assignments', assignments_routes_1.assignmentsRouter);
// Notifications routes - requires auth (handled in router)
router.use('/notifications', notifications_routes_1.notificationsRouter);
// User management - requires admin
router.use('/users', users_routes_1.usersRouter);
router.use('/field-staff', fieldStaff_routes_1.fieldStaffRouter);
// Master data routes: require auth and filter by user assignments (workers see only assigned areas)
router.use('/countries', auth_1.auth, countries_routes_1.countriesRouter);
router.use('/sites', auth_1.auth, sites_routes_1.sitesRouter);
router.use('/seasons', seasons_routes_1.seasonsRouter);
router.use('/farm-areas', auth_1.auth, farm_areas_routes_1.farmAreasRouter);
router.use('/fields', auth_1.auth, fields_routes_1.fieldsRouter);
router.use('/crops', auth_1.optionalAuth, crops_routes_1.cropsRouter);
router.use('/field-types', auth_1.optionalAuth, field_types_routes_1.fieldTypesRouter);
router.use('/harvests', auth_1.auth, harvests_routes_1.harvestsRouter);
router.use('/fertigation', auth_1.auth, fertigation_routes_1.fertigationRouter);
router.use('/ecph', auth_1.auth, ecph_routes_1.ecphRouter);
router.use('/recipes', auth_1.auth, recipes_routes_1.recipesRouter);
router.use('/weather', auth_1.optionalAuth, weather_routes_1.weatherRouter);
router.use('/weather-logs', auth_1.optionalAuth, weather_logs_routes_1.weatherLogsRouter);
router.use('/satellite', auth_1.optionalAuth, satellite_routes_1.satelliteRouter);
router.use('/analytics', auth_1.auth, analytics_routes_1.analyticsRouter);
// Audit log - requires manager role (handled in router)
router.use('/audit', audit_routes_1.default);
// File uploads - requires auth (handled in router)
router.use('/uploads', uploads_routes_1.uploadsRouter);
// File downloads (Postgres-backed blob adapter) - requires auth (handled in router)
router.use('/files', files_routes_1.filesRouter);
router.use('/imports', historicalImport_routes_1.historicalImportRouter);
// Alerts & notifications - requires auth (handled in router)
router.use('/alerts', alerts_routes_1.alertsRouter);
// Tasks - requires auth (handled in router)
router.use('/tasks', tasks_routes_1.tasksRouter);
// Irrigation advice - requires auth (handled in router)
router.use('/irrigation-advice', irrigation_routes_1.irrigationRouter);
// RC-133 pivot irrigation records - requires auth (handled in router)
router.use('/irrigation', irrigationRecord_routes_1.irrigationRecordRouter);
// RC-108 drip irrigation entries (nethouse / greenhouse)
router.use('/irrigation-drip', irrigationDrip_routes_1.irrigationDripRouter);
// RC-132 pivot fertilizer application records - requires auth (handled in router)
router.use('/fertilizer-applications', fertilizerApplication_routes_1.fertilizerApplicationRouter);
// Activity feed - requires auth (handled in router)
router.use('/activity', activity_routes_1.activityRouter);
// Entity comments - requires auth (handled in router)
router.use('/comments', comments_routes_1.commentsRouter);
// Cost analytics - requires auth (handled in router)
router.use('/costs', costs_routes_1.costsRouter);
// Shift scheduling - requires auth (handled in router)
router.use('/shifts', shifts_routes_1.shiftsRouter);
// API keys - requires auth and manager role (handled in router)
router.use('/api-keys', apikeys_routes_1.apiKeysRouter);
// Webhooks - requires auth and manager role (handled in router)
router.use('/webhooks', webhooks_routes_1.webhooksRouter);
// Data export - requires auth (handled in router)
router.use('/export', export_routes_1.exportRouter);
// Predictions & recommendations - requires auth (handled in router)
router.use('/predictions', predictions_routes_1.predictionsRouter);
// GPS tracking - requires auth (handled in router)
router.use('/gps', gps_routes_1.gpsRouter);
// Organization management - requires auth (handled in router)
router.use('/organization', organization_routes_1.organizationRouter);
// Scouting / Pest & Disease reports - auth handled in router
router.use('/scouting', scouting_routes_1.scoutingRouter);
// IPM Control - auth handled in router
router.use('/ipm', ipm_routes_1.ipmRouter);
// Manpower - mixed auth (worker auth + main auth) handled in router
router.use('/manpower', manpower_routes_1.manpowerRouter);
// Inventory - requires auth (handled in router)
router.use('/inventory', inventory_routes_1.inventoryRouter);
// API Integrations - requires auth (handled in router)
router.use('/api-integrations', api_integrations_routes_1.apiIntegrationsRouter);
// Soil sensor readings - requires auth (handled in router)
router.use('/soil-sensor', soil_sensor_routes_1.soilSensorRouter);
// GIS layers and features - requires auth (handled in router)
router.use('/gis', gis_routes_1.gisRouter);
// Permissions management - requires manager role (handled in router)
router.use('/permissions', permissions_routes_1.permissionsRouter);
// Feature flags - auth required (handled in router)
router.use('/feature-flags', feature_flags_routes_1.featureFlagsRouter);
// Agronomic reference - auth required (handled in router)
router.use('/agronomic', agronomic_routes_1.agronomicRouter);
// Crop history / rotation management
router.use('/crop-history', cropHistory_routes_1.cropHistoryRouter);
// Planting & transplant records
router.use('/planting-records', plantingRecord_routes_1.plantingRecordRouter);
router.use('/nursery-sowing-records', nurserySowingRecord_routes_1.nurserySowingRecordRouter);
// Open field planting records
router.use('/open-field-planting', openFieldPlanting_routes_1.openFieldPlantingRouter);
router.use('/plantation-workbook', plantationWorkbook_routes_1.plantationWorkbookRouter);
// Breeders / seed companies
router.use('/breeders', breeders_routes_1.breedersRouter);
// Form templates — per-site template management
router.use('/form-templates', formTemplate_routes_1.formTemplateRouter);
// Biological control weekly records (spreadsheet-style)
router.use('/bio-records', bioRecord_routes_1.bioRecordRouter);
// Germination records - seed germination percentage tracking
router.use('/germination', germinationRecord_routes_1.germinationRecordRouter);
// Pump room - electricity and water usage tracking
router.use('/pump-room', pumpRoom_routes_1.pumpRoomRouter);
// Admin / ops actions (backup trigger, etc.) - ceo-only (handled in router)
router.use('/admin', admin_routes_1.adminRouter);
// Internship training LMS - auth handled in router
router.use('/training', training_routes_1.trainingRouter);
// System settings (AI config, etc.) - admin only (handled in router)
router.use('/settings', settings_routes_1.settingsRouter);
// Summary & Contents — prototype overview for managers (auth in router)
router.use('/app-summary', appSummary_routes_1.appSummaryRouter);
// PHI Audit Log — harvest-during-PHI conflict detection (auth in router)
router.use('/phi-audit-log', phiAuditLog_routes_1.phiAuditLogRouter);
// Batch traceability — lookup harvest chain by batch number (auth in router)
router.use('/batch-trace', batchTrace_routes_1.batchTraceRouter);
exports.default = router;
