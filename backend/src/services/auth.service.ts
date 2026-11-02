import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config';
import { UserRepository } from '../repositories/user.repository';
import { UserPublic, UserRole } from '../models/user.model';
import { AppError } from '../utils/errors';
import {
  isPublicRegistrationAllowed,
  validateInviteToken,
  markInviteUsed,
} from './organization.service';
import { DEFAULT_ORGANIZATION_ID } from '../constants/organization';
import { isSuperAdminEmail } from '../utils/superAdmin';
import { getLinkedWorkerByEmployeeId } from './fieldStaff.service';

function enrichUserPublic(user: UserPublic, organizationId?: string | null): UserPublic {
  return {
    ...user,
    organizationId: organizationId ?? user.organizationId ?? null,
    isSuperAdmin: isSuperAdminEmail(user.email),
  };
}

interface TokenPayload {
  userId: string;
  email: string;
  role: UserRole;
  organizationId?: string;
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

const SALT_ROUNDS = 12;

export class AuthService {
  private readonly userRepository = new UserRepository();

  private get accessTokenExpires(): string {
    return config.auth.jwtExpiresIn;
  }

  private get refreshTokenExpiresDays(): number {
    return config.auth.refreshTokenDays;
  }

  private getJwtSecret(): string {
    const secret = config.auth.jwtSecret;
    if (!secret || secret.length < 32) {
      throw new AppError('JWT_SECRET must be at least 32 characters', 'CONFIG_ERROR', 500);
    }
    return secret;
  }

  async register(data: {
    email: string;
    password: string;
    name: string;
    role?: UserRole;
    inviteToken?: string;
  }): Promise<{ user: UserPublic; tokens: AuthTokens }> {
    const existingUser = await this.userRepository.findByEmail(data.email);
    if (existingUser) {
      throw new AppError('Email already registered', 'CONFLICT', 409);
    }

    if (data.password.length < 8) {
      throw new AppError('Password must be at least 8 characters', 'VALIDATION_ERROR', 400);
    }

    let organizationId: string | null = null;
    let role: UserRole = 'worker';
    let inviteId: string | null = null;

    if (data.inviteToken) {
      const invite = await validateInviteToken(data.inviteToken);
      if (invite.email.toLowerCase() !== data.email.toLowerCase()) {
        throw new AppError('Email does not match invite', 'FORBIDDEN', 403);
      }
      organizationId = invite.organizationId;
      role = invite.role;
      inviteId = invite.inviteId;
    } else {
      const allowed = await isPublicRegistrationAllowed();
      if (!allowed) {
        throw new AppError('Registration requires an invite link', 'FORBIDDEN', 403);
      }
      organizationId = DEFAULT_ORGANIZATION_ID;
      if (data.role) role = data.role;
    }

    const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);
    const user = await this.userRepository.create({
      email: data.email,
      passwordHash,
      name: data.name,
      role,
      organizationId,
    });

    if (inviteId) {
      await markInviteUsed(inviteId, user.id);
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role, organizationId ?? undefined);
    return { user: enrichUserPublic(user, organizationId), tokens };
  }

  async login(email: string, password: string): Promise<{ user: UserPublic; tokens: AuthTokens }> {
    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      throw new AppError('Invalid email or password', 'UNAUTHORIZED', 401);
    }

    if (!user.isActive) {
      throw new AppError('Account is disabled', 'FORBIDDEN', 403);
    }

    if (!user.passwordHash) {
      throw new AppError('This account uses Employee ID + PIN login', 'FORBIDDEN', 403);
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      throw new AppError('Invalid email or password', 'UNAUTHORIZED', 401);
    }

    await this.userRepository.updateLastLogin(user.id);
    const orgId = await this.userRepository.getOrganizationId(user.id);
    const tokens = await this.generateTokens(user.id, user.email, user.role, orgId ?? undefined);

