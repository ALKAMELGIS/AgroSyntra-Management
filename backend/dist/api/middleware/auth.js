"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = exports.requirePhiAuditReviewer = exports.requireAuditor = exports.requirePestAgronomist = exports.requireAgronomist = exports.authorizeFieldStaff = exports.FIELD_STAFF_ROLES = exports.requireOperationManager = exports.requireManager = exports.requireAdmin = exports.requireCeo = void 0;
exports.auth = auth;
exports.optionalAuth = optionalAuth;
exports.authorize = authorize;
exports.checkPermission = checkPermission;
const crypto_1 = __importDefault(require("crypto"));
const auth_service_1 = require("../../services/auth.service");
const errors_1 = require("../../utils/errors");
const client_1 = require("../../db/client");
const tenant_1 = require("./tenant");
const authService = new auth_service_1.AuthService();
/**
 * Authentication middleware - verifies JWT token
 */
function auth(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        const apiKey = req.headers['x-api-key'];
        // Try Bearer token first
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            const payload = authService.verifyAccessToken(token);
            req.user = {
                userId: payload.userId,
                email: payload.email,
                role: payload.role,
                organizationId: payload.organizationId,
            };
            return (0, tenant_1.tenantMiddleware)(req, res, next);
        }
        // Fallback to API key
        if (apiKey) {
            const keyHash = crypto_1.default.createHash('sha256').update(apiKey).digest('hex');
            client_1.dbPool.query(`SELECT ak.*, u.role, u.email, u.organization_id
         FROM api_keys ak JOIN users u ON u.id = ak.user_id
         WHERE ak.key_hash = $1 AND ak.is_active = true
           AND (ak.expires_at IS NULL OR ak.expires_at > NOW())`, [keyHash]).then((result) => {
                if (result.rows.length === 0) {
                    return next(new errors_1.AppError('Invalid or expired API key', 'UNAUTHORIZED', 401));
                }
                const key = result.rows[0];
                client_1.dbPool.query('UPDATE api_keys SET last_used = NOW() WHERE id = $1', [key.id]).catch(() => { });
                req.user = {
                    userId: key.user_id,
                    email: key.email,
                    role: key.role,
                    organizationId: key.organization_id ?? undefined,
                };
                (0, tenant_1.tenantMiddleware)(req, res, next);
            }).catch(next);
            return;
        }
        throw new errors_1.AppError('Authorization header missing or invalid', 'UNAUTHORIZED', 401);
    }
    catch (error) {
        next(error);
    }
}
/**
 * Optional authentication - attaches user if token present, but doesn't require it
 */
function optionalAuth(req, _res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            const payload = authService.verifyAccessToken(token);
            req.user = {
                userId: payload.userId,
                email: payload.email,
                role: payload.role,
                organizationId: payload.organizationId,
            };
        }
        next();
    }
    catch {
        // Token invalid but optional, continue without user
        next();
    }
}
/**
 * Role-based authorization middleware
 * Must be used after auth middleware
 */
function authorize(...allowedRoles) {
    return (req, _res, next) => {
        if (!req.user) {
            return next(new errors_1.AppError('Authentication required', 'UNAUTHORIZED', 401));
        }
        if (!allowedRoles.includes(req.user.role)) {
            return next(new errors_1.AppError(`Access denied. Required role: ${allowedRoles.join(' or ')}`, 'FORBIDDEN', 403));
        }
        next();
    };
}
/**
 * Require CEO role
 */
exports.requireCeo = authorize('ceo');
/**
 * Require admin role (CEO) - legacy alias
 */
exports.requireAdmin = authorize('ceo');
/**
 * Require manager or admin role (CEO or Farm Manager)
 */
exports.requireManager = authorize('ceo', 'farm_manager');
/**
 * Require operation-level access
 */
exports.requireOperationManager = authorize('ceo', 'farm_manager', 'operation_manager');
/** Roles with field-level data entry and IPM read access (includes pest agronomist). */
exports.FIELD_STAFF_ROLES = [
    'ceo', 'farm_manager', 'operation_manager',
    'agronomist', 'pest_agronomist', 'scouter', 'worker',
];
exports.authorizeFieldStaff = authorize(...exports.FIELD_STAFF_ROLES);
/**
 * Require agronomist-level access (can view but not manage)
 */
exports.requireAgronomist = authorize('ceo', 'farm_manager', 'operation_manager', 'agronomist', 'pest_agronomist');
exports.requirePestAgronomist = authorize('pest_agronomist');
exports.requireAuditor = authorize('auditor');
exports.requirePhiAuditReviewer = authorize('auditor', 'ceo', 'farm_manager');
/**
 * Allow any authenticated user
 */
exports.requireAuth = auth;
/**
 * Permission-based authorization middleware.
 * Checks role defaults first, then falls back to user_permissions table.
 */
function checkPermission(module, permission) {
    return async (req, _res, next) => {
        if (!req.user) {
            return next(new errors_1.AppError('Authentication required', 'UNAUTHORIZED', 401));
        }
        try {
            const { hasPermission } = await Promise.resolve().then(() => __importStar(require('../../services/permission.service')));
            const allowed = await hasPermission(req.user.userId, req.user.role, module, permission);
            if (!allowed) {
                return next(new errors_1.AppError(`Access denied. You need '${permission}' permission on '${module}'.`, 'FORBIDDEN', 403));
            }
            next();
        }
        catch (err) {
            next(err);
        }
    };
}
