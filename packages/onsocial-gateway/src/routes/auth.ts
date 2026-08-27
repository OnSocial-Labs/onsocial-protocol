import { Router } from 'express';
import {
  createAuthChallenge,
  generateAppToken,
  generateToken,
  generateRefreshToken,
  verifyRefreshToken,
  verifyNearSignature,
} from '../auth/index.js';
import { getDeveloperAppById } from '../services/developer-apps/index.js';
import {
  consumeAppHandoff,
  createAppHandoff,
} from '../services/app-handoff.js';
import { getTierInfo, clearTierCache } from '../tiers/index.js';
import { config } from '../config/index.js';
import { SUBSCRIPTION_PLANS, formatPrice } from '../services/revolut/index.js';
import { logger } from '../logger.js';
import type { Request, Response } from 'express';

export const authRouter = Router();

// ── Cookie helpers ────────────────────────────────────────────

function setRefreshCookie(res: Response, refreshToken: string): void {
  res.cookie(config.refreshCookieName, refreshToken, {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: config.nodeEnv === 'production' ? 'none' : 'lax',
    maxAge: config.refreshCookieMaxAge * 1000,
    path: '/auth',
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(config.refreshCookieName, {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: config.nodeEnv === 'production' ? 'none' : 'lax',
    path: '/auth',
  });
}

/**
 * POST /auth/challenge
 * Generate a server-side challenge for wallet signing.
 * The portal calls this before wallet.signMessage().
 *
 * Body: { accountId: string }
 * Returns: { challenge: { message, recipient, nonce } }
 */
authRouter.post('/challenge', (req: Request, res: Response) => {
  const { accountId } = req.body;

  if (!accountId || typeof accountId !== 'string') {
    res.status(400).json({ error: 'accountId is required' });
    return;
  }

  const challenge = createAuthChallenge(accountId);

  res.json({ challenge });
});

/**
 * POST /auth/login
 * Verify the signed challenge and issue a JWT.
 *
 * Body: {
 *   accountId: string,
 *   message: string,      // the challenge message (signed by wallet)
 *   signature: string,    // base64 encoded ed25519 signature
 *   publicKey: string,    // ed25519:<base64 or base58>
 * }
 */
authRouter.post('/login', async (req: Request, res: Response) => {
  const { accountId, message, signature, publicKey } = req.body;

  if (!accountId || !message || !signature || !publicKey) {
    res.status(400).json({
      error: 'Missing required fields',
      required: ['accountId', 'message', 'signature', 'publicKey'],
    });
    return;
  }

  try {
    const verification = await verifyNearSignature(
      accountId,
      message,
      signature,
      publicKey
    );
    if (!verification.valid) {
      res.status(401).json({
        error: 'Authentication failed',
        details: verification.error,
      });
      return;
    }

    const token = await generateToken(accountId);
    const refreshToken = generateRefreshToken(accountId);
    const tierInfo = await getTierInfo(accountId);

    setRefreshCookie(res, refreshToken);

    res.json({
      token,
      expiresIn: config.jwtExpiresIn,
      tier: tierInfo.tier,
      rateLimit: tierInfo.rateLimit,
    });
  } catch (error) {
    logger.error({ error }, 'Login error');
    res.status(500).json({ error: 'Authentication failed' });
  }
});

/**
 * POST /auth/refresh
 * Issue a new access token using the refresh cookie.
 * No Bearer header required — the HttpOnly cookie is sent automatically.
 * Also accepts a valid Bearer token for backward compatibility.
 */
authRouter.post('/refresh', async (req: Request, res: Response) => {
  // Path 1: Try refresh cookie first
  const refreshCookie = req.cookies?.[config.refreshCookieName] as
    | string
    | undefined;
  if (refreshCookie) {
    const payload = verifyRefreshToken(refreshCookie);
    if (payload) {
      try {
        clearTierCache(payload.accountId);
        const token = await generateToken(payload.accountId);
        const newRefresh = generateRefreshToken(payload.accountId);
        const tierInfo = await getTierInfo(payload.accountId);

        setRefreshCookie(res, newRefresh);

        res.json({
          token,
          expiresIn: config.jwtExpiresIn,
          tier: tierInfo.tier,
          rateLimit: tierInfo.rateLimit,
        });
        return;
      } catch (error) {
        logger.error({ error }, 'Refresh error (cookie)');
        clearRefreshCookie(res);
        res.status(500).json({ error: 'Token refresh failed' });
        return;
      }
    }
    // Cookie present but invalid/expired — clear it
    clearRefreshCookie(res);
  }

  // Path 2: Fall back to Bearer token (backward compat / API clients)
  if (!req.auth) {
    res.status(401).json({ error: 'Valid token required' });
    return;
  }

  try {
    clearTierCache(req.auth.accountId);
    const token = await generateToken(req.auth.accountId);
    const tierInfo = await getTierInfo(req.auth.accountId);

    res.json({
      token,
      expiresIn: config.jwtExpiresIn,
      tier: tierInfo.tier,
      rateLimit: tierInfo.rateLimit,
    });
  } catch (error) {
    logger.error({ error }, 'Refresh error');
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

/**
 * GET /auth/me
 * Get current user info and tier
 */
authRouter.get('/me', async (req: Request, res: Response) => {
  if (!req.auth) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const tierInfo = await getTierInfo(req.auth.accountId);

    res.json({
      accountId: req.auth.accountId,
      tier: tierInfo.tier,
      rateLimit: tierInfo.rateLimit,
      ...(req.auth.appId ? { appId: req.auth.appId } : {}),
    });
  } catch (error) {
    logger.error({ error }, 'Get me error');
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

/**
 * GET /auth/pricing
 * Public endpoint: show subscription plans and rate limits
 */
authRouter.get('/pricing', (_req: Request, res: Response) => {
  const tiers: Record<string, unknown> = {
    free: { priceUsd: 0, rateLimit: config.rateLimits.free },
  };

  for (const plan of SUBSCRIPTION_PLANS) {
    tiers[plan.tier] = {
      priceUsd: plan.amountMinor / 100,
      price: formatPrice(plan),
      interval: plan.interval,
      rateLimit: plan.rateLimit,
    };
  }

  res.json({ tiers });
});

/**
 * GET /auth/config
 * Public gateway configuration
 */
authRouter.get('/config', (_req: Request, res: Response) => {
  res.json({
    network: config.nearNetwork,
    rateLimits: config.rateLimits,
    contracts: {
      socialToken: config.socialTokenContract,
    },
  });
});

/**
 * POST /auth/app-handoff
 * Viewer JWT (not app-scoped) issues a one-time code for a listed community app.
 */
authRouter.post('/app-handoff', async (req: Request, res: Response) => {
  if (!req.auth) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (req.auth.method === 'apikey' || req.auth.appId) {
    res.status(403).json({
      error: 'Use an OnSocial viewer session to start a dapp handoff',
    });
    return;
  }

  const appId = String(req.body?.appId ?? '')
    .trim()
    .toLowerCase();
  if (!appId) {
    res.status(400).json({ error: 'appId is required' });
    return;
  }

  try {
    const app = await getDeveloperAppById(appId);
    if (!app) {
      res.status(404).json({ error: 'App not found', code: 'NOT_FOUND' });
      return;
    }
    const handoff = createAppHandoff(req.auth.accountId, app);
    if ('error' in handoff) {
      res.status(400).json({ error: handoff.error, code: handoff.code });
      return;
    }
    res.json(handoff);
  } catch (error) {
    logger.error({ error }, 'App handoff error');
    res.status(500).json({ error: 'Failed to create handoff' });
  }
});

/**
 * POST /auth/app-session
 * Public: exchange a handoff code for an app-scoped JWT. No refresh cookie.
 */
authRouter.post('/app-session', async (req: Request, res: Response) => {
  const code = String(req.body?.code ?? '').trim();
  const appId = String(req.body?.appId ?? '')
    .trim()
    .toLowerCase();
  if (!code || !appId) {
    res.status(400).json({ error: 'code and appId are required' });
    return;
  }

  const originHeader = req.get('origin');
  const consumed = consumeAppHandoff(code, appId, originHeader ?? null);
  if ('error' in consumed) {
    res.status(400).json({ error: consumed.error, code: consumed.code });
    return;
  }

  try {
    const token = await generateAppToken(consumed.accountId, consumed.appId);
    const tierInfo = await getTierInfo(consumed.accountId);
    res.json({
      token,
      accountId: consumed.accountId,
      appId: consumed.appId,
      expiresIn: config.jwtExpiresIn,
      tier: tierInfo.tier,
      rateLimit: tierInfo.rateLimit,
    });
  } catch (error) {
    logger.error({ error }, 'App session error');
    res.status(500).json({ error: 'Failed to create app session' });
  }
});
