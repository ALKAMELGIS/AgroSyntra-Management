"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MicrosoftAuthService = void 0;
const msal_node_1 = require("@azure/msal-node");
const config_1 = require("../config");
const user_repository_1 = require("../repositories/user.repository");
const auth_service_1 = require("./auth.service");
const errors_1 = require("../utils/errors");
const logger_1 = require("../utils/logger");
// Microsoft Graph API endpoint for user info
const GRAPH_ME_ENDPOINT = 'https://graph.microsoft.com/v1.0/me';
class MicrosoftAuthService {
    constructor() {
        this.msalClient = null;
        this.userRepository = new user_repository_1.UserRepository();
        this.authService = new auth_service_1.AuthService();
    }
    getMsalConfig() {
        const clientId = config_1.config.microsoft?.clientId;
        const clientSecret = config_1.config.microsoft?.clientSecret;
        const tenantId = config_1.config.microsoft?.tenantId;
        if (!clientId || !clientSecret || !tenantId) {
            throw new errors_1.AppError('Microsoft auth not configured', 'CONFIG_ERROR', 500);
        }
        return {
            auth: {
                clientId,
                clientSecret,
                authority: `https://login.microsoftonline.com/${tenantId}`,
            },
            system: {
                loggerOptions: {
                    loggerCallback: (level, message) => {
                        logger_1.logger.debug({ level }, message);
                    },
                },
            },
        };
    }
    getClient() {
        if (!this.msalClient) {
            this.msalClient = new msal_node_1.ConfidentialClientApplication(this.getMsalConfig());
        }
        return this.msalClient;
    }
    /**
     * Get the authorization URL for Microsoft login
     */
    async getAuthorizationUrl(redirectUri, state) {
        const client = this.getClient();
        const authCodeUrlParameters = {
            scopes: ['user.read', 'email', 'profile', 'openid'],
            redirectUri,
            state: state || '',
        };
        const url = await client.getAuthCodeUrl(authCodeUrlParameters);
        return url;
    }
    /**
     * Exchange authorization code for tokens and get user info
     */
    async handleCallback(code, redirectUri) {
        const client = this.getClient();
        // Exchange code for tokens
        const tokenRequest = {
            code,
            scopes: ['user.read', 'email', 'profile', 'openid'],
            redirectUri,
        };
        const response = await client.acquireTokenByCode(tokenRequest);
        if (!response || !response.accessToken) {
            throw new errors_1.AppError('Failed to get access token from Microsoft', 'AUTH_ERROR', 401);
        }
        // Get user info from Microsoft Graph
        const msUserInfo = await this.getMicrosoftUserInfo(response.accessToken);
        // Find or create user in our database
        const email = msUserInfo.mail || msUserInfo.userPrincipalName;
        let user = await this.userRepository.findByEmail(email);
        let isNewUser = false;
        if (!user) {
            // Create new user from Microsoft account
            isNewUser = true;
            const newUser = await this.userRepository.create({
                email,
                passwordHash: '', // No password for SSO users
                name: msUserInfo.displayName,
                role: 'worker', // Default role, admin can change later
            });
            // Mark as Microsoft SSO user
            await this.userRepository.setMicrosoftId(newUser.id, msUserInfo.id);
            user = await this.userRepository.findById(newUser.id);
        }
        else {
            // Update Microsoft ID if not set
            if (!user.microsoftId) {
                await this.userRepository.setMicrosoftId(user.id, msUserInfo.id);
            }
        }
        if (!user) {
            throw new errors_1.AppError('Failed to create or find user', 'AUTH_ERROR', 500);
        }
        // Generate our own JWT tokens
        const tokens = await this.authService.generateTokensForUser(user.id, user.email, user.role);
        await this.userRepository.updateLastLogin(user.id);
        return {
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                isActive: user.isActive,
                lastLogin: new Date().toISOString(),
                createdAt: user.createdAt,
            },
            tokens,
            isNewUser,
        };
    }
    /**
     * Get user info from Microsoft Graph API
     */
    async getMicrosoftUserInfo(accessToken) {
        const response = await fetch(GRAPH_ME_ENDPOINT, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });
        if (!response.ok) {
            throw new errors_1.AppError('Failed to get user info from Microsoft', 'AUTH_ERROR', 401);
        }
        return response.json();
    }
    /**
     * Check if Microsoft auth is configured
     */
    isConfigured() {
        return !!(config_1.config.microsoft?.clientId &&
            config_1.config.microsoft?.clientSecret &&
            config_1.config.microsoft?.tenantId);
    }
}
exports.MicrosoftAuthService = MicrosoftAuthService;
