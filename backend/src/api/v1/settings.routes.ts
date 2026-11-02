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

export { settingsRouter };
