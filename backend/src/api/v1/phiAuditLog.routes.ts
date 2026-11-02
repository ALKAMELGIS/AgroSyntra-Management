import { Router, Response } from 'express';
import { AuthRequest, auth, requirePhiAuditReviewer } from '../middleware/auth';
import {
  getPhiConflicts,
  acknowledgeConflict,
  getPhiConflictCounts,
  badgeCountForRole,
} from '../../services/phiAuditLog.service';
import { requireOrgId } from '../middleware/tenant';

export const phiAuditLogRouter = Router();
phiAuditLogRouter.use(auth);

phiAuditLogRouter.get('/unreviewed-count', async (req: AuthRequest, res: Response, next) => {
  try {
    const siteId = req.query.siteId as string | undefined;
    const counts = await getPhiConflictCounts(requireOrgId(req), siteId);
    const badgeCount = badgeCountForRole(req.user?.role, counts);
    res.json({ success: true, data: { ...counts, badgeCount } });
  } catch (error) {
    next(error);
  }
});

phiAuditLogRouter.get('/', async (req: AuthRequest, res: Response, next) => {
  try {
    const { siteId, fieldId, dateFrom, dateTo, status, severity } = req.query as Record<string, string | undefined>;
    const data = await getPhiConflicts({
      organizationId: requireOrgId(req),
      siteId,
      fieldId,
      dateFrom,
      dateTo,
      status,
      severity,
    });

    const filtered = data.filter((row) => {
      if (status && status !== 'all' && row.status !== status) return false;
      if (severity && severity !== 'all' && row.severity !== severity) return false;
      return true;
    });

    res.json({ success: true, data: filtered });
  } catch (error) {
    next(error);
  }
});

phiAuditLogRouter.put('/:id/acknowledge', requirePhiAuditReviewer, async (req: AuthRequest, res: Response, next) => {
  try {
    const { id } = req.params;
    const [harvestId, applicationId] = id.split(':');
    if (!harvestId || !applicationId) {
      return res.status(400).json({ success: false, message: 'Invalid conflict ID format' });
    }

    const { status, notes } = req.body;
    if (!status || !['acknowledged', 'justified'].includes(status)) {
      return res.status(400).json({ success: false, message: 'status must be acknowledged or justified' });
    }

    await acknowledgeConflict(
      harvestId,
      applicationId,
      req.user!.userId,
      req.user!.role,
      status as 'acknowledged' | 'justified',
      notes,
    );
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});
