"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.organizationRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const tenant_1 = require("../middleware/tenant");
const asyncHandler_1 = require("../../utils/asyncHandler");
const organization_service_1 = require("../../services/organization.service");
const organizationRouter = (0, express_1.Router)();
exports.organizationRouter = organizationRouter;
organizationRouter.use(auth_1.auth);
/** GET /organization - current user's organization */
organizationRouter.get('/', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const orgId = (0, tenant_1.requireOrgId)(req);
    const org = await (0, organization_service_1.getOrganizationById)(orgId);
    res.json({ success: true, data: org });
}));
/** PUT /organization - update organization (CEO only) */
organizationRouter.put('/', (0, auth_1.authorize)('ceo'), (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const orgId = (0, tenant_1.requireOrgId)(req);
    const { name, settings } = req.body;
    const org = await (0, organization_service_1.updateOrganization)(orgId, { name, settings });
    res.json({ success: true, data: org });
}));
/** GET /organization/members - org members only */
organizationRouter.get('/members', (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const orgId = (0, tenant_1.requireOrgId)(req);
    const members = await (0, organization_service_1.listOrganizationMembers)(orgId);
    res.json({ success: true, data: members });
}));
