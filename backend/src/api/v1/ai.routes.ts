import { Router, Response } from 'express';
import { z } from 'zod';
import { auth, AuthRequest } from '../middleware/auth';
import { requireOrgId } from '../middleware/tenant';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import * as agent from '../../services/ai/agent.service';
import * as settingsSvc from '../../services/systemSettings.service';

/**
 * AI assistant. Every signed-in user may use it; answers are limited to what
 * that user may see (organisation + sites). Read only.
 *   GET    /ai/status                       is it configured
 *   GET    /ai/conversations                the user's chats
 *   GET    /ai/conversations/:id/messages
 *   DELETE /ai/conversations/:id
 *   POST   /ai/ask   { conversationId?, text, lang? }
 */
export const aiRouter = Router();
aiRouter.use(auth);

const requester = (req: AuthRequest): agent.Requester => ({
  userId: req.user!.userId, role: req.user!.role, orgId: requireOrgId(req), name: (req.user as any)?.name || null,
});

aiRouter.get('/status', asyncHandler(async (_req: AuthRequest, res: Response) => {
  const cfg = await settingsSvc.getAIConfig();
  res.json({ success: true, data: { configured: cfg.hasKey || Boolean(process.env.ANTHROPIC_API_KEY), provider: cfg.provider, model: cfg.model } });
}));

aiRouter.get('/conversations', asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json({ success: true, data: await agent.listConversations(requester(req)) });
}));

const idParams = z.object({ id: z.string().uuid() });

aiRouter.get('/conversations/:id/messages', validate({ params: idParams }), asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json({ success: true, data: await agent.getMessages(requester(req), req.params.id) });
}));

aiRouter.delete('/conversations/:id', validate({ params: idParams }), asyncHandler(async (req: AuthRequest, res: Response) => {
  await agent.deleteConversation(requester(req), req.params.id);
  res.json({ success: true });
}));

const askSchema = z.object({
  conversationId: z.string().uuid().nullable().optional(),
  text: z.string().min(1).max(4000),
  lang: z.enum(['ar', 'en']).optional(),
});

aiRouter.post('/ask', validate({ body: askSchema }), asyncHandler(async (req: AuthRequest, res: Response) => {
  res.json({ success: true, data: await agent.ask(requester(req), req.body) });
}));
