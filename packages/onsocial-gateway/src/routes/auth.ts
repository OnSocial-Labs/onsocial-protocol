import { Router } from 'express';
import {
  createAuthChallenge,
  generateToken,
  verifyNearSignature,
} from '../auth/index.js';
import { getTierInfo, clearTierCache } from '../tiers/index.js';
import { config } from '../config/index.js';
import { SUBSCRIPTION_PLANS, formatPrice } from '../services/revolut/index.js';
import { logger } from '../logger.js';
import type { Request, Response } from 'express';

export const authRouter = Router();

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
    const tierInfo = await getTierInfo(accountId);

    res.json({
      token,
      expiresIn: '1h',
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
 * Refresh JWT token (requires valid existing token)
 */
authRouter.post('/refresh', async (req: Request, res: Response) => {
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
      expiresIn: '1h',
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
      staking: config.stakingContract,
    },
  });
});
