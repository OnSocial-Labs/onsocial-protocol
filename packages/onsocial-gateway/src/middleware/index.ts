import type { Request, Response, NextFunction } from 'express';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { verifyToken } from '../auth/index.js';
import { config } from '../config/index.js';
import type { Tier, JwtPayload } from '../types/index.js';

// Extend Express Request to include auth info
declare global {
  namespace Express {
    interface Request {
      auth?: JwtPayload;
    }
  }
}

// Create rate limiters for each tier
const rateLimiters = {
  free: new RateLimiterMemory({
    points: config.rateLimits.free,
    duration: 60, // per minute
  }),
  staker: new RateLimiterMemory({
    points: config.rateLimits.staker,
    duration: 60,
  }),
  builder: new RateLimiterMemory({
    points: config.rateLimits.builder,
    duration: 60,
  }),
};

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
 * Extracts and verifies JWT, attaches auth info to request
 * Does NOT reject unauthenticated requests - use requireAuth for that
 */
export function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const token = extractToken(req);

  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      req.auth = payload;
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
 * Uses tier-based rate limits
 */
export async function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const tier: Tier = req.auth?.tier || 'free';
  const key = req.auth?.accountId || req.ip || 'anonymous';

  try {
    await rateLimiters[tier].consume(key);
    next();
  } catch {
    res.status(429).json({
      error: 'Rate limit exceeded',
      tier,
      limit: config.rateLimits[tier],
      retryAfter: 60,
    });
  }
}
