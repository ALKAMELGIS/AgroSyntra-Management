import { Router, Response } from 'express';
import { z } from 'zod';
import { auth, requireCeo, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { logger } from '../../utils/logger';
import { isSuperAdminEmail } from '../../utils/superAdmin';
import { AppError } from '../../utils/errors';
import {
  createOrganization,
  createOrganizationInvite,
  listOrganizations,
  seedMinimalOrgStructure,
} from '../../services/organization.service';
import { config } from '../../config';

export const adminRouter = Router();

adminRouter.use(auth);

function requireSuperAdmin(req: AuthRequest, _res: Response, next: (err?: unknown) => void) {
  if (!req.user || !isSuperAdminEmail(req.user.email)) {
    return next(new AppError('Super admin access required', 'FORBIDDEN', 403));
  }
  next();
}

const createOrgSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(2).max(80).optional(),
  ownerEmail: z.string().email(),
  ownerRole: z.enum(['ceo', 'farm_manager', 'operation_manager']).default('farm_manager'),
  seedSite: z.boolean().optional(),
});

/**
 * GET /admin/organizations — list all orgs (super-admin only)
 */
adminRouter.get(
  '/organizations',
  requireSuperAdmin,
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    const orgs = await listOrganizations();
    res.json({ success: true, data: orgs });
  }),
);

/**
 * POST /admin/organizations — create org + invite link for owner (super-admin only)
 */
adminRouter.post(
  '/organizations',
  requireSuperAdmin,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const body = createOrgSchema.parse(req.body);
    const org = await createOrganization({ name: body.name, slug: body.slug });
    let seeded = null;
    if (body.seedSite) {
      seeded = await seedMinimalOrgStructure(org.id);
    }
    const invite = await createOrganizationInvite({
      organizationId: org.id,
      email: body.ownerEmail,
      role: body.ownerRole,
      createdBy: req.user!.userId,
    });
    const registerUrl = `${config.appUrl.replace(/\/$/, '')}/register?invite=${invite.inviteToken}`;
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
  }),
);

/**
 * GET /admin/observability
 * Report which production-safety integrations are configured, without
 * leaking any secrets. Used by the admin UI to show green/amber badges.
 */
adminRouter.get(
  '/observability',
  requireCeo,
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    const { getActiveProvider } = await import('../../services/storage.service');
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
  }),
);

/**
 * GET /admin/backup/status
 * Report whether backup env vars are configured and show any in-flight run.
 * Useful for the UI to show a green/amber/red indicator without exposing secrets.
 */
adminRouter.get(
  '/backup/status',
  requireCeo,
  asyncHandler(async (_req: AuthRequest, res: Response) => {
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
  }),
);

/**
 * POST /admin/backup/run
 * Triggers a pg_dump immediately. Runs in the current request's process —
 * keep it behind ceo-only because it streams the full DB to S3.
 */
adminRouter.post(
  '/backup/run',
  requireCeo,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!process.env.BACKUP_S3_BUCKET) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'BACKUP_NOT_CONFIGURED',
          message:
            'BACKUP_S3_BUCKET environment variable is not set on the backend service. Ask the deployer to configure it.',
        },
      });
    }

    // Lazy-import so the module is not loaded at boot when backups are disabled.
    const { runDatabaseBackup } = await import('../../jobs/workers/dbBackup.worker');
    try {
      logger.info({ userId: req.user?.userId }, 'Manual DB backup triggered');
      const filename = await runDatabaseBackup();
      return res.json({
        success: true,
        data: { filename, triggeredBy: req.user?.userId || null },
      });
    } catch (err: any) {
      logger.error({ err: err.message }, 'Manual DB backup failed');
      return res.status(500).json({
        success: false,
        error: { code: 'BACKUP_FAILED', message: err.message || 'Backup failed' },
      });
    }
  }),
);
