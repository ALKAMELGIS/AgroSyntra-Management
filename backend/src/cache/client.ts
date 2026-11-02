import Redis from 'ioredis';
import { redisConfig } from '../config/redis';

const redisUrl = (redisConfig.url || '').trim();
export const isRedisEnabled = redisUrl.length > 0;

const noOpRedis = {
  get: async (_key: string) => null as string | null,
  setex: async (_key: string, _ttl: number, _value: string) => 'OK',
  ping: async () => 'PONG',
  on: () => noOpRedis,
};

function createRedisClient(): Redis | typeof noOpRedis {
  if (!redisUrl) {
    console.warn('[Redis] REDIS_URL not set — cache disabled. Set REDIS_URL (e.g. redis://localhost:6379) to enable.');
    return noOpRedis;
  }
  const client = new Redis(redisUrl);
  client.on('error', (err) => {
    console.error('[Redis] Connection error:', err.message);
  });
  return client;
}

export const redisClient = createRedisClient();