    return {
      user: enrichUserPublic({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        isActive: user.isActive,
        lastLogin: new Date().toISOString(),
        createdAt: user.createdAt,
      }, orgId),
      tokens,
    };
  }

  async pinLogin(employeeId: string, pin: string): Promise<{ user: UserPublic; tokens: AuthTokens }> {
    const worker = await getLinkedWorkerByEmployeeId(employeeId);
    if (!worker) {
      throw new AppError('Invalid employee ID', 'UNAUTHORIZED', 401);
    }
    if (!worker.pin_hash) {
      throw new AppError('PIN not set. Contact your supervisor.', 'FORBIDDEN', 403);
    }

    const valid = await bcrypt.compare(pin, worker.pin_hash);
    if (!valid) {
      throw new AppError('Invalid PIN', 'UNAUTHORIZED', 401);
    }

    if (!worker.linked_user_id) {
      throw new AppError(
        'This account is not set up for app access. Use Team Leader login for manpower entry.',
        'FORBIDDEN',
        403,
      );
    }

    if (!worker.user_is_active) {
      throw new AppError('Account is disabled', 'FORBIDDEN', 403);
    }

    const user = await this.userRepository.findById(worker.linked_user_id);
    if (!user || !user.isActive) {
      throw new AppError('Account is disabled', 'FORBIDDEN', 403);
    }

    if (user.role !== 'scouter' && user.role !== 'operator') {
      throw new AppError('Field Staff login is only for scouters and operators', 'FORBIDDEN', 403);
    }

    await this.userRepository.updateLastLogin(user.id);
    const orgId = worker.organization_id ?? await this.userRepository.getOrganizationId(user.id);
    const tokens = await this.generateTokens(user.id, user.email, user.role, orgId ?? undefined);

    return {
      user: enrichUserPublic({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        isActive: user.isActive,
        lastLogin: new Date().toISOString(),
        createdAt: user.createdAt,
      }, orgId),
      tokens,
    };
  }

  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    const tokenHash = this.hashToken(refreshToken);
    const storedToken = await this.userRepository.findRefreshToken(tokenHash);

    if (!storedToken) {
      throw new AppError('Invalid or expired refresh token', 'UNAUTHORIZED', 401);
    }

    const user = await this.userRepository.findById(storedToken.userId);
    if (!user || !user.isActive) {
      throw new AppError('User not found or disabled', 'UNAUTHORIZED', 401);
    }

    // Revoke old token and generate new ones
    await this.userRepository.revokeRefreshToken(tokenHash);
    const orgId = await this.userRepository.getOrganizationId(user.id);
    return this.generateTokens(user.id, user.email, user.role, orgId ?? undefined);
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    await this.userRepository.revokeRefreshToken(tokenHash);
  }

  async logoutAll(userId: string): Promise<void> {
    await this.userRepository.revokeAllUserTokens(userId);
  }

  verifyAccessToken(token: string): TokenPayload {
    try {
      const decoded = jwt.verify(token, this.getJwtSecret(), { algorithms: ['HS256'] }) as TokenPayload;
      return decoded;
    } catch (error) {
      throw new AppError('Invalid or expired access token', 'UNAUTHORIZED', 401);
    }
  }

  async getMe(userId: string): Promise<UserPublic> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new AppError('User not found', 'NOT_FOUND', 404);
    }
    const orgId = await this.userRepository.getOrganizationId(userId);
    return enrichUserPublic({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt,
    }, orgId);
  }

  private async generateTokens(
    userId: string,
    email: string,
    role: UserRole,
    organizationId?: string,
  ): Promise<AuthTokens> {
    const payload: TokenPayload = { userId, email, role, organizationId };

    const accessToken = jwt.sign(payload, this.getJwtSecret(), {
      algorithm: 'HS256',
      expiresIn: this.accessTokenExpires as jwt.SignOptions['expiresIn'],
    });

    const refreshToken = crypto.randomBytes(64).toString('hex');
    const refreshTokenHash = this.hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + this.refreshTokenExpiresDays * 24 * 60 * 60 * 1000);

    await this.userRepository.saveRefreshToken(userId, refreshTokenHash, expiresAt);

    const decoded = jwt.decode(accessToken) as { exp?: number } | null;
    const expiresIn = decoded?.exp
      ? Math.max(decoded.exp - Math.floor(Date.now() / 1000), 0)
      : 8 * 60 * 60;

    return {
      accessToken,
      refreshToken,
      expiresIn,
    };
  }

  // Public method for SSO providers to generate tokens
  async generateTokensForUser(
    userId: string,
    email: string,
    role: UserRole,
    organizationId?: string,
  ): Promise<AuthTokens> {
    return this.generateTokens(userId, email, role, organizationId);
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
