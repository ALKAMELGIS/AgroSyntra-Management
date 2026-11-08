import { Router } from 'express';
import { authRouter } from './auth.routes';
import { microsoftAuthRouter } from './microsoft-auth.routes';
import { passwordResetRouter } from './password-reset.routes';
import { healthRouter } from './health.routes';
import { syncRouter } from './sync.routes';
import { assignmentsRouter } from './assignments.routes';
import { notificationsRouter } from './notifications.routes';
import { countriesRouter } from './countries.routes';
import { cropsRouter } from './crops.routes';
import { ecphRouter } from './ecph.routes';
import { fieldTypesRouter } from './field-types.routes';
import { farmAreasRouter } from './farm-areas.routes';
import { fertigationRouter } from './fertigation.routes';
import { fieldsRouter } from './fields.routes';
import { harvestsRouter } from './harvests.routes';
import { recipesRouter } from './recipes.routes';
import { satelliteRouter } from './satellite.routes';
import { soilGridsRouter } from './soil-grids.routes';
import { sitesRouter } from './sites.routes';
import { seasonsRouter } from './seasons.routes';
import { weatherRouter } from './weather.routes';
import { weatherLogsRouter } from './weather-logs.routes';
import { analyticsRouter } from './analytics.routes';
import { usersRouter } from './users.routes';
import { fieldStaffRouter } from './fieldStaff.routes';
import auditRouter from './audit.routes';
import { uploadsRouter } from './uploads.routes';
import { filesRouter } from './files.routes';
import { historicalImportRouter } from './historicalImport.routes';
import { alertsRouter } from './alerts.routes';
import { tasksRouter } from './tasks.routes';
import { irrigationRouter } from './irrigation.routes';
import { irrigationRecordRouter } from './irrigationRecord.routes';
import { irrigationDripRouter } from './irrigationDrip.routes';
import { fertilizerApplicationRouter } from './fertilizerApplication.routes';
import { activityRouter } from './activity.routes';
import { commentsRouter } from './comments.routes';
import { costsRouter } from './costs.routes';
import { shiftsRouter } from './shifts.routes';
import { apiKeysRouter } from './apikeys.routes';
import { webhooksRouter } from './webhooks.routes';
import { exportRouter } from './export.routes';
import { predictionsRouter } from './predictions.routes';
import { gpsRouter } from './gps.routes';
import { organizationRouter } from './organization.routes';
import { scoutingRouter } from './scouting.routes';
import { ipmRouter } from './ipm.routes';
import { manpowerRouter } from './manpower.routes';
import { manpowerCostRouter } from './manpowerCost.routes';
import { inventoryRouter } from './inventory.routes';
import { apiIntegrationsRouter } from './api-integrations.routes';
import { johnDeereRouter } from './johnDeere.routes';
import { formsRouter } from './forms.routes';
import { aiRouter } from './ai.routes';
import { soilSensorRouter } from './soil-sensor.routes';
import { gisRouter } from './gis.routes';
import { permissionsRouter } from './permissions.routes';
import { featureFlagsRouter } from './feature-flags.routes';
import { agronomicRouter } from './agronomic.routes';
import { cropHistoryRouter } from './cropHistory.routes';
import { plantingRecordRouter } from './plantingRecord.routes';
import { nurserySowingRecordRouter } from './nurserySowingRecord.routes';
import { openFieldPlantingRouter } from './openFieldPlanting.routes';
import { plantationWorkbookRouter } from './plantationWorkbook.routes';
import { breedersRouter } from './breeders.routes';
import { formTemplateRouter } from './formTemplate.routes';
import { bioRecordRouter } from './bioRecord.routes';
import { germinationRecordRouter } from './germinationRecord.routes';
import { pumpRoomRouter } from './pumpRoom.routes';
import { adminRouter } from './admin.routes';
import { trainingRouter } from './training.routes';
import { settingsRouter } from './settings.routes';
import { appSummaryRouter } from './appSummary.routes';
import { phiAuditLogRouter } from './phiAuditLog.routes';
import { batchTraceRouter } from './batchTrace.routes';
import { auth, optionalAuth } from '../middleware/auth';

const router = Router();

// Health check - no auth required
router.use('/health', healthRouter);

// Auth routes - no auth required
router.use('/auth', authRouter);
router.use('/auth/microsoft', microsoftAuthRouter);
router.use('/auth/password', passwordResetRouter);

// Sync routes - requires auth (handled in router)
router.use('/sync', syncRouter);

// Assignments routes - requires auth (handled in router)
router.use('/assignments', assignmentsRouter);

// Notifications routes - requires auth (handled in router)
router.use('/notifications', notificationsRouter);

// User management - requires admin
router.use('/users', usersRouter);
router.use('/field-staff', fieldStaffRouter);

