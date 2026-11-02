import dotenv from 'dotenv';

dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function requireEnvMinLength(name: string, minLength: number): string {
  const value = process.env[name];
  if (!value || value.length < minLength) {
    throw new Error(`${name} must be at least ${minLength} characters`);
  }
  return value;
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3001),
  logLevel: process.env.LOG_LEVEL || 'info',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  database: {
    url: requireEnv('DATABASE_URL'),
    poolMin: Number(process.env.DATABASE_POOL_MIN || (process.env.NODE_ENV === 'production' ? 5 : 2)),
    poolMax: Number(process.env.DATABASE_POOL_MAX || (process.env.NODE_ENV === 'production' ? 20 : 10)),
  },
  redis: {
    url: process.env.REDIS_URL || '',
  },
  auth: {
    jwtSecret: requireEnvMinLength('JWT_SECRET', 32),
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
    refreshTokenDays: Number(process.env.REFRESH_TOKEN_DAYS || 30),
  },
  microsoft: {
    clientId: process.env.MICROSOFT_CLIENT_ID || '',
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
    tenantId: process.env.MICROSOFT_TENANT_ID || '',
    redirectUri: process.env.MICROSOFT_REDIRECT_URI || '',
  },
  email: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'noreply@almahafarm.com',
  },
  external: {
    openWeatherApiKey: process.env.OPENWEATHER_API_KEY || '',
    sentinelHubInstanceId: process.env.SENTINELHUB_INSTANCE_ID || '',
    sentinelHubWmsUrl: process.env.SENTINELHUB_WMS_URL || '',
    sentinelHubClientId: process.env.SENTINELHUB_CLIENT_ID || '',
    sentinelHubClientSecret: process.env.SENTINELHUB_CLIENT_SECRET || '',
    weatherStationApiBaseUrl: process.env.WEATHERSTATION_API_BASE_URL || '',
    weatherStationApiKey: process.env.WEATHERSTATION_API_KEY || '',
    weatherStationApiHeader: process.env.WEATHERSTATION_API_HEADER || 'x-api-key',
  },
};
