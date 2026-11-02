"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
const config_1 = require("../config");
const user_repository_1 = require("../repositories/user.repository");
const errors_1 = require("../utils/errors");
const organization_service_1 = require("./organization.service");
const organization_1 = require("../constants/organization");
const superAdmin_1 = require("../utils/superAdmin");
const fieldStaff_service_1 = require("./fieldStaff.service");
function enrichUserPublic(user, organizationId) {
    return {
        ...user,
        organizationId: organizationId ?? user.organizationId ?? null,
        isSuperAdmin: (0, superAdmin_1.isSuperAdminEmail)(user.email),
    };
}
const SALT_ROUNDS = 12;
class AuthService {
    constructor() {
        this.userRepository = new user_repository_1.UserRepository();
    }
    get accessTokenExpires() {
        return config_1.config.auth.jwtExpiresIn;
    }
    get refreshTokenExpiresDays() {
        return config_1.config.auth.refreshTokenDays;
    }
    getJwtSecret() {
        const secret = config_1.config.auth.jwtSecret;
        if (!secret || secret.length < 32) {
            throw new errors_1.AppError('JWT_SECRET must be at least 32 characters', 'CONFIG_ERROR', 500);
        }
        return secret;
    }
    async register(data) {
        const existingUser = await this.userRepository.findByEmail(data.email);
        if (existingUser) {
            throw new errors_1.AppError('Email already registered', 'CONFLICT', 409);
        }
        if (data.password.length < 8) {
            throw new errors_1.AppError('Password must be at least 8 characters', 'VALIDATION_ERROR', 400);
        }
        let organizationId = null;
        let role = 'worker';
        let inviteId = null;
        if (data.inviteToken) {
            const invite = await (0, organization_service_1.validateInviteToken)(data.inviteToken);
            if (invite.email.toLowerCase() !== data.email.toLowerCase()) {
                throw new errors_1.AppError('Email does not match invite', 'FORBIDDEN', 403);
            }
            organizationId = invite.organizationId;
            role = invite.role;
            inviteId = invite.inviteId;
        }
        else {
            const allowed = await (0, organization_service_1.isPublicRegistrationAllowed)();
            if (!allowed) {
                throw new errors_1.AppError('Registration requires an invite link', 'FORBIDDEN', 403);
            }
            organizationId = organization_1.DEFAULT_ORGANIZATION_ID;
            if (data.role)
                role = data.role;
        }
        const passwordHash = await bcryptjs_1.default.hash(data.password, SALT_ROUNDS);
        const user = await this.userRepository.create({
            email: data.email,
            passwordHash,
            name: data.name,
            role,
            organizationId,
        });
        if (inviteId) {
            await (0, organization_service_1.markInviteUsed)(inviteId, user.id);
        }
        const tokens = await this.generateTokens(user.id, user.email, user.role, organizationId ?? undefined);
        return { user: enrichUserPublic(user, organizationId), tokens };
    }
    async login(email, password) {
        const user = await this.userRepository.findByEmail(email);
        if (!user) {
            throw new errors_1.AppError('Invalid email or password', 'UNAUTHORIZED', 401);
        }
        if (!user.isActive) {
            throw new errors_1.AppError('Account is disabled', 'FORBIDDEN', 403);
        }
        if (!user.passwordHash) {
            throw new errors_1.AppError('This account uses Employee ID + PIN login', 'FORBIDDEN', 403);
        }
        const isValidPassword = await bcryptjs_1.default.compare(password, user.passwordHash);
        if (!isValidPassword) {
            throw new errors_1.AppError('Invalid email or password', 'UNAUTHORIZED', 401);
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
    async pinLogin(employeeId, pin) {
        const worker = await (0, fieldStaff_service_1.getLinkedWorkerByEmployeeId)(employeeId);
        if (!worker) {
            throw new errors_1.AppError('Invalid employee ID', 'UNAUTHORIZED', 401);
        }
        if (!worker.pin_hash) {
            throw new errors_1.AppError('PIN not set. Contact your supervisor.', 'FORBIDDEN', 403);
        }
        const valid = await bcryptjs_1.default.compare(pin, worker.pin_hash);
        if (!valid) {
            throw new errors_1.AppError('Invalid PIN', 'UNAUTHORIZED', 401);
        }
        if (!worker.linked_user_id) {
            throw new errors_1.AppError('This account is not set up for app access. Use Team Leader login for manpower entry.', 'FORBIDDEN', 403);
        }
        if (!worker.user_is_active) {
            throw new errors_1.AppError('Account is disabled', 'FORBIDDEN', 403);
        }
        const user = await this.userRepository.findById(worker.linked_user_id);
        if (!user || !user.isActive) {
            throw new errors_1.AppError('Account is disabled', 'FORBIDDEN', 403);
        }
        if (user.role !== 'scouter' && user.role !== 'operator') {
            throw new errors_1.AppError('Field Staff login is only for scouters and operators', 'FORBIDDEN', 403);
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
    async refreshTokens(refreshToken) {
        const tokenHash = this.hashToken(refreshToken);
        const storedToken = await this.userRepository.findRefreshToken(tokenHash);
        if (!storedToken) {
            throw new errors_1.AppError('Invalid or expired refresh token', 'UNAUTHORIZED', 401);
        }
        const user = await this.userRepository.findById(storedToken.userId);
        if (!user || !user.isActive) {
            throw new errors_1.AppError('User not found or disabled', 'UNAUTHORIZED', 401);
        }
        // Revoke old token and generate new ones
        await this.userRepository.revokeRefreshToken(tokenHash);
        const orgId = await this.userRepository.getOrganizationId(user.id);
        return this.generateTokens(user.id, user.email, user.role, orgId ?? undefined);
    }
    async logout(refreshToken) {
        const tokenHash = this.hashToken(refreshToken);
        await this.userRepository.revokeRefreshToken(tokenHash);
    }
    async logoutAll(userId) {
        await this.userRepository.revokeAllUserTokens(userId);
    }
    verifyAccessToken(token) {
        try {
            const decoded = jsonwebtoken_1.default.verify(token, this.getJwtSecret(), { algorithms: ['HS256'] });
            return decoded;
        }
        catch (error) {
            throw new errors_1.AppError('Invalid or expired access token', 'UNAUTHORIZED', 401);
        }
    }
    async getMe(userId) {
        const user = await this.userRepository.findById(userId);
        if (!user) {
            throw new errors_1.AppError('User not found', 'NOT_FOUND', 404);
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
    async generateTokens(userId, email, role, organizationId) {
        const payload = { userId, email, role, organizationId };
        const accessToken = jsonwebtoken_1.default.sign(payload, this.getJwtSecret(), {
            algorithm: 'HS256',
            expiresIn: this.accessTokenExpires,
        });
        const refreshToken = crypto_1.default.randomBytes(64).toString('hex');
        const refreshTokenHash = this.hashToken(refreshToken);
        const expiresAt = new Date(Date.now() + this.refreshTokenExpiresDays * 24 * 60 * 60 * 1000);
        await this.userRepository.saveRefreshToken(userId, refreshTokenHash, expiresAt);
        const decoded = jsonwebtoken_1.default.decode(accessToken);
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
    async generateTokensForUser(userId, email, role, organizationId) {
        return this.generateTokens(userId, email, role, organizationId);
    }
    hashToken(token) {
        return crypto_1.default.createHash('sha256').update(token).digest('hex');
    }
}
exports.AuthService = AuthService;