// Master data routes: require auth and filter by user assignments (workers see only assigned areas)
router.use('/countries', auth, countriesRouter);
router.use('/sites', auth, sitesRouter);
router.use('/seasons', seasonsRouter);
router.use('/farm-areas', auth, farmAreasRouter);
router.use('/fields', auth, fieldsRouter);
router.use('/crops', cropsRouter);
// Field types - requires auth; writes limited to farm manager / OM / worker (handled in router)
router.use('/field-types', fieldTypesRouter);
router.use('/harvests', auth, harvestsRouter);
router.use('/fertigation', auth, fertigationRouter);
router.use('/ecph', auth, ecphRouter);
router.use('/recipes', auth, recipesRouter);
router.use('/weather', optionalAuth, weatherRouter);
// Weather logs - requires auth; writes limited to worker / operation manager (handled in router)
router.use('/weather-logs', weatherLogsRouter);
router.use('/satellite', optionalAuth, satelliteRouter);
router.use('/soil-grids', auth, soilGridsRouter);
router.use('/analytics', auth, analyticsRouter);

// Audit log - requires manager role (handled in router)
router.use('/audit', auditRouter);

// File uploads - requires auth (handled in router)
router.use('/uploads', uploadsRouter);

// File downloads (Postgres-backed blob adapter) - requires auth (handled in router)
router.use('/files', filesRouter);
router.use('/imports', historicalImportRouter);

// Alerts & notifications - requires auth (handled in router)
router.use('/alerts', alertsRouter);

// Tasks - requires auth (handled in router)
router.use('/tasks', tasksRouter);

// Irrigation advice - requires auth (handled in router)
router.use('/irrigation-advice', irrigationRouter);

// RC-133 pivot irrigation records - requires auth (handled in router)
router.use('/irrigation', irrigationRecordRouter);

// RC-108 drip irrigation entries (nethouse / greenhouse)
router.use('/irrigation-drip', irrigationDripRouter);

// RC-132 pivot fertilizer application records - requires auth (handled in router)
router.use('/fertilizer-applications', fertilizerApplicationRouter);

// Activity feed - requires auth (handled in router)
router.use('/activity', activityRouter);

// Entity comments - requires auth (handled in router)
router.use('/comments', commentsRouter);

// Cost analytics - requires auth (handled in router)
router.use('/costs', costsRouter);

// Shift scheduling - requires auth (handled in router)
router.use('/shifts', shiftsRouter);

// API keys - requires auth and manager role (handled in router)
router.use('/api-keys', apiKeysRouter);

// Webhooks - requires auth and manager role (handled in router)
router.use('/webhooks', webhooksRouter);

// Data export - requires auth (handled in router)
router.use('/export', exportRouter);

// Predictions & recommendations - requires auth (handled in router)
router.use('/predictions', predictionsRouter);

// GPS tracking - requires auth (handled in router)
router.use('/gps', gpsRouter);

// Organization management - requires auth (handled in router)
router.use('/organization', organizationRouter);

// Scouting / Pest & Disease reports - auth handled in router
router.use('/scouting', scoutingRouter);

// IPM Control - auth handled in router
router.use('/ipm', ipmRouter);

// Manpower - mixed auth (worker auth + main auth) handled in router
router.use('/manpower', manpowerRouter);

// Manpower cost — hourly rates and approved-hours cost (auth in router)
router.use('/manpower-cost', manpowerCostRouter);

// Inventory - requires auth (handled in router)
router.use('/inventory', inventoryRouter);

// API Integrations - requires auth (handled in router)
router.use('/api-integrations', apiIntegrationsRouter);
router.use('/integrations/john-deere', johnDeereRouter);
router.use('/forms', formsRouter);
router.use('/ai', aiRouter);

// Soil sensor readings - requires auth (handled in router)
router.use('/soil-sensor', soilSensorRouter);

// GIS layers and features - requires auth (handled in router)
router.use('/gis', gisRouter);

// Permissions management - requires manager role (handled in router)
router.use('/permissions', permissionsRouter);

// Feature flags - auth required (handled in router)
router.use('/feature-flags', featureFlagsRouter);

// Agronomic reference - auth required (handled in router)
router.use('/agronomic', agronomicRouter);

// Crop history / rotation management
router.use('/crop-history', cropHistoryRouter);

// Planting & transplant records
router.use('/planting-records', plantingRecordRouter);

router.use('/nursery-sowing-records', nurserySowingRecordRouter);

// Open field planting records
router.use('/open-field-planting', openFieldPlantingRouter);
router.use('/plantation-workbook', plantationWorkbookRouter);

// Breeders / seed companies
router.use('/breeders', breedersRouter);

// Form templates — per-site template management
router.use('/form-templates', formTemplateRouter);

// Biological control weekly records (spreadsheet-style)
router.use('/bio-records', bioRecordRouter);

// Germination records - seed germination percentage tracking
router.use('/germination', germinationRecordRouter);

// Pump room - electricity and water usage tracking
router.use('/pump-room', pumpRoomRouter);

// Admin / ops actions (backup trigger, etc.) - ceo-only (handled in router)
router.use('/admin', adminRouter);

// Internship training LMS - auth handled in router
router.use('/training', trainingRouter);

// System settings (AI config, etc.) - admin only (handled in router)
router.use('/settings', settingsRouter);

// Summary & Contents — prototype overview for managers (auth in router)
router.use('/app-summary', appSummaryRouter);

// PHI Audit Log — harvest-during-PHI conflict detection (auth in router)
router.use('/phi-audit-log', phiAuditLogRouter);

// Batch traceability — lookup harvest chain by batch number (auth in router)
router.use('/batch-trace', batchTraceRouter);

export default router;
