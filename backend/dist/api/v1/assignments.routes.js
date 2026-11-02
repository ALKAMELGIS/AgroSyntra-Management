"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assignmentsRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const assignment_repository_1 = require("../../repositories/assignment.repository");
const user_repository_1 = require("../../repositories/user.repository");
const validate_1 = require("../middleware/validate");
const auth_1 = require("../middleware/auth");
const tenant_1 = require("../middleware/tenant");
const errors_1 = require("../../utils/errors");
const user_model_1 = require("../../models/user.model");
const auditLog_service_1 = require("../../services/auditLog.service");
exports.assignmentsRouter = (0, express_1.Router)();
const assignmentRepo = new assignment_repository_1.AssignmentRepository();
const userRepo = new user_repository_1.UserRepository();
// All routes require authentication
exports.assignmentsRouter.use(auth_1.auth);
// ============ Site Assignments ============
// Get users assigned to a site
exports.assignmentsRouter.get('/sites/:siteId/users', async (req, res, next) => {
    try {
        const { siteId } = req.params;
        const currentUser = req.user;
        // Check if user can view this site
        const canAccess = await assignmentRepo.canUserAccessSite(currentUser.userId, currentUser.role, siteId, (0, tenant_1.requireOrgId)(req));
        if (!canAccess && currentUser.role !== 'ceo') {
            throw new errors_1.AppError('You do not have access to this site', 'FORBIDDEN', 403);
        }
        const users = await assignmentRepo.getSiteUsers(siteId);
        res.json({ success: true, data: users });
    }
    catch (error) {
        next(error);
    }
});
// Assign user to site (CEO or Farm Manager only)
const assignToSiteSchema = zod_1.z.object({
    userId: zod_1.z.string().uuid(),
});
exports.assignmentsRouter.post('/sites/:siteId/users', (0, validate_1.validate)({ body: assignToSiteSchema }), async (req, res, next) => {
    try {
        const { siteId } = req.params;
        const { userId } = req.body;
        const currentUser = req.user;
        // Only CEO can assign to any site, Farm Manager can assign to their sites
        if (currentUser.role !== 'ceo') {
            const canAccess = await assignmentRepo.canUserAccessSite(currentUser.userId, currentUser.role, siteId, (0, tenant_1.requireOrgId)(req));
            if (!canAccess) {
                throw new errors_1.AppError('You do not have access to this site', 'FORBIDDEN', 403);
            }
        }
        // Check if current user can assign the target user's role
        const targetUser = await userRepo.findById(userId);
        if (!targetUser) {
            throw new errors_1.AppError('User not found', 'NOT_FOUND', 404);
        }
        const assignableRoles = user_model_1.ASSIGNABLE_ROLES[currentUser.role] || [];
        if (!assignableRoles.includes(targetUser.role)) {
            throw new errors_1.AppError(`You cannot assign users with role '${targetUser.role}'`, 'FORBIDDEN', 403);
        }
        const assignment = await assignmentRepo.assignUserToSite(userId, siteId, currentUser.userId);
        await (0, auditLog_service_1.logAuditEvent)({
            userId: currentUser.userId,
            action: 'CREATE',
            entity: 'assignment',
            entityId: userId,
            changes: { scope: 'site', siteId, assignedUserId: userId },
            metadata: { targetEmail: targetUser.email, targetRole: targetUser.role },
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
        });
        res.status(201).json({ success: true, data: assignment });
    }
    catch (error) {
        next(error);
    }
});
// Remove user from site
exports.assignmentsRouter.delete('/sites/:siteId/users/:userId', async (req, res, next) => {
    try {
        const { siteId, userId } = req.params;
        const currentUser = req.user;
        // Only CEO can remove from any site, Farm Manager can remove from their sites
        if (currentUser.role !== 'ceo') {
            const canAccess = await assignmentRepo.canUserAccessSite(currentUser.userId, currentUser.role, siteId, (0, tenant_1.requireOrgId)(req));
            if (!canAccess) {
                throw new errors_1.AppError('You do not have access to this site', 'FORBIDDEN', 403);
            }
        }
        await assignmentRepo.removeUserFromSite(userId, siteId);
        await (0, auditLog_service_1.logAuditEvent)({
            userId: currentUser.userId,
            action: 'DELETE',
            entity: 'assignment',
            entityId: userId,
            changes: { scope: 'site', siteId, unassignedUserId: userId },
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
        });
        res.json({ success: true, data: { message: 'User removed from site' } });
    }
    catch (error) {
        next(error);
    }
});
// ============ Farm Area Assignments ============
// Assign user to farm area
const assignToFarmAreaSchema = zod_1.z.object({
    userId: zod_1.z.string().uuid(),
});
exports.assignmentsRouter.post('/farm-areas/:farmAreaId/users', (0, validate_1.validate)({ body: assignToFarmAreaSchema }), async (req, res, next) => {
    try {
        const { farmAreaId } = req.params;
        const { userId } = req.body;
        const currentUser = req.user;
        // Check access to farm area
        if (currentUser.role !== 'ceo') {
            const canAccess = await assignmentRepo.canUserAccessFarmArea(currentUser.userId, currentUser.role, farmAreaId, (0, tenant_1.requireOrgId)(req));
            if (!canAccess) {
                throw new errors_1.AppError('You do not have access to this farm area', 'FORBIDDEN', 403);
            }
        }
        // Check role hierarchy
        const targetUser = await userRepo.findById(userId);
        if (!targetUser) {
            throw new errors_1.AppError('User not found', 'NOT_FOUND', 404);
        }
        const assignableRoles = user_model_1.ASSIGNABLE_ROLES[currentUser.role] || [];
        if (!assignableRoles.includes(targetUser.role)) {
            throw new errors_1.AppError(`You cannot assign users with role '${targetUser.role}'`, 'FORBIDDEN', 403);
        }
        const assignment = await assignmentRepo.assignUserToFarmArea(userId, farmAreaId, currentUser.userId);
        res.status(201).json({ success: true, data: assignment });
    }
    catch (error) {
        next(error);
    }
});
// Remove user from farm area
exports.assignmentsRouter.delete('/farm-areas/:farmAreaId/users/:userId', async (req, res, next) => {
    try {
        const { farmAreaId, userId } = req.params;
        const currentUser = req.user;
        if (currentUser.role !== 'ceo') {
            const canAccess = await assignmentRepo.canUserAccessFarmArea(currentUser.userId, currentUser.role, farmAreaId, (0, tenant_1.requireOrgId)(req));
            if (!canAccess) {
                throw new errors_1.AppError('You do not have access to this farm area', 'FORBIDDEN', 403);
            }
        }
        await assignmentRepo.removeUserFromFarmArea(userId, farmAreaId);
        res.json({ success: true, data: { message: 'User removed from farm area' } });
    }
    catch (error) {
        next(error);
    }
});
// ============ Field Assignments ============
// Assign user to field
const assignToFieldSchema = zod_1.z.object({
    userId: zod_1.z.string().uuid(),
});
exports.assignmentsRouter.post('/fields/:fieldId/users', (0, validate_1.validate)({ body: assignToFieldSchema }), async (req, res, next) => {
    try {
        const { fieldId } = req.params;
        const { userId } = req.body;
        const currentUser = req.user;
        // Check access to field
        if (currentUser.role !== 'ceo') {
            const canAccess = await assignmentRepo.canUserAccessField(currentUser.userId, currentUser.role, fieldId, (0, tenant_1.requireOrgId)(req));
            if (!canAccess) {
                throw new errors_1.AppError('You do not have access to this field', 'FORBIDDEN', 403);
            }
        }
        // Check role hierarchy
        const targetUser = await userRepo.findById(userId);
        if (!targetUser) {
            throw new errors_1.AppError('User not found', 'NOT_FOUND', 404);
        }
        const assignableRoles = user_model_1.ASSIGNABLE_ROLES[currentUser.role] || [];
        if (!assignableRoles.includes(targetUser.role)) {
            throw new errors_1.AppError(`You cannot assign users with role '${targetUser.role}'`, 'FORBIDDEN', 403);
        }
        const assignment = await assignmentRepo.assignUserToField(userId, fieldId, currentUser.userId);
        res.status(201).json({ success: true, data: assignment });
    }
    catch (error) {
        next(error);
    }
});
// Remove user from field
exports.assignmentsRouter.delete('/fields/:fieldId/users/:userId', async (req, res, next) => {
    try {
        const { fieldId, userId } = req.params;
        const currentUser = req.user;
        if (currentUser.role !== 'ceo') {
            const canAccess = await assignmentRepo.canUserAccessField(currentUser.userId, currentUser.role, fieldId, (0, tenant_1.requireOrgId)(req));
            if (!canAccess) {
                throw new errors_1.AppError('You do not have access to this field', 'FORBIDDEN', 403);
            }
        }
        await assignmentRepo.removeUserFromField(userId, fieldId);
        res.json({ success: true, data: { message: 'User removed from field' } });
    }
    catch (error) {
        next(error);
    }
});
// ============ Get Current User's Assignments ============
exports.assignmentsRouter.get('/my-assignments', async (req, res, next) => {
    try {
        const currentUser = req.user;
        const [sites, farmAreas, fields] = await Promise.all([
            assignmentRepo.getUserSiteAssignments(currentUser.userId),
            assignmentRepo.getUserFarmAreaAssignments(currentUser.userId),
            assignmentRepo.getUserFieldAssignments(currentUser.userId),
        ]);
        res.json({
            success: true,
            data: {
                role: currentUser.role,
                sites,
                farmAreas,
                fields,
            },
        });
    }
    catch (error) {
        next(error);
    }
});
// Get user's accessible resources (for filtering dropdowns)
exports.assignmentsRouter.get('/my-access', async (req, res, next) => {
    try {
        const currentUser = req.user;
        const [siteIds, farmAreaIds, fieldIds] = await Promise.all([
            assignmentRepo.getUserAccessibleSiteIds(currentUser.userId, currentUser.role, (0, tenant_1.requireOrgId)(req)),
            assignmentRepo.getUserAccessibleFarmAreaIds(currentUser.userId, currentUser.role, (0, tenant_1.requireOrgId)(req)),
            assignmentRepo.getUserAccessibleFieldIds(currentUser.userId, currentUser.role, (0, tenant_1.requireOrgId)(req)),
        ]);
        res.json({
            success: true,
            data: {
                role: currentUser.role,
                siteIds,
                farmAreaIds,
                fieldIds,
                isFullAccess: currentUser.role === 'ceo',
            },
        });
    }
    catch (error) {
        next(error);
    }
});
// Get users that can be assigned by current user
exports.assignmentsRouter.get('/assignable-users', async (req, res, next) => {
    try {
        const currentUser = req.user;
        const assignableRoles = user_model_1.ASSIGNABLE_ROLES[currentUser.role] || [];
        if (assignableRoles.length === 0) {
            return res.json({ success: true, data: [] });
        }
        const allUsers = await userRepo.list();
        const assignableUsers = allUsers.filter(u => assignableRoles.includes(u.role));
        res.json({ success: true, data: assignableUsers });
    }
    catch (error) {
        next(error);
    }
});
