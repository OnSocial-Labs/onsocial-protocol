import { Router } from 'express';
import {
  createAuthChallenge,
  generateAppRefreshToken,
  generateAppToken,
  generateToken,
  generateRefreshToken,
  verifyAppRefreshToken,
  verifyRefreshToken,
  verifyNearSignature,
} from '../auth/index.js';
import { getDeveloperAppById } from '../services/developer-apps/index.js';
import { listingOrigin } from '../services/developer-apps/listing.js';
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
    const handoff = await createAppHandoff(req.auth.accountId, app);
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

async function issueAppSessionJson(
  accountId: string,
  appId: string
): Promise<{
  token: string;
  refreshToken: string;
  accountId: string;
  appId: string;
  expiresIn: string;
  tier: string;
  rateLimit: number;
}> {
  const token = await generateAppToken(accountId, appId);
  const refreshToken = generateAppRefreshToken(accountId, appId);
  const tierInfo = await getTierInfo(accountId);
  return {
    token,
    refreshToken,
    accountId,
    appId,
    expiresIn: config.jwtExpiresIn,
    tier: tierInfo.tier,
    rateLimit: tierInfo.rateLimit,
  };
}

/**
 * POST /auth/app-session
 * Public: exchange a handoff code for an app-scoped JWT + body refresh token.
 * Never sets a viewer refresh cookie.
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
  const consumed = await consumeAppHandoff(code, appId, originHeader ?? null);
  if ('error' in consumed) {
    res.status(400).json({ error: consumed.error, code: consumed.code });
    return;
  }

  try {
    res.json(await issueAppSessionJson(consumed.accountId, consumed.appId));
  } catch (error) {
    logger.error({ error }, 'App session error');
    res.status(500).json({ error: 'Failed to create app session' });
  }
});

/**
 * POST /auth/app-refresh
 * Public: rotate an app-scoped refresh token. Cannot mint a viewer session.
 * Body: { refreshToken, appId }. No cookie.
 */
authRouter.post('/app-refresh', async (req: Request, res: Response) => {
  const refreshToken = String(req.body?.refreshToken ?? '').trim();
  const appId = String(req.body?.appId ?? '')
    .trim()
    .toLowerCase();
  if (!refreshToken || !appId) {
    res.status(400).json({ error: 'refreshToken and appId are required' });
    return;
  }

  const payload = verifyAppRefreshToken(refreshToken);
  if (!payload || payload.appId !== appId) {
    res.status(401).json({ error: 'Valid app refresh token required' });
    return;
  }

  const originHeader = req.get('origin');
  if (originHeader) {
    try {
      const app = await getDeveloperAppById(appId);
      const listed = app?.href ? listingOrigin(app.href) : null;
      if (listed && originHeader !== listed) {
        res.status(400).json({
          error: 'Refresh origin does not match listing',
          code: 'INVALID_HANDOFF',
        });
        return;
      }
    } catch (error) {
      logger.error({ error }, 'App refresh listing lookup failed');
      res.status(500).json({ error: 'Token refresh failed' });
      return;
    }
  }

  try {
    clearTierCache(payload.accountId);
    res.json(await issueAppSessionJson(payload.accountId, payload.appId));
  } catch (error) {
    logger.error({ error }, 'App refresh error');
    res.status(500).json({ error: 'Token refresh failed' });
  }
});
