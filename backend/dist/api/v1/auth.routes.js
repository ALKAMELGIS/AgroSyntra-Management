"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_service_1 = require("../../services/auth.service");
const validate_1 = require("../middleware/validate");
const auth_1 = require("../middleware/auth");
const rateLimit_1 = require("../middleware/rateLimit");
exports.authRouter = (0, express_1.Router)();
const service = new auth_service_1.AuthService();
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
const registerSchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email format'),
    password: zod_1.z.string().min(8, 'Password must be at least 8 characters'),
    name: zod_1.z.string().min(1, 'Name is required'),
    inviteToken: zod_1.z.string().min(16).optional(),
});
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email format'),
    password: zod_1.z.string().min(1, 'Password is required'),
});
const refreshSchema = zod_1.z.object({
    refreshToken: zod_1.z.string().min(1, 'Refresh token is required'),
});
const pinLoginSchema = zod_1.z.object({
    employeeId: zod_1.z.string().min(1),
    pin: zod_1.z.string().min(1),
});
// Register new user (rate-limited)
exports.authRouter.post('/register', rateLimit_1.authLimiter, (0, validate_1.validate)({ body: registerSchema }), async (req, res, next) => {
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
    }
    catch (error) {
        next(error);
    }
});
// Login (rate-limited)
exports.authRouter.post('/login', rateLimit_1.authLimiter, (0, validate_1.validate)({ body: loginSchema }), async (req, res, next) => {
    try {
        const { email, password } = req.body;
        const { user, tokens } = await service.login(email, password);
        res.json({
            success: true,
            data: { user, ...tokens },
        });
    }
    catch (error) {
        next(error);
    }
});
// Field staff PIN login (scouters & operators)
exports.authRouter.post('/pin-login', rateLimit_1.authLimiter, (0, validate_1.validate)({ body: pinLoginSchema }), async (req, res, next) => {
    try {
        const { employeeId, pin } = req.body;
        const { user, tokens } = await service.pinLogin(employeeId, pin);
        res.json({
            success: true,
            data: { user, ...tokens },
        });
    }
    catch (error) {
        next(error);
    }
});
// Refresh tokens
exports.authRouter.post('/refresh', (0, validate_1.validate)({ body: refreshSchema }), async (req, res, next) => {
    try {
        const { refreshToken } = req.body;
        const tokens = await service.refreshTokens(refreshToken);
        res.json({
            success: true,
            data: tokens,
        });
    }
    catch (error) {
        next(error);
    }
});
// Get current user
exports.authRouter.get('/me', auth_1.auth, async (req, res, next) => {
    try {
        const user = await service.getMe(req.user.userId);
        res.json({
            success: true,
            data: user,
        });
    }
    catch (error) {
        next(error);
    }
});
// Logout (revoke refresh token)
exports.authRouter.post('/logout', (0, validate_1.validate)({ body: refreshSchema }), async (req, res, next) => {
    try {
        const { refreshToken } = req.body;
        await service.logout(refreshToken);
        res.json({
            success: true,
            data: { message: 'Logged out successfully' },
        });
    }
    catch (error) {
        next(error);
    }
});
// Logout from all devices
exports.authRouter.post('/logout-all', auth_1.auth, async (req, res, next) => {
    try {
        await service.logoutAll(req.user.userId);
        res.json({
            success: true,
            data: { message: 'Logged out from all devices' },
        });
    }
    catch (error) {
        next(error);
    }
});
