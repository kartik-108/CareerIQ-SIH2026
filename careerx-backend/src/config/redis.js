import { Redis } from '@upstash/redis';
import { env } from './env.js';
import { logger } from './logger.js';

const enabled = Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);

const client = enabled
  ? new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN })
  : null;

if (!enabled) {
  logger.warn('Redis not configured — caching is disabled (set UPSTASH_REDIS_REST_URL/TOKEN).');
}

/** Get a JSON value from cache, or null if missing/disabled. */
export async function cacheGet(key) {
  if (!client) return null;
  try {
    const value = await client.get(key);
    return value ?? null;
  } catch (err) {
    logger.error({ err: err.message, key }, 'cacheGet failed');
    return null;
  }
}

/** Set a JSON value in cache with a TTL in seconds. No-op if Redis is disabled. */
export async function cacheSet(key, value, ttlSeconds) {
  if (!client) return;
  try {
    await client.set(key, value, ttlSeconds ? { ex: ttlSeconds } : undefined);
  } catch (err) {
    logger.error({ err: err.message, key }, 'cacheSet failed');
  }
}

export async function cacheDel(key) {
  if (!client) return;
  try {
    await client.del(key);
  } catch (err) {
    logger.error({ err: err.message, key }, 'cacheDel failed');
  }
}

export const redisClient = client;
