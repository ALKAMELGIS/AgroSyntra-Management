import nodemailer from 'nodemailer';
import { config } from '../config';
import { logger } from '../utils/logger';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export class EmailService {
  private transporter: nodemailer.Transporter | null = null;

  private getTransporter(): nodemailer.Transporter {
    if (!this.transporter) {
      if (!config.email.host || !config.email.user) {
        logger.warn('Email not configured, using console output');
        // Return a mock transporter for development
        return {
          sendMail: async (options: any) => {
            logger.info({ to: options.to, subject: options.subject }, 'Email (mock):');
            logger.info(options.text || options.html);
            return { messageId: 'mock-' + Date.now() };
          },
        } as any;
      }

      this.transporter = nodemailer.createTransport({
        host: config.email.host,
        port: config.email.port,
        secure: config.email.secure,
        auth: {
          user: config.email.user,
          pass: config.email.pass,
        },
      });
    }
    return this.transporter;
  }

  async sendEmail(options: EmailOptions): Promise<void> {
    const transporter = this.getTransporter();
    
    try {
      await transporter.sendMail({
        from: config.email.from,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });
      logger.info({ to: options.to, subject: options.subject }, 'Email sent');
    } catch (error) {
      logger.error({ error, to: options.to }, 'Failed to send email');
      throw error;
    }
  }

  async sendPasswordResetEmail(email: string, resetToken: string, userName: string): Promise<void> {
    const resetUrl = `${config.appUrl}/reset-password?token=${resetToken}`;
    
    await this.sendEmail({
      to: email,
      subject: 'Reset your Al Maha Farm password',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #2b6f4a;">Password Reset</h1>
          <p>Hi ${userName},</p>
          <p>You requested to reset your password for Al Maha Farm. Click the button below to reset it:</p>
          <p style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" 
               style="background-color: #2b6f4a; color: white; padding: 12px 30px; 
                      text-decoration: none; border-radius: 6px; display: inline-block;">
              Reset Password
            </a>
          </p>
          <p>Or copy this link: <a href="${resetUrl}">${resetUrl}</a></p>
          <p>This link will expire in 1 hour.</p>
          <p>If you didn't request this, please ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
          <p style="color: #666; font-size: 12px;">Al Maha Farm Management System</p>
        </div>
      `,
      text: `Hi ${userName},\n\nYou requested to reset your password. Click this link to reset it:\n\n${resetUrl}\n\nThis link will expire in 1 hour.\n\nIf you didn't request this, please ignore this email.`,
    });
  }

  async sendWelcomeEmail(email: string, userName: string): Promise<void> {
    await this.sendEmail({
      to: email,
      subject: 'Welcome to Al Maha Farm',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #2b6f4a;">Welcome to Al Maha Farm!</h1>
          <p>Hi ${userName},</p>
          <p>Your account has been created successfully. You can now sign in to access the farm management system.</p>
          <p style="text-align: center; margin: 30px 0;">
            <a href="${config.appUrl}/login" 
               style="background-color: #2b6f4a; color: white; padding: 12px 30px; 
                      text-decoration: none; border-radius: 6px; display: inline-block;">
              Sign In
            </a>
          </p>
          <p>If you have any questions, contact your administrator.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
          <p style="color: #666; font-size: 12px;">Al Maha Farm Management System</p>
        </div>
      `,
      text: `Hi ${userName},\n\nWelcome to Al Maha Farm! Your account has been created successfully.\n\nSign in at: ${config.appUrl}/login`,
    });
  }

  async sendAlertEmail(email: string, userName: string, alertTitle: string, alertMessage: string): Promise<void> {
    await this.sendEmail({
      to: email,
      subject: `[Alert] ${alertTitle}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #f59e0b;">⚠️ ${alertTitle}</h1>
          <p>Hi ${userName},</p>
          <p>${alertMessage}</p>
          <p style="text-align: center; margin: 30px 0;">
            <a href="${config.appUrl}/dashboard" 
               style="background-color: #2b6f4a; color: white; padding: 12px 30px; 
                      text-decoration: none; border-radius: 6px; display: inline-block;">
              View Dashboard
            </a>
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
          <p style="color: #666; font-size: 12px;">Al Maha Farm Management System</p>
        </div>
      `,
      text: `Hi ${userName},\n\n${alertTitle}\n\n${alertMessage}\n\nView dashboard: ${config.appUrl}/dashboard`,
    });
  }

  isConfigured(): boolean {
    return !!(config.email.host && config.email.user);
  }
}
