import { Router } from 'express';
import { generateToken, verifyNearSignature } from '../auth/index.js';
import { getTierInfo, clearTierCache } from '../tiers/index.js';
import { config } from '../config/index.js';
import { priceOracle } from '../services/price-oracle.js';
import { logger } from '../logger.js';
import type { Request, Response } from 'express';

export const authRouter = Router();

/**
 * POST /auth/login
 * Authenticate with NEAR signature, receive JWT
 *
 * Body: {
 *   accountId: string,
 *   message: string,      // "OnSocial Auth: <timestamp>"
 *   signature: string,    // base64 encoded ed25519 signature
 *   publicKey: string     // ed25519:<base64 or base58>
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
    const verification = await verifyNearSignature(accountId, message, signature, publicKey);
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
 * Public endpoint: show tier pricing + current SOCIAL price
 */
authRouter.get('/pricing', async (_req: Request, res: Response) => {
  try {
    const price = await priceOracle.getPrice();
    const proSocial = await priceOracle.socialForUsd(config.tierPricing.pro);

    res.json({
      tiers: {
        free: { price: 0, rateLimit: config.rateLimits.free },
        pro: {
          priceUsd: config.tierPricing.pro,
          priceSocial: proSocial,
          rateLimit: config.rateLimits.pro,
        },
      },
      socialPriceUsd: price,
    });
  } catch (error) {
    logger.error({ error }, 'Pricing error');
    res.status(500).json({ error: 'Failed to get pricing' });
  }
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
