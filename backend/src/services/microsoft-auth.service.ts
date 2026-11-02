import { ConfidentialClientApplication, Configuration, AuthorizationCodeRequest } from '@azure/msal-node';
import { config } from '../config';
import { UserRepository } from '../repositories/user.repository';
import { AuthService } from './auth.service';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

// Microsoft Graph API endpoint for user info
const GRAPH_ME_ENDPOINT = 'https://graph.microsoft.com/v1.0/me';

interface MicrosoftUserInfo {
  id: string;
  displayName: string;
  mail: string;
  userPrincipalName: string;
  jobTitle?: string;
  department?: string;
}

export class MicrosoftAuthService {
  private msalClient: ConfidentialClientApplication | null = null;
  private readonly userRepository = new UserRepository();
  private readonly authService = new AuthService();

  private getMsalConfig(): Configuration {
    const clientId = config.microsoft?.clientId;
    const clientSecret = config.microsoft?.clientSecret;
    const tenantId = config.microsoft?.tenantId;

    if (!clientId || !clientSecret || !tenantId) {
      throw new AppError('Microsoft auth not configured', 'CONFIG_ERROR', 500);
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
            logger.debug({ level }, message);
          },
        },
      },
    };
  }

  private getClient(): ConfidentialClientApplication {
    if (!this.msalClient) {
      this.msalClient = new ConfidentialClientApplication(this.getMsalConfig());
    }
    return this.msalClient;
  }

  /**
   * Get the authorization URL for Microsoft login
   */
  async getAuthorizationUrl(redirectUri: string, state?: string): Promise<string> {
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
  async handleCallback(code: string, redirectUri: string): Promise<{
    user: any;
    tokens: { accessToken: string; refreshToken: string; expiresIn: number };
    isNewUser: boolean;
  }> {
    const client = this.getClient();

    // Exchange code for tokens
    const tokenRequest: AuthorizationCodeRequest = {
      code,
      scopes: ['user.read', 'email', 'profile', 'openid'],
      redirectUri,
    };

    const response = await client.acquireTokenByCode(tokenRequest);

    if (!response || !response.accessToken) {
      throw new AppError('Failed to get access token from Microsoft', 'AUTH_ERROR', 401);
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
    } else {
      // Update Microsoft ID if not set
      if (!user.microsoftId) {
        await this.userRepository.setMicrosoftId(user.id, msUserInfo.id);
      }
    }

    if (!user) {
      throw new AppError('Failed to create or find user', 'AUTH_ERROR', 500);
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
  private async getMicrosoftUserInfo(accessToken: string): Promise<MicrosoftUserInfo> {
    const response = await fetch(GRAPH_ME_ENDPOINT, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new AppError('Failed to get user info from Microsoft', 'AUTH_ERROR', 401);
    }

    return response.json();
  }

  /**
   * Check if Microsoft auth is configured
   */
  isConfigured(): boolean {
    return !!(
      config.microsoft?.clientId &&
      config.microsoft?.clientSecret &&
      config.microsoft?.tenantId
    );
  }
}
