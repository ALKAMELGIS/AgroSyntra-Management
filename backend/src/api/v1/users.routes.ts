import { Router } from 'express';
import { z } from 'zod';
import { UserRepository } from '../../repositories/user.repository';
import { AssignmentRepository } from '../../repositories/assignment.repository';
import { validate } from '../middleware/validate';
import { auth, AuthRequest } from '../middleware/auth';
import { requireOrgId } from '../middleware/tenant';
import { AppError } from '../../utils/errors';
import { ASSIGNABLE_ROLES, ROLE_HIERARCHY, UserRole } from '../../models/user.model';
import { isPlatformAdminEmail } from '../../utils/adminAccess';
import { logAuditEvent, computeChanges } from '../../services/auditLog.service';

export const usersRouter = Router();
const userRepository = new UserRepository();
const assignmentRepo = new AssignmentRepository();

const idSchema = z.object({ id: z.string().uuid() });

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(['ceo', 'farm_manager', 'operation_manager', 'agronomist', 'pest_agronomist', 'scouter', 'worker', 'operator', 'intern_teacher', 'intern_student', 'auditor']).optional(),
  isActive: z.boolean().optional(),
});

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8),
  role: z.enum(['ceo', 'farm_manager', 'operation_manager', 'agronomist', 'pest_agronomist', 'scouter', 'worker', 'operator', 'intern_teacher', 'intern_student', 'auditor']),
});

// All user routes require authentication
usersRouter.use(auth);

// Middleware to check if user can manage users
const canManageUsers = (req: AuthRequest, res: any, next: any) => {
  const role = req.user?.role as UserRole;
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
usersRouter.get('/meta/roles', canManageUsers, async (req: AuthRequest, res, next) => {
  try {
    const currentUser = req.user!;
    const assignableRoles = ASSIGNABLE_ROLES[currentUser.role as UserRole] || [];
    
    const roleLabels: Record<string, string> = {
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
  } catch (error) {
    next(error);
  }
});

// List all users (filtered by what current user can see)
usersRouter.get('/', canManageUsers, async (req: AuthRequest, res, next) => {
  try {
    const currentUser = req.user!;
    const allUsers = await userRepository.list();
    
    // CEO sees all users
    if (currentUser.role === 'ceo') {
      return res.json({ success: true, data: allUsers });
    }
    
    // Other managers see only users with lower roles
    const assignableRoles = ASSIGNABLE_ROLES[currentUser.role as UserRole] || [];
    const filteredUsers = allUsers.filter(u => 
      assignableRoles.includes(u.role as UserRole) || u.id === currentUser.userId
    );
    
    res.json({ success: true, data: filteredUsers });
  } catch (error) {
    next(error);
  }
});

// Get user by ID
usersRouter.get(
  '/:id',
  canManageUsers,
  validate({ params: idSchema }),
  async (req: AuthRequest, res, next) => {
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
    } catch (error) {
      next(error);
    }
  }
);

// Create new user
usersRouter.post(
  '/',
  canManageUsers,
  validate({ body: createUserSchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const currentUser = req.user!;
      const { email, name, password, role } = req.body;
      
      // Check if current user can create this role
      const assignableRoles = ASSIGNABLE_ROLES[currentUser.role as UserRole] || [];
      if (!assignableRoles.includes(role)) {
        throw new AppError(`You cannot create users with role '${role}'`, 'FORBIDDEN', 403);
      }
      
      // Check if email already exists (including inactive, excluding soft-deleted)
      const existing = await userRepository.findAccountByEmail(email);
      if (existing) {
        throw new AppError('Email already registered', 'CONFLICT', 409);
      }
      
      // Hash password and create user
      const bcrypt = require('bcryptjs');
      const passwordHash = await bcrypt.hash(password, 12);
      const orgId = requireOrgId(req);
      const user = await userRepository.create({ email, name, passwordHash, role, organizationId: orgId });

      await logAuditEvent({
        userId: currentUser.userId,
        action: 'CREATE',
        entity: 'user',
        entityId: user.id,
        changes: { email, name, role },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.status(201).json({ success: true, data: user });
    } catch (error) {
      next(error);
    }
  }
);

// Update user
usersRouter.put(
  '/:id',
  canManageUsers,
  validate({ params: idSchema, body: updateUserSchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const currentUser = req.user!;
      const targetUserId = req.params.id;
      
      // Prevent user from deactivating themselves
      if (targetUserId === currentUser.userId && req.body.isActive === false) {
        throw new AppError('Cannot deactivate your own account', 'BAD_REQUEST', 400);
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
      const currentRoleLevel = ROLE_HIERARCHY[currentUser.role as UserRole] || 0;
      const targetRoleLevel = ROLE_HIERARCHY[targetUser.role as UserRole] || 0;
      
      if (
        !isPlatformAdminEmail(currentUser.email) &&
        currentRoleLevel <= targetRoleLevel &&
        currentUser.userId !== targetUserId
      ) {
        throw new AppError('You cannot modify users with equal or higher roles', 'FORBIDDEN', 403);
      }
      
      // If changing role, check if new role is assignable
      if (req.body.role) {
        const assignableRoles = ASSIGNABLE_ROLES[currentUser.role as UserRole] || [];
        if (!assignableRoles.includes(req.body.role)) {
          throw new AppError(`You cannot assign role '${req.body.role}'`, 'FORBIDDEN', 403);
        }
      }

      const user = await userRepository.update(targetUserId, req.body);

      const changes = computeChanges(
        { name: targetUser.name, role: targetUser.role, isActive: (targetUser as any).isActive },
        req.body,
      );
      if (Object.keys(changes).length > 0) {
        await logAuditEvent({
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
    } catch (error) {
      next(error);
    }
  }
);

// Soft delete user
usersRouter.delete(
  '/:id',
  canManageUsers,
  validate({ params: idSchema }),
  async (req: AuthRequest, res, next) => {
    try {
      const currentUser = req.user!;
      const targetUserId = req.params.id;

      if (targetUserId === currentUser.userId) {
        throw new AppError('Cannot delete your own account', 'BAD_REQUEST', 400);
      }

      const targetUser = await userRepository.findById(targetUserId);
      if (!targetUser) {
        return res.status(404).json({
          success: false,
          error: { message: 'User not found' },
        });
      }

      const currentRoleLevel = ROLE_HIERARCHY[currentUser.role as UserRole] || 0;
      const targetRoleLevel = ROLE_HIERARCHY[targetUser.role as UserRole] || 0;

      if (
        !isPlatformAdminEmail(currentUser.email) &&
        currentRoleLevel <= targetRoleLevel
      ) {
        throw new AppError('You cannot delete users with equal or higher roles', 'FORBIDDEN', 403);
      }

      const deleted = await userRepository.softDelete(targetUserId);
      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: { message: 'User not found' },
        });
      }

      await logAuditEvent({
        userId: currentUser.userId,
        action: 'DELETE',
        entity: 'user',
        entityId: targetUserId,
        metadata: { targetEmail: targetUser.email, targetName: targetUser.name },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.json({ success: true, data: { deleted: true } });
    } catch (error) {
      next(error);
    }
  }
);

