import type { Request, Response, NextFunction } from 'express';
import {
  RateLimiterMemory,
  RateLimiterRedis,
  type RateLimiterRes,
} from 'rate-limiter-flexible';
import { verifyToken } from '../auth/index.js';
import { lookupApiKey } from '../services/apikeys/index.js';
import { config } from '../config/index.js';
import { logger } from '../logger.js';
import type { Tier, JwtPayload } from '../types/index.js';
import {
  activateBurstForWindow,
  initBurstAllowanceStore,
  resolveBoostedLimitForTier,
} from '../services/burst-allowance/index.js';
import {
  BURST_ALLOWANCE_BY_TIER,
  computeOverflowPoints,
} from '../services/burst-allowance/config.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- standard Express augmentation pattern
  namespace Express {
    interface Request {
      auth?: JwtPayload;
    }
  }
}

type RateLimiter = RateLimiterMemory | RateLimiterRedis;

type TierRateLimiters = {
  base: RateLimiter;
  overflow: RateLimiter;
  overflowPoints: number;
};

function overflowPointsForTier(tier: Tier): number {
  const cfg = BURST_ALLOWANCE_BY_TIER[tier];
  if (cfg.creditsPerMonth <= 0 || cfg.multiplier <= 1) return 0;
  const base = config.rateLimits[tier];
  const boosted = resolveBoostedLimitForTier(tier);
  return computeOverflowPoints(base, boosted);
}

function buildTierLimiters(
  tier: Tier,
  redisClient: unknown | null,
  memoryFallbackBase: RateLimiterMemory,
  memoryFallbackOverflow: RateLimiterMemory
): TierRateLimiters {
  const overflowPoints = overflowPointsForTier(tier);
  const basePoints = config.rateLimits[tier];

  if (redisClient) {
    return {
      base: new RateLimiterRedis({
        storeClient: redisClient as ConstructorParameters<
          typeof RateLimiterRedis
        >[0]['storeClient'],
        points: basePoints,
        duration: 60,
        keyPrefix: `rl:${tier}`,
        insuranceLimiter: memoryFallbackBase,
      }),
      overflow: new RateLimiterRedis({
        storeClient: redisClient as ConstructorParameters<
          typeof RateLimiterRedis
        >[0]['storeClient'],
        points: Math.max(overflowPoints, 1),
        duration: 60,
        keyPrefix: `rl:${tier}:overflow`,
        insuranceLimiter: memoryFallbackOverflow,
      }),
      overflowPoints,
    };
  }

  return {
    base: memoryFallbackBase,
    overflow: memoryFallbackOverflow,
    overflowPoints,
  };
}

function createRateLimiters(): Record<Tier, TierRateLimiters> {
  const tiers: Tier[] = ['free', 'pro', 'scale', 'service'];
  const memoryFallbacks = Object.fromEntries(
    tiers.map((tier) => {
      const overflowPoints = overflowPointsForTier(tier);
      return [
        tier,
        {
          base: new RateLimiterMemory({
            points: config.rateLimits[tier],
            duration: 60,
          }),
          overflow: new RateLimiterMemory({
            points: Math.max(overflowPoints, 1),
            duration: 60,
          }),
        },
      ];
    })
  ) as Record<Tier, { base: RateLimiterMemory; overflow: RateLimiterMemory }>;

  if (!config.redisUrl) {
    if (config.nodeEnv === 'production') {
      logger.warn(
        'REDIS_URL not set — rate limits and burst credits are per-process only'
      );
    }
    initBurstAllowanceStore(null);
    return Object.fromEntries(
      tiers.map((tier) => [
        tier,
        {
          ...memoryFallbacks[tier],
          overflowPoints: overflowPointsForTier(tier),
        },
      ])
    ) as Record<Tier, TierRateLimiters>;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Redis = require('ioredis');
    const redisClient = new Redis(config.redisUrl, {
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });

    redisClient.connect().catch((err: Error) => {
      logger.error(
        { err },
        'Redis connection failed — falling back to in-memory rate limits'
      );
    });

    logger.info('Rate limiter: using Redis');
    initBurstAllowanceStore(redisClient);

    return Object.fromEntries(
      tiers.map((tier) => [
        tier,
        buildTierLimiters(
          tier,
          redisClient,
          memoryFallbacks[tier].base,
          memoryFallbacks[tier].overflow
        ),
      ])
    ) as Record<Tier, TierRateLimiters>;
  } catch {
    logger.warn('ioredis not installed — using in-memory rate limiter');
    initBurstAllowanceStore(null);
    return Object.fromEntries(
      tiers.map((tier) => [
        tier,
        {
          ...memoryFallbacks[tier],
          overflowPoints: overflowPointsForTier(tier),
        },
      ])
    ) as Record<Tier, TierRateLimiters>;
  }
}

