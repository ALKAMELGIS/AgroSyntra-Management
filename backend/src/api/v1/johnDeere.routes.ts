import { Router } from 'express';
import { auth, authorize, AuthRequest } from '../middleware/auth';
import { requireOrgId } from '../middleware/tenant';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import * as jd from '../../services/johnDeere.service';

/**
 * John Deere Operations Center connection.
 *   GET  /status                 connection state (no secrets)
 *   PUT  /settings               environment, Client ID, secret, redirect URI
 *   POST /authorize              -> { url } to John Deere sign-in
 *   GET  /callback               (public) John Deere redirects here after sign-in
 *   GET  /organizations          Operations Center organizations (+ share links)
 *   PUT  /organization           choose one
 *   GET  /fields                 Deere fields + links to AgroCloud fields
 *   PUT  /field-mapping          save links
 *   POST /sync                   read field operations
 *   GET  /operations             operations read into AgroCloud
 *   POST /disconnect
 */
export const johnDeereRouter = Router();

const pageUrl = (q: string) => `${config.appUrl.replace(/\/$/, '')}/admin/integrations/john-deere?${q}`;

// Public: the browser comes back from signin.johndeere.com with ?code&state (no AgroCloud token on this request).
johnDeereRouter.get('/callback', async (req, res) => {
  const { code, state, error, error_description: desc } = req.query as Record<string, string>;
  if (error) return res.redirect(pageUrl(`error=${encodeURIComponent(desc || error)}`));
  try {
    await jd.completeAuthorization(String(state || ''), String(code || ''));
    return res.redirect(pageUrl('connected=1'));
  } catch (e) {
    logger.warn({ error: (e as Error).message }, 'John Deere sign-in callback failed');
    return res.redirect(pageUrl(`error=${encodeURIComponent((e as Error).message)}`));
  }
});

johnDeereRouter.use(auth, authorize('ceo', 'operation_manager'));

const send = (fn: (req: AuthRequest) => Promise<unknown>) => async (req: AuthRequest, res: any, next: any) => {
  try {
    res.json({ success: true, data: await fn(req) });
  } catch (e) {
    if (e instanceof jd.JohnDeereError) {
      return res.status(e.status).json({ success: false, error: { code: e.code, message: e.message } });
    }
    if ((e as any)?.name === 'JohnDeereApiError') {
      const status = (e as any).status;
      return res.status(502).json({ success: false, error: { code: 'JOHN_DEERE_API', status, message: (e as Error).message } });
    }
    return next(e);
  }
};

johnDeereRouter.get('/status', send((req) => jd.getStatus(requireOrgId(req))));
johnDeereRouter.put('/settings', send((req) => jd.saveSettings(requireOrgId(req), req.body || {})));
johnDeereRouter.post('/authorize', send((req) => jd.startAuthorization(requireOrgId(req), req.user?.userId)));
johnDeereRouter.get('/organizations', send((req) => jd.listOrganizations(requireOrgId(req))));
johnDeereRouter.put('/organization', send((req) => jd.selectOrganization(requireOrgId(req), req.body?.id, req.body?.name)));
johnDeereRouter.get('/fields', send((req) => jd.listFieldsWithMapping(requireOrgId(req))));
johnDeereRouter.put('/field-mapping', send((req) => jd.saveFieldMapping(requireOrgId(req), req.body?.mapping || {})));
johnDeereRouter.post('/sync', send((req) => jd.syncFieldOperations(requireOrgId(req), req.body || {})));
johnDeereRouter.get('/operations', send((req) => jd.listOperations(requireOrgId(req), req.query as any)));
johnDeereRouter.post('/disconnect', send((req) => jd.disconnect(requireOrgId(req))));
