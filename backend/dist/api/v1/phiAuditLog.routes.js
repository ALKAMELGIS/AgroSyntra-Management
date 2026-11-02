"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.phiAuditLogRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const phiAuditLog_service_1 = require("../../services/phiAuditLog.service");
const tenant_1 = require("../middleware/tenant");
exports.phiAuditLogRouter = (0, express_1.Router)();
exports.phiAuditLogRouter.use(auth_1.auth);
exports.phiAuditLogRouter.get('/unreviewed-count', async (req, res, next) => {
    try {
        const siteId = req.query.siteId;
        const counts = await (0, phiAuditLog_service_1.getPhiConflictCounts)((0, tenant_1.requireOrgId)(req), siteId);
        const badgeCount = (0, phiAuditLog_service_1.badgeCountForRole)(req.user?.role, counts);
        res.json({ success: true, data: { ...counts, badgeCount } });
    }
    catch (error) {
        next(error);
    }
});
exports.phiAuditLogRouter.get('/', async (req, res, next) => {
    try {
        const { siteId, fieldId, dateFrom, dateTo, status, severity } = req.query;
        const data = await (0, phiAuditLog_service_1.getPhiConflicts)({
            organizationId: (0, tenant_1.requireOrgId)(req),
            siteId,
            fieldId,
            dateFrom,
            dateTo,
            status,
            severity,
        });
        const filtered = data.filter((row) => {
            if (status && status !== 'all' && row.status !== status)
                return false;
            if (severity && severity !== 'all' && row.severity !== severity)
                return false;
            return true;
        });
        res.json({ success: true, data: filtered });
    }
    catch (error) {
        next(error);
    }
});
exports.phiAuditLogRouter.put('/:id/acknowledge', auth_1.requirePhiAuditReviewer, async (req, res, next) => {
    try {
        const { id } = req.params;
        const [harvestId, applicationId] = id.split(':');
        if (!harvestId || !applicationId) {
            return res.status(400).json({ success: false, message: 'Invalid conflict ID format' });
        }
        const { status, notes } = req.body;
        if (!status || !['acknowledged', 'justified'].includes(status)) {
            return res.status(400).json({ success: false, message: 'status must be acknowledged or justified' });
        }
        await (0, phiAuditLog_service_1.acknowledgeConflict)(harvestId, applicationId, req.user.userId, req.user.role, status, notes);
        res.json({ success: true });
    }
    catch (error) {
        next(error);
    }
});