const rateLimiters = createRateLimiters();

function setRateLimitHeaders(
  res: Response,
  limit: number,
  remaining: number,
  resetSec: number,
  burstActive: boolean,
  creditsRemaining?: number
): void {
  res.setHeader('X-RateLimit-Limit', limit);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, remaining));
  res.setHeader('X-RateLimit-Reset', resetSec);
  if (burstActive) {
    res.setHeader('X-RateLimit-Burst', 'active');
  }
  if (creditsRemaining != null) {
    res.setHeader('X-Burst-Credits-Remaining', creditsRemaining);
  }
}

function sendRateLimitExceeded(
  res: Response,
  tier: Tier,
  limit: number,
  retryAfter: number,
  creditsRemaining?: number
): void {
  setRateLimitHeaders(res, limit, 0, retryAfter, false, creditsRemaining);
  res.setHeader('Retry-After', retryAfter);
  res.status(429).json({
    error: 'Rate limit exceeded',
    tier,
    limit,
    retryAfter,
    ...(creditsRemaining != null
      ? { burstCreditsRemaining: creditsRemaining }
      : {}),
  });
}

function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7);
}

export async function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const token = extractToken(req);
  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      req.auth = { ...payload, method: 'jwt' };
      next();
      return;
    }
  }

  const apiKey = req.headers['x-api-key'];
  if (typeof apiKey === 'string' && apiKey.startsWith('onsocial_')) {
    const record = await lookupApiKey(apiKey);
    if (record) {
      req.auth = {
        accountId: record.accountId,
        tier: record.tier,
        method: 'apikey',
        iat: Math.floor(record.createdAt / 1000),
        exp: 0,
      };
      (req as unknown as Record<string, unknown>)._keyPrefix = record.keyPrefix;
      next();
      return;
    }
  }

  next();
}

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

export async function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const tier: Tier = req.auth?.tier || 'free';
  const key = req.auth?.accountId || req.ip || 'anonymous';
  const baseLimit = config.rateLimits[tier];
  const boostedLimit = resolveBoostedLimitForTier(tier);
  const { base, overflow, overflowPoints } = rateLimiters[tier];

  try {
    const rlRes = await base.consume(key);
    setRateLimitHeaders(
      res,
      baseLimit,
      rlRes.remainingPoints,
      Math.ceil(rlRes.msBeforeNext / 1000),
      false
    );
    next();
    return;
  } catch (rlRej) {
    const rlRes = rlRej as RateLimiterRes;
    const retryAfter = Math.max(1, Math.ceil(rlRes.msBeforeNext / 1000));

    if (overflowPoints <= 0 || !req.auth?.accountId) {
      sendRateLimitExceeded(res, tier, baseLimit, retryAfter);
      return;
    }

    const activation = await activateBurstForWindow(
      req.auth.accountId,
      tier,
      retryAfter
    );

    if (!activation.ok) {
      sendRateLimitExceeded(
        res,
        tier,
        baseLimit,
        retryAfter,
        activation.creditsRemaining
      );
      return;
    }

    try {
      const overflowRes = await overflow.consume(key);
      setRateLimitHeaders(
        res,
        activation.boostedLimit,
        overflowRes.remainingPoints,
        Math.max(retryAfter, Math.ceil(overflowRes.msBeforeNext / 1000)),
        true,
        activation.creditsRemaining
      );
      next();
    } catch {
      sendRateLimitExceeded(
        res,
        tier,
        boostedLimit,
        retryAfter,
        activation.creditsRemaining
      );
    }
  }
}
