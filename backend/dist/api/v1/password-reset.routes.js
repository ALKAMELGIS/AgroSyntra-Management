"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.passwordResetRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const user_repository_1 = require("../../repositories/user.repository");
const email_service_1 = require("../../services/email.service");
const validate_1 = require("../middleware/validate");
const errors_1 = require("../../utils/errors");
exports.passwordResetRouter = (0, express_1.Router)();
const userRepository = new user_repository_1.UserRepository();
const emailService = new email_service_1.EmailService();
const SALT_ROUNDS = 12;
// Request password reset
const requestResetSchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email format'),
});
exports.passwordResetRouter.post('/request', (0, validate_1.validate)({ body: requestResetSchema }), async (req, res, next) => {
    try {
        const { email } = req.body;
        const user = await userRepository.findByEmail(email);
        // Always return success to prevent email enumeration
        if (!user) {
            return res.json({
                success: true,
                data: { message: 'If an account exists, a reset link has been sent' },
            });
        }
        // Check if user has a password (not SSO-only)
        if (!user.passwordHash) {
            return res.json({
                success: true,
                data: { message: 'If an account exists, a reset link has been sent' },
            });
        }
        // Generate reset token
        const resetToken = await userRepository.createPasswordResetToken(user.id);
        // Send email
        await emailService.sendPasswordResetEmail(user.email, resetToken, user.name);
        res.json({
            success: true,
            data: { message: 'If an account exists, a reset link has been sent' },
        });
    }
    catch (error) {
        next(error);
    }
});
// Verify reset token (check if valid)
const verifyTokenSchema = zod_1.z.object({
    token: zod_1.z.string().min(1, 'Token is required'),
});
exports.passwordResetRouter.post('/verify', (0, validate_1.validate)({ body: verifyTokenSchema }), async (req, res, next) => {
    try {
        const { token } = req.body;
        const tokenData = await userRepository.findPasswordResetToken(token);
        if (!tokenData) {
            return res.status(400).json({
                success: false,
                error: { message: 'Invalid or expired reset token' },
            });
        }
        res.json({
            success: true,
            data: { valid: true },
        });
    }
    catch (error) {
        next(error);
    }
});
// Reset password with token
const resetPasswordSchema = zod_1.z.object({
    token: zod_1.z.string().min(1, 'Token is required'),
    password: zod_1.z.string().min(8, 'Password must be at least 8 characters'),
});
exports.passwordResetRouter.post('/reset', (0, validate_1.validate)({ body: resetPasswordSchema }), async (req, res, next) => {
    try {
        const { token, password } = req.body;
        // Verify token
        const tokenData = await userRepository.findPasswordResetToken(token);
        if (!tokenData) {
            throw new errors_1.AppError('Invalid or expired reset token', 'INVALID_TOKEN', 400);
        }
        // Hash new password
        const passwordHash = await bcryptjs_1.default.hash(password, SALT_ROUNDS);
        // Update password
        await userRepository.updatePassword(tokenData.userId, passwordHash);
        // Mark token as used
        await userRepository.markPasswordResetTokenUsed(token);
        // Revoke all existing sessions
        await userRepository.revokeAllUserTokens(tokenData.userId);
        res.json({
            success: true,
            data: { message: 'Password has been reset successfully' },
        });
    }
    catch (error) {
        next(error);
    }
});
