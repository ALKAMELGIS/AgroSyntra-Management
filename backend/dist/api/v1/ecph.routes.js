"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ecphRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const ecph_service_1 = require("../../services/ecph.service");
const assignment_repository_1 = require("../../repositories/assignment.repository");
const validate_1 = require("../middleware/validate");
const tenant_1 = require("../middleware/tenant");
const errors_1 = require("../../utils/errors");
const client_1 = require("../../db/client");
const roleAccess_1 = require("../../utils/roleAccess");
const websocket_1 = require("../../websocket");
const anomalyDetection_service_1 = require("../../services/anomalyDetection.service");
const alertEngine_service_1 = require("../../services/alertEngine.service");
exports.ecphRouter = (0, express_1.Router)();
const service = new ecph_service_1.EcphService();
const assignmentRepo = new assignment_repository_1.AssignmentRepository();
const idSchema = zod_1.z.object({ id: zod_1.z.string().uuid() });
const listQuerySchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().positive().optional(),
    limit: zod_1.z.coerce.number().int().positive().optional(),
    field_id: zod_1.z.string().uuid().optional(),
    site_id: zod_1.z.string().uuid().optional(),
    start_date: zod_1.z.string().optional(),
    end_date: zod_1.z.string().optional(),
    template_id: zod_1.z.string().uuid().optional(),
});
const valveReadingSchema = zod_1.z.object({
    valveNumber: zod_1.z.number().int().positive(),
    dripVolume: zod_1.z.number().optional(),
    ecIn: zod_1.z.number().optional(),
    ec: zod_1.z.number().optional(),
    phIn: zod_1.z.number().optional(),
    ph: zod_1.z.number().optional(),
    drain: zod_1.z.number().optional(),
    percentDrain: zod_1.z.number().optional(),
    totalWaterBasedOnDrip: zod_1.z.number().optional(),
    qtyOfWater: zod_1.z.number().optional(),
    cycle: zod_1.z.number().int().optional(),
    totalWaterQty: zod_1.z.number().optional(),
});
const createSchema = zod_1.z.object({
    fieldId: zod_1.z.string().uuid(),
    date: zod_1.z.string().min(1),
    time: zod_1.z.string().optional(),
    qtyOfWater: zod_1.z.number().optional(),
    cycle: zod_1.z.number().int().optional(),
    totalWaterQty: zod_1.z.number().optional(),
    fieldTotalWaterBasedOnDrip: zod_1.z.number().optional(),
    dripperCount: zod_1.z.number().int().optional(),
    templateId: zod_1.z.string().uuid().optional(),
    valveReadings: zod_1.z.array(valveReadingSchema).optional(),
});
const updateSchema = createSchema.partial().omit({ fieldId: true });
exports.ecphRouter.get('/', (0, validate_1.validate)({ query: listQuerySchema }), async (req, res, next) => {
    try {
        const { page, limit, field_id, site_id, start_date, end_date, template_id } = req.query;
        const result = await service.list({
            page,
            limit,
            fieldId: field_id,
            siteId: site_id,
            startDate: start_date,
            endDate: end_date,
            templateId: template_id,
            organizationId: (0, tenant_1.requireOrgId)(req),
        });
        res.json({ success: true, data: result.items, meta: result.meta });
    }
    catch (error) {
        next(error);
    }
});
exports.ecphRouter.get('/:id', (0, validate_1.validate)({ params: idSchema }), async (req, res, next) => {
    try {
        const entry = await service.getById(req.params.id);
        res.json({ success: true, data: entry });
    }
    catch (error) {
        next(error);
    }
});
exports.ecphRouter.post('/bulk', async (req, res, next) => {
    try {
        (0, roleAccess_1.assertCanOperateDataEntry)(req.user);
        const entries = req.body?.entries;
        if (!Array.isArray(entries) || entries.length === 0) {
            throw new errors_1.AppError('entries array is required', 'VALIDATION_ERROR', 400);
        }
        const results = { inserted: 0, skipped: 0, errors: [] };
        for (let i = 0; i < entries.length; i++) {
            try {
                const parsed = createSchema.parse(entries[i]);
                const existing = await client_1.dbPool.query(`SELECT id FROM ecph_entries
           WHERE field_id = $1 AND date = $2
             AND time IS NOT DISTINCT FROM $3::time
           LIMIT 1`, [parsed.fieldId, parsed.date, parsed.time || null]);
                if (existing.rowCount && existing.rowCount > 0) {
                    results.skipped++;
                    continue;
                }
                await service.create(parsed);
                results.inserted++;
            }
            catch (err) {
                results.errors.push(`Entry ${i + 1}: ${err.message || 'Unknown error'}`);
            }
        }
        (0, websocket_1.emitDataChange)('ecph', 'create', { bulk: true, count: results.inserted });
        res.status(201).json({ success: true, data: results });
    }
    catch (error) {
        next(error);
    }
});
exports.ecphRouter.post('/', (0, validate_1.validate)({ body: createSchema }), async (req, res, next) => {
    try {
        (0, roleAccess_1.assertCanOperateDataEntry)(req.user);
        const user = req.user;
        if (user.role !== 'ceo') {
            const canAccess = await assignmentRepo.canUserAccessField(user.userId, user.role, req.body.fieldId, (0, tenant_1.requireOrgId)(req));
            if (!canAccess)
                throw new errors_1.AppError('You do not have access to this field', 'FORBIDDEN', 403);
        }
        const entry = await service.create(req.body);
        (0, websocket_1.emitDataChange)('ecph', 'create', entry);
        // Run anomaly detection + rule-based alerts on the new reading
        if (entry.valveReadings?.length) {
            const avgEc = entry.valveReadings.reduce((s, r) => s + (r.ec || 0), 0) / entry.valveReadings.length;
            const avgPh = entry.valveReadings.reduce((s, r) => s + (r.ph || 0), 0) / entry.valveReadings.length;
            const avgDrain = entry.valveReadings.reduce((s, r) => s + (r.percent_drain || 0), 0) / entry.valveReadings.length;
            (0, anomalyDetection_service_1.checkForAnomalies)(req.body.fieldId, entry.id, { ec: avgEc, ph: avgPh, percent_drain: avgDrain }).catch(() => { });
            (0, alertEngine_service_1.evaluateAlerts)('ecph_reading', entry.id, req.body.fieldId, { ec: avgEc, ph: avgPh, percent_drain: avgDrain }).catch(() => { });
        }
        res.status(201).json({ success: true, data: entry });
    }
    catch (error) {
        next(error);
    }
});
exports.ecphRouter.put('/:id', (0, validate_1.validate)({ params: idSchema, body: updateSchema }), async (req, res, next) => {
    try {
        (0, roleAccess_1.assertCanOperateDataEntry)(req.user);
        const entry = await service.update(req.params.id, req.body);
        (0, websocket_1.emitDataChange)('ecph', 'update', entry);
        res.json({ success: true, data: entry });
    }
    catch (error) {
        next(error);
    }
});
exports.ecphRouter.delete('/:id', (0, validate_1.validate)({ params: idSchema }), async (req, res, next) => {
    try {
        (0, roleAccess_1.assertCanOperateDataEntry)(req.user);
        await service.remove(req.params.id);
        (0, websocket_1.emitDataChange)('ecph', 'delete', { id: req.params.id });
        res.json({ success: true, data: { deleted: true } });
    }
    catch (error) {
        next(error);
    }
});
