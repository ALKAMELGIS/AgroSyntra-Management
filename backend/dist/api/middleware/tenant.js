"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrgId = getOrgId;
exports.requireOrgId = requireOrgId;
exports.tenantMiddleware = tenantMiddleware;
const errors_1 = require("../../utils/errors");
const superAdmin_1 = require("../../utils/superAdmin");
const organization_service_1 = require("../../services/organization.service");
const logger_1 = require("../../utils/logger");
const ACT_AS_ORG_HEADER = 'x-act-as-organization';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function getOrgId(req) {
    return req.organizationId || req.user?.organizationId || null;
}
function requireOrgId(req) {
    const orgId = getOrgId(req);
    if (!orgId) {
        throw new errors_1.AppError('Organization membership required', 'FORBIDDEN', 403);
    }
    return orgId;
}
/**

 * Attach organization context after auth. JWT claim is preferred; DB is fallback

 * for legacy tokens. Super-admins may act-as another org via X-Act-As-Organization.

 */
async function tenantMiddleware(req, res, next) {
    try {
        if (!req.user) {
            next();
            return;
        }
        if ((0, superAdmin_1.isSuperAdminEmail)(req.user.email)) {
            req.isSuperAdmin = true;
        }
        const actAsHeader = req.headers[ACT_AS_ORG_HEADER];
        const actAsOrgId = typeof actAsHeader === 'string' ? actAsHeader.trim() : null;
        if (actAsOrgId) {
            if (!req.isSuperAdmin) {
                next(new errors_1.AppError('Super admin access required', 'FORBIDDEN', 403));
                return;
            }
            if (!UUID_REGEX.test(actAsOrgId)) {
                next(new errors_1.AppError('Invalid organization id', 'VALIDATION_ERROR', 400));
                return;
            }
            await (0, organization_service_1.getOrganizationById)(actAsOrgId);
            req.organizationId = actAsOrgId;
            req.user.organizationId = actAsOrgId;
            req.isActingAsOrg = true;
            logger_1.logger.info({ userId: req.user.userId, email: req.user.email, actAsOrgId }, 'Super admin acting as organization');
            next();
            return;
        }
        let orgId = req.user.organizationId ?? null;
        if (!orgId) {
            orgId = await (0, organization_service_1.getUserOrganizationId)(req.user.userId);
        }
        if (orgId) {
            req.organizationId = orgId;
            req.user.organizationId = orgId;
            next();
            return;
        }
        if (req.isSuperAdmin) {
            next();
            return;
        }
        next(new errors_1.AppError('Organization membership required', 'FORBIDDEN', 403));
    }
    catch (error) {
        next(error);
    }
}
