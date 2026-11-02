export type UserRole = 'ceo' | 'farm_manager' | 'operation_manager' | 'agronomist' | 'pest_agronomist' | 'scouter' | 'worker' | 'operator' | 'intern_student' | 'intern_teacher' | 'auditor';

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  ceo: 5,
  farm_manager: 4,
  operation_manager: 3,
  agronomist: 2,
  pest_agronomist: 2,
  intern_teacher: 2,
  auditor: 2,
  operator: 1,
  scouter: 1,
  worker: 1,
  intern_student: 0,
};

export const ASSIGNABLE_ROLES: Record<UserRole, UserRole[]> = {
  ceo: ['ceo', 'farm_manager', 'operation_manager', 'agronomist', 'pest_agronomist', 'auditor', 'scouter', 'worker', 'operator', 'intern_teacher', 'intern_student'],
  farm_manager: ['operation_manager', 'agronomist', 'pest_agronomist', 'auditor', 'scouter', 'worker', 'operator', 'intern_teacher', 'intern_student'],
  operation_manager: ['agronomist', 'pest_agronomist', 'auditor', 'scouter', 'worker', 'operator', 'intern_teacher', 'intern_student'],
  agronomist: [],
  pest_agronomist: ['scouter', 'operator'],
  auditor: [],
  operator: [],
  scouter: [],
  intern_teacher: [],
  worker: [],
  intern_student: [],
};

/**
 * True when `callerRole` may act on a user holding `targetRole`: the target role must be one
 * the caller can assign AND strictly lower in rank (never equal or higher).
 */
export function outranksForManagement(callerRole: string, targetRole: string): boolean {
  const assignable = ASSIGNABLE_ROLES[callerRole as UserRole] || [];
  if (!assignable.includes(targetRole as UserRole)) return false;
  const callerLevel = ROLE_HIERARCHY[callerRole as UserRole] ?? 0;
  const targetLevel = ROLE_HIERARCHY[targetRole as UserRole] ?? 0;
  return targetLevel < callerLevel;
}

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  lastLogin: string | null;
  createdAt: string;
  updatedAt: string;
  microsoftId?: string;
}

export interface UserPublic {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  lastLogin: string | null;
  createdAt: string;
  organizationId?: string | null;
  isSuperAdmin?: boolean;
}

export interface RefreshToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
  revokedAt: string | null;
}
