import { Router } from 'express';
import { z } from 'zod';
import { MicrosoftAuthService } from '../../services/microsoft-auth.service';
import { validate } from '../middleware/validate';
import { config } from '../../config';

export const microsoftAuthRouter = Router();
const service = new MicrosoftAuthService();

// Check if Microsoft auth is available
microsoftAuthRouter.get('/status', (_req, res) => {
  res.json({
    success: true,
    data: {
      enabled: service.isConfigured(),
    },
  });
});

// Get authorization URL to start Microsoft login
microsoftAuthRouter.get('/login', async (req, res, next) => {
  try {
    if (!service.isConfigured()) {
      return res.status(501).json({
        success: false,
        error: { message: 'Microsoft authentication is not configured' },
      });
    }

    const redirectUri = config.microsoft.redirectUri || `${config.appUrl}/auth/microsoft/callback`;
    const state = req.query.state as string | undefined;
    
    const authUrl = await service.getAuthorizationUrl(redirectUri, state);
    
    res.json({
      success: true,
      data: { authUrl },
    });
  } catch (error) {
    next(error);
  }
});

// Handle OAuth callback from Microsoft
const callbackSchema = z.object({
  code: z.string().min(1, 'Authorization code is required'),
  state: z.string().optional(),
});

microsoftAuthRouter.post(
  '/callback',
  validate({ body: callbackSchema }),
  async (req, res, next) => {
    try {
      if (!service.isConfigured()) {
        return res.status(501).json({
          success: false,
          error: { message: 'Microsoft authentication is not configured' },
        });
      }

      const { code } = req.body;
      const redirectUri = config.microsoft.redirectUri || `${config.appUrl}/auth/microsoft/callback`;
      
      const result = await service.handleCallback(code, redirectUri);
      
      res.json({
        success: true,
        data: {
          user: result.user,
          accessToken: result.tokens.accessToken,
          refreshToken: result.tokens.refreshToken,
          expiresIn: result.tokens.expiresIn,
          isNewUser: result.isNewUser,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);
