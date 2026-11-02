"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.usersRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const user_repository_1 = require("../../repositories/user.repository");
const assignment_repository_1 = require("../../repositories/assignment.repository");
const validate_1 = require("../middleware/validate");
const auth_1 = require("../middleware/auth");
const tenant_1 = require("../middleware/tenant");
const errors_1 = require("../../utils/errors");
const user_model_1 = require("../../models/user.model");
const adminAccess_1 = require("../../utils/adminAccess");
const auditLog_service_1 = require("../../services/auditLog.service");
exports.usersRouter = (0, express_1.Router)();
const userRepository = new user_repository_1.UserRepository();
const assignmentRepo = new assignment_repository_1.AssignmentRepository();
const idSchema = zod_1.z.object({ id: zod_1.z.string().uuid() });
const updateUserSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).optional(),
    role: zod_1.z.enum(['ceo', 'farm_manager', 'operation_manager', 'agronomist', 'pest_agronomist', 'scouter', 'worker', 'operator', 'intern_teacher', 'intern_student', 'auditor']).optional(),
    isActive: zod_1.z.boolean().optional(),
});
const createUserSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    name: zod_1.z.string().min(1),
    password: zod_1.z.string().min(8),
    role: zod_1.z.enum(['ceo', 'farm_manager', 'operation_manager', 'agronomist', 'pest_agronomist', 'scouter', 'worker', 'operator', 'intern_teacher', 'intern_student', 'auditor']),
});
// All user routes require authentication
exports.usersRouter.use(auth_1.auth);
// Middleware to check if user can manage users
const canManageUsers = (req, res, next) => {
    const role = req.user?.role;
    // Only CEO, Farm Manager, and Operation Manager can manage users
    if (!['ceo', 'farm_manager', 'operation_manager'].includes(role)) {
        return res.status(403).json({
            success: false,
            error: { message: 'You do not have permission to manage users' },
        });
    }
    next();
};
// Get role options based on current user's permissions (must be before /:id)
exports.usersRouter.get('/meta/roles', canManageUsers, async (req, res, next) => {
    try {
        const currentUser = req.user;
        const assignableRoles = user_model_1.ASSIGNABLE_ROLES[currentUser.role] || [];
        const roleLabels = {
            ceo: 'CEO',
            farm_manager: 'Farm Manager',
            operation_manager: 'Operation Manager',
            agronomist: 'Agronomist',
            pest_agronomist: 'Pest Agronomist',
            scouter: 'Scouter',
            worker: 'Worker',
            operator: 'Operator',
            intern_student: 'Student',
            intern_teacher: 'Intern Teacher',
        };
        const roles = assignableRoles.map(role => ({
            value: role,
            label: roleLabels[role] || role,
        }));
        res.json({ success: true, data: roles });
    }
    catch (error) {
        next(error);
    }
});
// List all users (filtered by what current user can see)
exports.usersRouter.get('/', canManageUsers, async (req, res, next) => {
    try {
        const currentUser = req.user;
        const allUsers = await userRepository.list();
        // CEO sees all users
        if (currentUser.role === 'ceo') {
            return res.json({ success: true, data: allUsers });
        }
        // Other managers see only users with lower roles
        const assignableRoles = user_model_1.ASSIGNABLE_ROLES[currentUser.role] || [];
        const filteredUsers = allUsers.filter(u => assignableRoles.includes(u.role) || u.id === currentUser.userId);
        res.json({ success: true, data: filteredUsers });
    }
    catch (error) {
        next(error);
    }
});
// Get user by ID
exports.usersRouter.get('/:id', canManageUsers, (0, validate_1.validate)({ params: idSchema }), async (req, res, next) => {
    try {
        const user = await userRepository.findById(req.params.id);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: { message: 'User not found' },
            });
        }
        // Get user's assignments
        const [siteAssignments, farmAreaAssignments, fieldAssignments] = await Promise.all([
            assignmentRepo.getUserSiteAssignments(user.id),
            assignmentRepo.getUserFarmAreaAssignments(user.id),
            assignmentRepo.getUserFieldAssignments(user.id),
        ]);
        res.json({
            success: true,
            data: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                isActive: user.isActive,
                lastLogin: user.lastLogin,
                createdAt: user.createdAt,
                assignments: {
                    sites: siteAssignments,
                    farmAreas: farmAreaAssignments,
                    fields: fieldAssignments,
                },
            },
        });
    }
    catch (error) {
        next(error);
    }
});
// Create new user
exports.usersRouter.post('/', canManageUsers, (0, validate_1.validate)({ body: createUserSchema }), async (req, res, next) => {
    try {
        const currentUser = req.user;
        const { email, name, password, role } = req.body;
        // Check if current user can create this role
        const assignableRoles = user_model_1.ASSIGNABLE_ROLES[currentUser.role] || [];
        if (!assignableRoles.includes(role)) {
            throw new errors_1.AppError(`You cannot create users with role '${role}'`, 'FORBIDDEN', 403);
        }
        // Check if email already exists (including inactive, excluding soft-deleted)
        const existing = await userRepository.findAccountByEmail(email);
        if (existing) {
            throw new errors_1.AppError('Email already registered', 'CONFLICT', 409);
        }
        // Hash password and create user
        const bcrypt = require('bcryptjs');
        const passwordHash = await bcrypt.hash(password, 12);
        const orgId = (0, tenant_1.requireOrgId)(req);
        const user = await userRepository.create({ email, name, passwordHash, role, organizationId: orgId });
        await (0, auditLog_service_1.logAuditEvent)({
            userId: currentUser.userId,
            action: 'CREATE',
            entity: 'user',
            entityId: user.id,
            changes: { email, name, role },
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
        });
        res.status(201).json({ success: true, data: user });
    }
    catch (error) {
        next(error);
    }
});
// Update user
exports.usersRouter.put('/:id', canManageUsers, (0, validate_1.validate)({ params: idSchema, body: updateUserSchema }), async (req, res, next) => {
    try {
        const currentUser = req.user;
        const targetUserId = req.params.id;
        // Prevent user from deactivating themselves
        if (targetUserId === currentUser.userId && req.body.isActive === false) {
            throw new errors_1.AppError('Cannot deactivate your own account', 'BAD_REQUEST', 400);
        }
        // Get target user
        const targetUser = await userRepository.findById(targetUserId);
        if (!targetUser) {
            return res.status(404).json({
                success: false,
                error: { message: 'User not found' },
            });
        }
        // Check if current user can modify this user
        const currentRoleLevel = user_model_1.ROLE_HIERARCHY[currentUser.role] || 0;
        const targetRoleLevel = user_model_1.ROLE_HIERARCHY[targetUser.role] || 0;
        if (!(0, adminAccess_1.isPlatformAdminEmail)(currentUser.email) &&
            currentRoleLevel <= targetRoleLevel &&
            currentUser.userId !== targetUserId) {
            throw new errors_1.AppError('You cannot modify users with equal or higher roles', 'FORBIDDEN', 403);
        }
        // If changing role, check if new role is assignable
        if (req.body.role) {
            const assignableRoles = user_model_1.ASSIGNABLE_ROLES[currentUser.role] || [];
            if (!assignableRoles.includes(req.body.role)) {
                throw new errors_1.AppError(`You cannot assign role '${req.body.role}'`, 'FORBIDDEN', 403);
            }
        }
        const user = await userRepository.update(targetUserId, req.body);
        const changes = (0, auditLog_service_1.computeChanges)({ name: targetUser.name, role: targetUser.role, isActive: targetUser.isActive }, req.body);
        if (Object.keys(changes).length > 0) {
            await (0, auditLog_service_1.logAuditEvent)({
                userId: currentUser.userId,
                action: 'UPDATE',
                entity: 'user',
                entityId: targetUserId,
                changes,
                metadata: { targetEmail: targetUser.email },
                ipAddress: req.ip,
                userAgent: req.headers['user-agent'],
            });
        }
        res.json({ success: true, data: user });
    }
    catch (error) {
        next(error);
    }
});
// Soft delete user
exports.usersRouter.delete('/:id', canManageUsers, (0, validate_1.validate)({ params: idSchema }), async (req, res, next) => {
    try {
        const currentUser = req.user;
        const targetUserId = req.params.id;
        if (targetUserId === currentUser.userId) {
            throw new errors_1.AppError('Cannot delete your own account', 'BAD_REQUEST', 400);
        }
        const targetUser = await userRepository.findById(targetUserId);
        if (!targetUser) {
            return res.status(404).json({
                success: false,
                error: { message: 'User not found' },
            });
        }
        const currentRoleLevel = user_model_1.ROLE_HIERARCHY[currentUser.role] || 0;
        const targetRoleLevel = user_model_1.ROLE_HIERARCHY[targetUser.role] || 0;
        if (!(0, adminAccess_1.isPlatformAdminEmail)(currentUser.email) &&
            currentRoleLevel <= targetRoleLevel) {
            throw new errors_1.AppError('You cannot delete users with equal or higher roles', 'FORBIDDEN', 403);
        }
        const deleted = await userRepository.softDelete(targetUserId);
        if (!deleted) {
            return res.status(404).json({
                success: false,
                error: { message: 'User not found' },
            });
        }
        await (0, auditLog_service_1.logAuditEvent)({
            userId: currentUser.userId,
            action: 'DELETE',
            entity: 'user',
            entityId: targetUserId,
            metadata: { targetEmail: targetUser.email, targetName: targetUser.name },
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
        });
        res.json({ success: true, data: { deleted: true } });
    }
    catch (error) {
        next(error);
    }
});
