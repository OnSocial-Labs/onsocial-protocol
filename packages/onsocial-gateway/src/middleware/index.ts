import type { Request, Response, NextFunction } from 'express';
import { RateLimiterMemory, RateLimiterRedis, type RateLimiterRes } from 'rate-limiter-flexible';
import { verifyToken } from '../auth/index.js';
import { lookupApiKey } from '../services/apikeys/index.js';
import { config } from '../config/index.js';
import { logger } from '../logger.js';
import type { Tier, JwtPayload } from '../types/index.js';

// Extend Express Request to include auth info
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- standard Express augmentation pattern
  namespace Express {
    interface Request {
      auth?: JwtPayload;
    }
  }
}

// --- Rate limiter factory: Redis if available, Memory fallback ---

type RateLimiter = RateLimiterMemory | RateLimiterRedis;

function createRateLimiters(): Record<Tier, RateLimiter> {
  // Memory-based insurance limiter (fallback if Redis is down)
  const memoryFallbacks: Record<Tier, RateLimiterMemory> = {
    free: new RateLimiterMemory({ points: config.rateLimits.free, duration: 60 }),
    pro: new RateLimiterMemory({ points: config.rateLimits.pro, duration: 60 }),
    scale: new RateLimiterMemory({ points: config.rateLimits.scale, duration: 60 }),
  };

  if (!config.redisUrl) {
    if (config.nodeEnv === 'production') {
      logger.warn('REDIS_URL not set \u2014 rate limits are per-process only (not shared across replicas)');
    }
    return memoryFallbacks;
  }

  // Dynamic import to avoid hard dependency when Redis isn't needed
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Redis = require('ioredis');
    const redisClient = new Redis(config.redisUrl, {
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });

    redisClient.connect().catch((err: Error) => {
      logger.error({ err }, 'Redis connection failed \u2014 falling back to in-memory rate limits');
    });

    logger.info('Rate limiter: using Redis');

    return {
      free: new RateLimiterRedis({
        storeClient: redisClient,
        points: config.rateLimits.free,
        duration: 60,
        keyPrefix: 'rl:free',
        insuranceLimiter: memoryFallbacks.free,
      }),
      pro: new RateLimiterRedis({
        storeClient: redisClient,
        points: config.rateLimits.pro,
        duration: 60,
        keyPrefix: 'rl:pro',
        insuranceLimiter: memoryFallbacks.pro,
      }),
      scale: new RateLimiterRedis({
        storeClient: redisClient,
        points: config.rateLimits.scale,
        duration: 60,
        keyPrefix: 'rl:scale',
        insuranceLimiter: memoryFallbacks.scale,
      }),
    };
  } catch {
    logger.warn('ioredis not installed \u2014 using in-memory rate limiter');
    return memoryFallbacks;
  }
}

const rateLimiters = createRateLimiters();

/**
 * Extract JWT from Authorization header
 */
function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7);
}

/**
 * Authentication middleware
 * Supports two credential types:
 *   1. Authorization: Bearer <jwt>  — wallet-based session
 *   2. X-API-Key: onsocial_...      — developer API key
 *
 * Does NOT reject unauthenticated requests — use requireAuth for that
 */
export async function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  // Path 1: JWT Bearer token
  const token = extractToken(req);
  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      req.auth = { ...payload, method: 'jwt' };
      next();
      return;
    }
  }

  // Path 2: API key (format-validated before hashing to avoid CPU waste)
  const apiKey = req.headers['x-api-key'];
  if (typeof apiKey === 'string' && apiKey.startsWith('onsocial_')) {
    const record = await lookupApiKey(apiKey); // lookupApiKey validates format internally
    if (record) {
      req.auth = {
        accountId: record.accountId,
        tier: record.tier,
        method: 'apikey',
        iat: Math.floor(record.createdAt / 1000),
        exp: 0, // API keys don't expire via JWT
      };
      next();
      return;
    }
  }

  next();
}

/**
 * Require authentication middleware
 * Returns 401 if no valid auth
 */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.auth) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  next();
}

/**
 * Require specific tier middleware
 */
export function requireTier(...allowedTiers: Tier[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!allowedTiers.includes(req.auth.tier)) {
      res.status(403).json({
        error: 'Insufficient tier',
        required: allowedTiers,
        current: req.auth.tier,
      });
      return;
    }

    next();
  };
}

/**
 * Rate limiting middleware
 * Uses tier-based rate limits. Sends standard rate-limit headers.
 */
export async function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const tier: Tier = req.auth?.tier || 'free';
  const key = req.auth?.accountId || req.ip || 'anonymous';
  const limit = config.rateLimits[tier];

  try {
    const rlRes: RateLimiterRes = await rateLimiters[tier].consume(key);
    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', rlRes.remainingPoints);
    res.setHeader('X-RateLimit-Reset', Math.ceil(rlRes.msBeforeNext / 1000));
    next();
  } catch (rlRej) {
    const rlRes = rlRej as RateLimiterRes;
    const retryAfter = Math.ceil(rlRes.msBeforeNext / 1000);
    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', 0);
    res.setHeader('X-RateLimit-Reset', retryAfter);
    res.setHeader('Retry-After', retryAfter);
    res.status(429).json({
      error: 'Rate limit exceeded',
      tier,
      limit,
      retryAfter,
    });
  }
}
