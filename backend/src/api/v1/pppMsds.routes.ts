import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import { requireOrgId } from '../middleware/tenant';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/errors';
import { assertCanManagePppMsds, toIpmActor } from '../../utils/ipmAccess';
import * as pppMsdsService from '../../services/pppMsds.service';

export const pppMsdsRouter = Router();

const uuidSchema = z.object({ attachmentId: z.string().uuid() });
const productIdSchema = z.object({ productId: z.string().uuid() });
const confirmSchema = z.object({
  batchId: z.string().uuid(),
  assignments: z.array(z.object({
    stagingId: z.string().uuid(),
    productId: z.string().uuid().nullable(),
  })),
});

const uploadZip = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = (file.originalname || '').toLowerCase();
    if (name.endsWith('.zip')) {
      cb(null, true);
      return;
    }
    cb(new Error('Please upload a .zip file'));
  },
}).single('file');

const uploadPdf = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = (file.originalname || '').toLowerCase();
    const mime = (file.mimetype || '').toLowerCase();
    if (name.endsWith('.pdf') || mime === 'application/pdf') {
      cb(null, true);
      return;
    }
    cb(new Error('Please upload a PDF file'));
  },
}).single('file');

function handleMulter(upload: typeof uploadZip) {
  return (req: Request, res: Response, next: NextFunction) => {
    upload(req, res, (err: unknown) => {
      if (err) {
        const message = err instanceof Error ? err.message : 'Upload failed';
        return res.status(400).json({
          success: false,
          error: { code: 'UPLOAD_ERROR', message },
        });
      }
      next();
    });
  };
}

function requirePppMsdsManager(req: AuthRequest, _res: Response, next: NextFunction) {
  try {
    assertCanManagePppMsds(toIpmActor(req.user!));
    next();
  } catch (error) {
    next(error);
  }
}

pppMsdsRouter.get(
  '/',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = await pppMsdsService.listPppMsds(requireOrgId(req));
    res.json({ success: true, data });
  }),
);

pppMsdsRouter.post(
  '/import-zip',
  requirePppMsdsManager,
  handleMulter(uploadZip),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const file = req.file;
    if (!file) throw new AppError('No zip file provided', 'NO_FILE', 400);
    const data = await pppMsdsService.importZip({
      organizationId: requireOrgId(req),
      uploadedBy: req.user!.userId,
      zipBuffer: file.buffer,
    });
    res.status(201).json({ success: true, data });
  }),
);

pppMsdsRouter.post(
  '/confirm',
  requirePppMsdsManager,
  validate({ body: confirmSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = await pppMsdsService.confirmImport({
      organizationId: requireOrgId(req),
      uploadedBy: req.user!.userId,
      batchId: req.body.batchId,
      assignments: req.body.assignments,
    });
    res.json({ success: true, data });
  }),
);

pppMsdsRouter.post(
  '/product/:productId',
  requirePppMsdsManager,
  validate({ params: productIdSchema }),
  handleMulter(uploadPdf),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const file = req.file;
    if (!file) throw new AppError('No PDF provided', 'NO_FILE', 400);
    const data = await pppMsdsService.addProductPdf({
      organizationId: requireOrgId(req),
      uploadedBy: req.user!.userId,
      productId: req.params.productId,
      originalName: file.originalname,
      buffer: file.buffer,
      mimeType: file.mimetype || 'application/pdf',
    });
    res.status(201).json({ success: true, data });
  }),
);

pppMsdsRouter.get(
  '/:attachmentId/file',
  validate({ params: uuidSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = await pppMsdsService.streamOrgPdf(requireOrgId(req), req.params.attachmentId);
    const download = String(req.query.download || '') === '1';
    const disposition = download ? 'attachment' : 'inline';
    res.setHeader('Content-Type', data.mimeType);
    res.setHeader('Content-Length', String(data.content.length));
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${encodeURIComponent(data.originalName)}"`,
    );
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(data.content);
  }),
);

pppMsdsRouter.delete(
  '/:attachmentId',
  requirePppMsdsManager,
  validate({ params: uuidSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = await pppMsdsService.deleteOrgPdf(requireOrgId(req), req.params.attachmentId);
    res.json({ success: true, data });
  }),
);
