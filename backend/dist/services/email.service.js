"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailService = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const config_1 = require("../config");
const logger_1 = require("../utils/logger");
class EmailService {
    constructor() {
        this.transporter = null;
    }
    getTransporter() {
        if (!this.transporter) {
            if (!config_1.config.email.host || !config_1.config.email.user) {
                logger_1.logger.warn('Email not configured, using console output');
                // Return a mock transporter for development
                return {
                    sendMail: async (options) => {
                        logger_1.logger.info({ to: options.to, subject: options.subject }, 'Email (mock):');
                        logger_1.logger.info(options.text || options.html);
                        return { messageId: 'mock-' + Date.now() };
                    },
                };
            }
            this.transporter = nodemailer_1.default.createTransport({
                host: config_1.config.email.host,
                port: config_1.config.email.port,
                secure: config_1.config.email.secure,
                auth: {
                    user: config_1.config.email.user,
                    pass: config_1.config.email.pass,
                },
            });
        }
        return this.transporter;
    }
    async sendEmail(options) {
        const transporter = this.getTransporter();
        try {
            await transporter.sendMail({
                from: config_1.config.email.from,
                to: options.to,
                subject: options.subject,
                html: options.html,
                text: options.text,
            });
            logger_1.logger.info({ to: options.to, subject: options.subject }, 'Email sent');
        }
        catch (error) {
            logger_1.logger.error({ error, to: options.to }, 'Failed to send email');
            throw error;
        }
    }
    async sendPasswordResetEmail(email, resetToken, userName) {
        const resetUrl = `${config_1.config.appUrl}/reset-password?token=${resetToken}`;
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
    async sendWelcomeEmail(email, userName) {
        await this.sendEmail({
            to: email,
            subject: 'Welcome to Al Maha Farm',
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #2b6f4a;">Welcome to Al Maha Farm!</h1>
          <p>Hi ${userName},</p>
          <p>Your account has been created successfully. You can now sign in to access the farm management system.</p>
          <p style="text-align: center; margin: 30px 0;">
            <a href="${config_1.config.appUrl}/login" 
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
            text: `Hi ${userName},\n\nWelcome to Al Maha Farm! Your account has been created successfully.\n\nSign in at: ${config_1.config.appUrl}/login`,
        });
    }
    async sendAlertEmail(email, userName, alertTitle, alertMessage) {
        await this.sendEmail({
            to: email,
            subject: `[Alert] ${alertTitle}`,
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #f59e0b;">⚠️ ${alertTitle}</h1>
          <p>Hi ${userName},</p>
          <p>${alertMessage}</p>
          <p style="text-align: center; margin: 30px 0;">
            <a href="${config_1.config.appUrl}/dashboard" 
               style="background-color: #2b6f4a; color: white; padding: 12px 30px; 
                      text-decoration: none; border-radius: 6px; display: inline-block;">
              View Dashboard
            </a>
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
          <p style="color: #666; font-size: 12px;">Al Maha Farm Management System</p>
        </div>
      `,
            text: `Hi ${userName},\n\n${alertTitle}\n\n${alertMessage}\n\nView dashboard: ${config_1.config.appUrl}/dashboard`,
        });
    }
    isConfigured() {
        return !!(config_1.config.email.host && config_1.config.email.user);
    }
}
exports.EmailService = EmailService;
