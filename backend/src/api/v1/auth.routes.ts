import { Router } from 'express';
import { z } from 'zod';
import { AuthService } from '../../services/auth.service';
import { validate } from '../middleware/validate';
import { auth, AuthRequest } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimit';

export const authRouter = Router();
const service = new AuthService();

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, name]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 8
 *               name:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [ceo, farm_manager, operation_manager, agronomist, worker]
 *     responses:
 *       201:
 *         description: User registered successfully
 *       409:
 *         description: Email already registered
 */

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login with email and password
 *     tags: [Authentication]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 *       429:
 *         description: Too many login attempts
 */

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags: [Authentication]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Tokens refreshed
 *       401:
 *         description: Invalid refresh token
 */

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Get current user profile
 *     tags: [Authentication]
 *     responses:
 *       200:
 *         description: User profile
 *       401:
 *         description: Not authenticated
 */

const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1, 'Name is required'),
  inviteToken: z.string().min(16).optional(),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

const pinLoginSchema = z.object({
  employeeId: z.string().min(1),
  pin: z.string().min(1),
});

// Register new user (rate-limited)
authRouter.post(
  '/register',
  authLimiter,
  validate({ body: registerSchema }),
  async (req, res, next) => {
    try {
      const { role, inviteToken, ...safeBody } = req.body;
      const { user, tokens } = await service.register({
        ...safeBody,
        inviteToken,
      });
      res.status(201).json({
        success: true,
        data: { user, ...tokens },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Login (rate-limited)
authRouter.post(
  '/login',
  authLimiter,
  validate({ body: loginSchema }),
  async (req, res, next) => {
    try {
      const { email, password } = req.body;
      const { user, tokens } = await service.login(email, password);
      res.json({
        success: true,
        data: { user, ...tokens },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Field staff PIN login (scouters & operators)
authRouter.post(
  '/pin-login',
  authLimiter,
  validate({ body: pinLoginSchema }),
  async (req, res, next) => {
    try {
      const { employeeId, pin } = req.body;
      const { user, tokens } = await service.pinLogin(employeeId, pin);
      res.json({
        success: true,
        data: { user, ...tokens },
      });
    } catch (error) {
      next(error);
    }
  },
);

// Refresh tokens
authRouter.post(
  '/refresh',
  validate({ body: refreshSchema }),
  async (req, res, next) => {
    try {
      const { refreshToken } = req.body;
      const tokens = await service.refreshTokens(refreshToken);
      res.json({
        success: true,
        data: tokens,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get current user
authRouter.get('/me', auth, async (req: AuthRequest, res, next) => {
  try {
    const user = await service.getMe(req.user!.userId);
    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
});

// Logout (revoke refresh token)
authRouter.post(
  '/logout',
  validate({ body: refreshSchema }),
  async (req, res, next) => {
    try {
      const { refreshToken } = req.body;
      await service.logout(refreshToken);
      res.json({
        success: true,
        data: { message: 'Logged out successfully' },
      });
    } catch (error) {
      next(error);
    }
  }
);

// Logout from all devices
authRouter.post('/logout-all', auth, async (req: AuthRequest, res, next) => {
  try {
    await service.logoutAll(req.user!.userId);
    res.json({
      success: true,
      data: { message: 'Logged out from all devices' },
    });
  } catch (error) {
    next(error);
  }
});
