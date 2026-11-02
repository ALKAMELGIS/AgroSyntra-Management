import { Router, Response, NextFunction } from 'express';
import { auth, authorize, AuthRequest } from '../middleware/auth';
import { requireOrgId } from '../middleware/tenant';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError, NotFoundError } from '../../utils/errors';
import { uploadSingle } from '../middleware/upload';
import { deleteFile, readStoredFile, uploadFile } from '../../services/storage.service';
import {
  getOrganizationById,
  listOrganizationMembers,
  updateOrganization,
} from '../../services/organization.service';

const LOGO_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** Organization logo upload: CEO and farm manager only. */
export const requireLogoUploader = authorize('ceo', 'farm_manager');

const organizationRouter = Router();
organizationRouter.use(auth);

/** GET /organization - current user's organization */
organizationRouter.get('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const orgId = requireOrgId(req);
  const org = await getOrganizationById(orgId);
  res.json({ success: true, data: org });
}));

/** GET /organization/logo - raw image bytes (not JSON) */
organizationRouter.get('/logo', asyncHandler(async (req: AuthRequest, res: Response) => {
  const orgId = requireOrgId(req);
  const org = await getOrganizationById(orgId);
  const key = org.settings?.logo_storage_key;
  if (typeof key !== 'string' || !key) {
    throw new NotFoundError('Logo not found');
  }
  const file = await readStoredFile(key);
  if (!file) {
    throw new NotFoundError('Logo not found');
  }
  res.setHeader('Content-Type', file.mimeType || 'image/png');
  res.setHeader('Content-Length', String(file.content.length));
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.send(file.content);
}));

/** POST /organization/logo - upload org logo (CEO and farm manager only) */
organizationRouter.post(
  '/logo',
  requireLogoUploader,
  (req: AuthRequest, res: Response, next: NextFunction) => {
    uploadSingle(req, res, (err: unknown) => {
      if (err) {
        const message = err instanceof Error ? err.message : 'Upload failed';
        return res.status(400).json({
          success: false,
          error: { code: 'UPLOAD_ERROR', message },
        });
      }
      next();
    });
  },
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.file) {
      throw new AppError('No file provided', 'NO_FILES', 400);
    }
    if (!LOGO_MIMES.has(req.file.mimetype)) {
      throw new AppError('Logo must be a JPG, PNG, or WebP image', 'INVALID_FILE_TYPE', 400);
    }
    const orgId = requireOrgId(req);
    const org = await getOrganizationById(orgId);
    const oldKey = org.settings?.logo_storage_key;
    const uploaded = await uploadFile(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      'org-logo',
    );
    if (typeof oldKey === 'string' && oldKey) {
      try {
        await deleteFile(oldKey);
      } catch {
        // Previous file may already be gone
      }
    }
    const updated = await updateOrganization(orgId, {
      settings: {
        logo_url: uploaded.url,
        logo_storage_key: uploaded.storageKey,
      },
    });
    res.status(201).json({
      success: true,
      data: { logo_url: updated.settings.logo_url },
    });
  }),
);

/** PUT /organization - update organization (CEO only) */
organizationRouter.put('/', authorize('ceo'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const orgId = requireOrgId(req);
  const { name, settings } = req.body;
  const org = await updateOrganization(orgId, { name, settings });
  res.json({ success: true, data: org });
}));

/** GET /organization/members - org members only */
organizationRouter.get('/members', asyncHandler(async (req: AuthRequest, res: Response) => {
  const orgId = requireOrgId(req);
  const members = await listOrganizationMembers(orgId);
  res.json({ success: true, data: members });
}));

export { organizationRouter };
