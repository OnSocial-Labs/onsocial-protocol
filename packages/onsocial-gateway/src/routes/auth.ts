import { Router } from 'express';
import { generateToken, verifyNearSignature } from '../auth/index.js';
import { getTierInfo, clearTierCache } from '../tiers/index.js';
import type { Request, Response } from 'express';

export const authRouter = Router();

/**
 * POST /auth/login
 * Authenticate with NEAR signature, receive JWT
 *
 * Body: {
 *   accountId: string,
 *   message: string,      // "OnSocial Auth: <timestamp>" (ISO-8601 recommended, or unix sec/ms)
 *   signature: string,    // base64 encoded ed25519 signature
 *   publicKey: string     // ed25519:<base64 or base58>
 * }
 *
 * Response: {
 *   token: string,
 *   expiresIn: string,
 *   tier: string,
 *   rateLimit: number
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

  // Verify NEAR signature
  const verification = await verifyNearSignature(accountId, message, signature, publicKey);
  if (!verification.valid) {
    res.status(401).json({
      error: 'Authentication failed',
      details: verification.error,
    });
    return;
  }

  try {
    const token = await generateToken(accountId);
    const tierInfo = await getTierInfo(accountId);

    res.json({
      token,
      expiresIn: '1h',
      tier: tierInfo.tier,
      rateLimit: tierInfo.rateLimit,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

/**
 * POST /auth/refresh
 * Refresh JWT token (requires valid existing token)
 *
 * Returns new token with updated tier info
 */
authRouter.post('/refresh', async (req: Request, res: Response) => {
  if (!req.auth) {
    res.status(401).json({ error: 'Valid token required' });
    return;
  }

  try {
    // Clear cache to get fresh tier info
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
    console.error('Refresh error:', error);
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
      balance: tierInfo.balance,
      rateLimit: tierInfo.rateLimit,
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

/**
 * GET /auth/tier/:accountId
 * Get tier info for any account (public endpoint)
 */
authRouter.get('/tier/:accountId', async (req: Request, res: Response) => {
  const { accountId } = req.params;

  try {
    const tierInfo = await getTierInfo(accountId);

    res.json({
      accountId,
      tier: tierInfo.tier,
      rateLimit: tierInfo.rateLimit,
    });
  } catch (error) {
    console.error('Get tier error:', error);
    res.status(500).json({ error: 'Failed to get tier info' });
  }
});
