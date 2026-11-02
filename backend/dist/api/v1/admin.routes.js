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
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const asyncHandler_1 = require("../../utils/asyncHandler");
const logger_1 = require("../../utils/logger");
const superAdmin_1 = require("../../utils/superAdmin");
const errors_1 = require("../../utils/errors");
const organization_service_1 = require("../../services/organization.service");
const config_1 = require("../../config");
exports.adminRouter = (0, express_1.Router)();
exports.adminRouter.use(auth_1.auth);
function requireSuperAdmin(req, _res, next) {
    if (!req.user || !(0, superAdmin_1.isSuperAdminEmail)(req.user.email)) {
        return next(new errors_1.AppError('Super admin access required', 'FORBIDDEN', 403));
    }
    next();
}
const createOrgSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    slug: zod_1.z.string().min(2).max(80).optional(),
    ownerEmail: zod_1.z.string().email(),
    ownerRole: zod_1.z.enum(['ceo', 'farm_manager', 'operation_manager']).default('farm_manager'),
    seedSite: zod_1.z.boolean().optional(),
});
/**
 * GET /admin/organizations — list all orgs (super-admin only)
 */
exports.adminRouter.get('/organizations', requireSuperAdmin, (0, asyncHandler_1.asyncHandler)(async (_req, res) => {
    const orgs = await (0, organization_service_1.listOrganizations)();
    res.json({ success: true, data: orgs });
}));
/**
 * POST /admin/organizations — create org + invite link for owner (super-admin only)
 */
exports.adminRouter.post('/organizations', requireSuperAdmin, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const body = createOrgSchema.parse(req.body);
    const org = await (0, organization_service_1.createOrganization)({ name: body.name, slug: body.slug });
    let seeded = null;
    if (body.seedSite) {
        seeded = await (0, organization_service_1.seedMinimalOrgStructure)(org.id);
    }
    const invite = await (0, organization_service_1.createOrganizationInvite)({
        organizationId: org.id,
        email: body.ownerEmail,
        role: body.ownerRole,
        createdBy: req.user.userId,
    });
    const registerUrl = `${config_1.config.appUrl.replace(/\/$/, '')}/register?invite=${invite.inviteToken}`;
    res.status(201).json({
        success: true,
        data: {
            organization: org,
            seeded,
            invite: {
                email: body.ownerEmail,
                role: body.ownerRole,
                expiresAt: invite.expiresAt,
                registerUrl,
            },
        },
    });
}));
/**
 * GET /admin/observability
 * Report which production-safety integrations are configured, without
 * leaking any secrets. Used by the admin UI to show green/amber badges.
 */
exports.adminRouter.get('/observability', auth_1.requireCeo, (0, asyncHandler_1.asyncHandler)(async (_req, res) => {
    const { getActiveProvider } = await Promise.resolve().then(() => __importStar(require('../../services/storage.service')));
    const sentryConfigured = Boolean(process.env.SENTRY_DSN);
    const storageProvider = getActiveProvider();
    const s3Endpoint = process.env.S3_ENDPOINT || '';
    const s3Bucket = process.env.S3_BUCKET || '';
    const backupBucket = process.env.BACKUP_S3_BUCKET || '';
    res.json({
        success: true,
        data: {
            sentry: {
                configured: sentryConfigured,
                environment: process.env.NODE_ENV || 'development',
            },
            storage: {
                provider: storageProvider,
                // 'db' and 's3' both survive redeploys. Only the default
                // 'local' filesystem adapter is ephemeral on Railway.
                persistent: storageProvider === 's3' || storageProvider === 'db',
                bucketMasked: s3Bucket ? s3Bucket.replace(/.(?=.{4})/g, '*') : null,
                endpointMasked: s3Endpoint ? s3Endpoint.replace(/^(https?:\/\/)([^/]+)(.*)$/, '$1****$3') : null,
            },
            backup: {
                configured: Boolean(backupBucket),
                bucketMasked: backupBucket ? backupBucket.replace(/.(?=.{4})/g, '*') : null,
            },
        },
    });
}));
/**
 * GET /admin/backup/status
 * Report whether backup env vars are configured and show any in-flight run.
 * Useful for the UI to show a green/amber/red indicator without exposing secrets.
 */
exports.adminRouter.get('/backup/status', auth_1.requireCeo, (0, asyncHandler_1.asyncHandler)(async (_req, res) => {
    const bucket = process.env.BACKUP_S3_BUCKET || '';
    const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS || 30);
    res.json({
        success: true,
        data: {
            configured: Boolean(bucket),
            bucketMasked: bucket ? bucket.replace(/.(?=.{4})/g, '*') : null,
            retentionDays,
            scheduleCron: '0 2 * * *',
            scheduleDescription: 'Daily at 02:00 UTC (if BACKUP_S3_BUCKET is set)',
        },
    });
}));
/**
 * POST /admin/backup/run
 * Triggers a pg_dump immediately. Runs in the current request's process —
 * keep it behind ceo-only because it streams the full DB to S3.
 */
exports.adminRouter.post('/backup/run', auth_1.requireCeo, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    if (!process.env.BACKUP_S3_BUCKET) {
        return res.status(400).json({
            success: false,
            error: {
                code: 'BACKUP_NOT_CONFIGURED',
                message: 'BACKUP_S3_BUCKET environment variable is not set on the backend service. Ask the deployer to configure it.',
            },
        });
    }
    // Lazy-import so the module is not loaded at boot when backups are disabled.
    const { runDatabaseBackup } = await Promise.resolve().then(() => __importStar(require('../../jobs/workers/dbBackup.worker')));
    try {
        logger_1.logger.info({ userId: req.user?.userId }, 'Manual DB backup triggered');
        const filename = await runDatabaseBackup();
        return res.json({
            success: true,
            data: { filename, triggeredBy: req.user?.userId || null },
        });
    }
    catch (err) {
        logger_1.logger.error({ err: err.message }, 'Manual DB backup failed');
        return res.status(500).json({
            success: false,
            error: { code: 'BACKUP_FAILED', message: err.message || 'Backup failed' },
        });
    }
}));
