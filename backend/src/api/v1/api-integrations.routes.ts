import { NextFunction, Request, Response, Router } from 'express';
import { auth, authorize, AuthRequest } from '../middleware/auth';
import * as apiIntService from '../../services/apiIntegration.service';

const apiIntegrationsRouter = Router();
apiIntegrationsRouter.use(auth);

// Weather autofill is used by the weather log entry page; keep it for the roles that had it.
// Must be registered before the integration-admin guard and before /:id routes.
apiIntegrationsRouter.get('/weather-autofill', authorize('ceo', 'farm_manager', 'operation_manager'), weatherAutofill);

/** Managing API integrations: CEO and operations manager only. */
export const requireIntegrationAdmin = authorize('ceo', 'operation_manager');
apiIntegrationsRouter.use(requireIntegrationAdmin);

// List integrations
apiIntegrationsRouter.get('/', async (req, res, next) => {
  try {
    const result = await apiIntService.listIntegrations({
      type: req.query.type as string,
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
    });
    res.json({ success: true, data: result.items, meta: result.meta });
  } catch (err) { next(err); }
});

// Weather autofill handler (route registered above the admin guard)
async function weatherAutofill(req: Request, res: Response, next: NextFunction) {
  try {
    const siteId = req.query.siteId as string;
    const date = (req.query.date as string) || new Date().toISOString().split('T')[0];
    if (!siteId) {
      res.status(400).json({ success: false, error: { message: 'siteId is required' } });
      return;
    }
    const data = await apiIntService.getWeatherAutofill(siteId, date);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

// Test unsaved connection (must be before /:id routes)
apiIntegrationsRouter.post('/test-unsaved', async (req, res, next) => {
  try {
    const { baseUrl } = req.body;
    if (!baseUrl || typeof baseUrl !== 'string') {
      return res.status(400).json({ success: false, error: { message: 'baseUrl is required' } });
    }
    let parsed: URL;
    try { parsed = new URL(baseUrl); } catch {
      return res.status(400).json({ success: false, error: { message: 'Invalid URL' } });
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return res.status(400).json({ success: false, error: { message: 'Only HTTP(S) URLs allowed' } });
    }
    const forbidden = ['localhost', '127.0.0.1', '0.0.0.0', '::1', '169.254.169.254', 'metadata.google.internal'];
    if (forbidden.some(h => parsed.hostname === h || parsed.hostname.endsWith('.internal'))) {
      return res.status(400).json({ success: false, error: { message: 'Internal URLs not allowed' } });
    }
    const result = await apiIntService.testConnectionUnsaved(req.body);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// Get single integration with fields
apiIntegrationsRouter.get('/:id', async (req, res, next) => {
  try {
    const item = await apiIntService.getIntegration(req.params.id);
    res.json({ success: true, data: item });
  } catch (err) { next(err); }
});

// Create integration
apiIntegrationsRouter.post('/', async (req: AuthRequest, res, next) => {
  try {
    const item = await apiIntService.createIntegration({ ...req.body, createdBy: req.user!.userId });
    res.status(201).json({ success: true, data: item });
  } catch (err) { next(err); }
});

// Update integration
apiIntegrationsRouter.put('/:id', async (req, res, next) => {
  try {
    const item = await apiIntService.updateIntegration(req.params.id, req.body);
    res.json({ success: true, data: item });
  } catch (err) { next(err); }
});

// Delete integration
apiIntegrationsRouter.delete('/:id', async (req, res, next) => {
  try {
    await apiIntService.deleteIntegration(req.params.id);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// Duplicate integration
apiIntegrationsRouter.post('/:id/duplicate', async (req, res, next) => {
  try {
    const item = await apiIntService.duplicateIntegration(req.params.id);
    res.status(201).json({ success: true, data: item });
  } catch (err) { next(err); }
});

// Test connection
apiIntegrationsRouter.post('/:id/test', async (req, res, next) => {
  try {
    const result = await apiIntService.testConnection(req.params.id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// Manual sync (auto-dispatches to weather or soil based on type)
apiIntegrationsRouter.post('/:id/sync', async (req, res, next) => {
  try {
    const result = await apiIntService.syncIntegration(req.params.id, 'manual');
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// Sync history
apiIntegrationsRouter.get('/:id/sync-history', async (req, res, next) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    const history = await apiIntService.getSyncHistory(req.params.id, limit);
    res.json({ success: true, data: history });
  } catch (err) { next(err); }
});

// List assigned fields
apiIntegrationsRouter.get('/:id/fields', async (req, res, next) => {
  try {
    const fields = await apiIntService.getIntegrationFields(req.params.id);
    res.json({ success: true, data: fields });
  } catch (err) { next(err); }
});

// Assign fields
apiIntegrationsRouter.post('/:id/fields', async (req, res, next) => {
  try {
    const results = await apiIntService.assignFields(req.params.id, req.body.assignments || []);
    res.status(201).json({ success: true, data: results });
  } catch (err) { next(err); }
});

// Remove field assignment
apiIntegrationsRouter.delete('/:id/fields/:fieldId', async (req, res, next) => {
  try {
    await apiIntService.removeFieldAssignment(req.params.id, req.params.fieldId);
    res.json({ success: true });
  } catch (err) { next(err); }
});

export { apiIntegrationsRouter };
