import { Router, Response } from 'express';
import { z } from 'zod';
import { auth, authorize, AuthRequest } from '../middleware/auth';
import * as settings from '../../services/systemSettings.service';

const settingsRouter = Router();
settingsRouter.use(auth);
settingsRouter.use(authorize('ceo', 'farm_manager'));
/** Changing, removing or testing the AI / OpenWeather keys: CEO only (farm manager may only view). */
export const requireKeyAdmin = authorize('ceo');

settingsRouter.get('/ai', async (req: AuthRequest, res: Response, next) => {
  try {
    const config = await settings.getAIConfig();
    res.json({ success: true, data: config });
  } catch (e) { next(e); }
});

const aiConfigSchema = z.object({
  provider: z.enum(['anthropic', 'openai']),
  model: z.string().min(1),
  apiKey: z.string().optional(),
});

settingsRouter.put('/ai', requireKeyAdmin, async (req: AuthRequest, res: Response, next) => {
  try {
    const body = aiConfigSchema.parse(req.body);
    await settings.setAIConfig(body.provider, body.model, body.apiKey, req.user!.userId);
    const config = await settings.getAIConfig();
    res.json({ success: true, data: config });
  } catch (e) { next(e); }
});

settingsRouter.delete('/ai/key', requireKeyAdmin, async (req: AuthRequest, res: Response, next) => {
  try {
    await settings.remove('ai_api_key');
    res.json({ success: true });
  } catch (e) { next(e); }
});

const testSchema = z.object({
  provider: z.enum(['anthropic', 'openai']),
  model: z.string().min(1),
  apiKey: z.string().min(1),
});

settingsRouter.post('/ai/test', requireKeyAdmin, async (req: AuthRequest, res: Response, next) => {
  try {
    const body = testSchema.parse(req.body);
    let keyToTest = body.apiKey;
    if (keyToTest === 'USE_SAVED') {
      const saved = await settings.getAIKey();
      if (!saved) { res.json({ success: true, data: { success: false, message: 'No saved key found' } }); return; }
      keyToTest = saved;
    }
    const result = await settings.testAIConnection(body.provider, body.model, keyToTest);
    res.json({ success: true, data: result });
  } catch (e) { next(e); }
});

settingsRouter.get('/openweather', async (req: AuthRequest, res: Response, next) => {
  try {
    const config = await settings.getOpenWeatherConfig();
    res.json({ success: true, data: config });
  } catch (e) { next(e); }
});

const openWeatherConfigSchema = z.object({
  apiKey: z.string().optional(),
});

settingsRouter.put('/openweather', requireKeyAdmin, async (req: AuthRequest, res: Response, next) => {
  try {
    const body = openWeatherConfigSchema.parse(req.body);
    if (body.apiKey) {
      await settings.setOpenWeatherKey(body.apiKey, req.user!.userId);
    }
    const config = await settings.getOpenWeatherConfig();
    res.json({ success: true, data: config });
  } catch (e) { next(e); }
});

settingsRouter.delete('/openweather/key', requireKeyAdmin, async (req: AuthRequest, res: Response, next) => {
  try {
    await settings.remove('openweather_api_key');
    res.json({ success: true });
  } catch (e) { next(e); }
});

const openWeatherTestSchema = z.object({
  apiKey: z.string().min(1),
});

settingsRouter.post('/openweather/test', requireKeyAdmin, async (req: AuthRequest, res: Response, next) => {
  try {
    const body = openWeatherTestSchema.parse(req.body);
    let keyToTest = body.apiKey;
    if (keyToTest === 'USE_SAVED') {
      const saved = await settings.getOpenWeatherKey();
      if (!saved) { res.json({ success: true, data: { success: false, message: 'No saved key found' } }); return; }
      keyToTest = saved;
    }
    const result = await settings.testOpenWeatherConnection(keyToTest);
    res.json({ success: true, data: result });
  } catch (e) { next(e); }
});

// ── Satellite imagery configuration (Sentinel Hub / Copernicus) ─────────────
settingsRouter.get('/sentinelhub', async (_req: AuthRequest, res: Response, next) => {
  try {
    res.json({ success: true, data: await settings.getSentinelConfig() });
  } catch (e) { next(e); }
});

const sentinelSchema = z.object({
  instanceId: z.string().optional(),
  service: z.enum(['sentinel-hub', 'copernicus']).default('sentinel-hub'),
  label: z.string().max(120).optional(),
});

settingsRouter.post('/sentinelhub/test', requireKeyAdmin, async (req: AuthRequest, res: Response, next) => {
  try {
    const body = sentinelSchema.parse(req.body);
    let id = (body.instanceId || '').trim();
    if (!id || id === 'USE_SAVED') id = (await settings.resolveSentinel())?.instanceId || '';
    res.json({ success: true, data: await settings.testSentinelConnection(id, body.service) });
  } catch (e) { next(e); }
});

/** Saves only after a successful check, with the service that answered. */
settingsRouter.put('/sentinelhub', requireKeyAdmin, async (req: AuthRequest, res: Response, next) => {
  try {
    const body = sentinelSchema.parse(req.body);
    const id = (body.instanceId || '').trim();
    if (!settings.isSentinelInstanceId(id)) {
      res.status(400).json({ success: false, error: { message: 'The configuration ID must be a UUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)' } });
      return;
    }
    const test = await settings.testSentinelConnection(id, body.service);
    if (!test.success) { res.status(400).json({ success: false, error: { message: test.message } }); return; }
    await settings.setSentinelConfig(id, test.service, body.label ?? null, req.user!.userId, settings.pickBaseLayer(test.layers));
    res.json({ success: true, data: { ...(await settings.getSentinelConfig()), layers: test.layers } });
  } catch (e) { next(e); }
});

settingsRouter.delete('/sentinelhub', requireKeyAdmin, async (_req: AuthRequest, res: Response, next) => {
  try {
    await settings.remove('sentinelhub_instance_id');
    res.json({ success: true });
  } catch (e) { next(e); }
});

export { settingsRouter };
