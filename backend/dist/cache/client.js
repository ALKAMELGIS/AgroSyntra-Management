"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redisClient = exports.isRedisEnabled = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const redis_1 = require("../config/redis");
const redisUrl = (redis_1.redisConfig.url || '').trim();
exports.isRedisEnabled = redisUrl.length > 0;
const noOpRedis = {
    get: async (_key) => null,
    setex: async (_key, _ttl, _value) => 'OK',
    ping: async () => 'PONG',
    on: () => noOpRedis,
};
function createRedisClient() {
    if (!redisUrl) {
        console.warn('[Redis] REDIS_URL not set — cache disabled. Set REDIS_URL (e.g. redis://localhost:6379) to enable.');
        return noOpRedis;
    }
    const client = new ioredis_1.default(redisUrl);
    client.on('error', (err) => {
        console.error('[Redis] Connection error:', err.message);
    });
    return client;
}
exports.redisClient = createRedisClient();
