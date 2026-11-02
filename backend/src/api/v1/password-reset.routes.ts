import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { UserRepository } from '../../repositories/user.repository';
import { EmailService } from '../../services/email.service';
import { validate } from '../middleware/validate';
import { AppError } from '../../utils/errors';

export const passwordResetRouter = Router();
const userRepository = new UserRepository();
const emailService = new EmailService();

const SALT_ROUNDS = 12;

// Request password reset
const requestResetSchema = z.object({
  email: z.string().email('Invalid email format'),
});

passwordResetRouter.post(
  '/request',
  validate({ body: requestResetSchema }),
  async (req, res, next) => {
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
    } catch (error) {
      next(error);
    }
  }
);

// Verify reset token (check if valid)
const verifyTokenSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

passwordResetRouter.post(
  '/verify',
  validate({ body: verifyTokenSchema }),
  async (req, res, next) => {
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
    } catch (error) {
      next(error);
    }
  }
);

// Reset password with token
const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

passwordResetRouter.post(
  '/reset',
  validate({ body: resetPasswordSchema }),
  async (req, res, next) => {
    try {
      const { token, password } = req.body;
      
      // Verify token
      const tokenData = await userRepository.findPasswordResetToken(token);
      if (!tokenData) {
        throw new AppError('Invalid or expired reset token', 'INVALID_TOKEN', 400);
      }

      // Hash new password
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

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
    } catch (error) {
      next(error);
    }
  }
);
