/**
 * Developer API routes — key management.
 *
 * All routes require **JWT** auth (wallet session). API keys cannot create
 * or manage other API keys — this prevents key-creates-key abuse.
 *
 * POST   /developer/keys          → create new API key
 * GET    /developer/keys          → list keys (masked)
 * DELETE /developer/keys/:prefix  → revoke key
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '../middleware/index.js';
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  type ApiKeyError,
} from '../services/apikeys/index.js';
import { getUsageSummary } from '../services/metering/index.js';

export const developerRouter = Router();

/**
 * Require JWT-only authentication.
 * Rejects requests authenticated via API key — key management
 * must go through a wallet login session.
 */
function requireJwtAuth(req: Request, res: Response, next: () => void): void {
  if (!req.auth) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (req.auth.method === 'apikey') {
    res
      .status(403)
      .json({ error: 'API keys cannot manage keys. Use JWT (wallet login).' });
    return;
  }
  next();
}

developerRouter.use(requireAuth);
developerRouter.use(requireJwtAuth);

/**
 * Create a new API key.
 * Returns the raw key exactly once — developer must save it.
 *
 * Body (optional): { label?: string }
 */
developerRouter.post('/keys', async (req: Request, res: Response) => {
  const accountId = req.auth!.accountId;
  const label: string = req.body?.label ?? 'default';
  const result = await createApiKey(accountId, label);

  // Check for error
  if ('code' in result) {
    const err = result as ApiKeyError;
    const status = err.code === 'MAX_KEYS_REACHED' ? 409 : 400;
    res.status(status).json({ error: err.message, code: err.code });
    return;
  }

  res.status(201).json({
    key: result.rawKey,
    prefix: result.prefix,
    label: result.label,
    tier: result.tier,
    warning: 'Save this key now. It cannot be retrieved again.',
  });
});

/**
 * List all active keys for the authenticated developer.
 * Keys are masked — only prefix + label shown.
 */
developerRouter.get('/keys', async (req: Request, res: Response) => {
  const accountId = req.auth!.accountId;
  const keys = await listApiKeys(accountId);
  res.json({ keys });
});

/**
 * Revoke a key by its prefix.
 */
developerRouter.delete('/keys/:prefix', async (req: Request, res: Response) => {
  const accountId = req.auth!.accountId;
  const revoked = await revokeApiKey(accountId, req.params.prefix);

  if (revoked) {
    res.json({ status: 'revoked' });
  } else {
    res.status(404).json({ error: 'Key not found' });
  }
});

/**
 * Rotate a key — atomically revoke old key and create a new one.
 * Preserves the label from the old key.
 *
 * Returns the new raw key exactly once.
 */
developerRouter.post(
  '/keys/:prefix/rotate',
  async (req: Request, res: Response) => {
    const accountId = req.auth!.accountId;
    const { prefix } = req.params;

    // Find the old key to preserve its label
    const existing = await listApiKeys(accountId);
    const oldKey = existing.find((k) => k.prefix === prefix);

    if (!oldKey) {
      res.status(404).json({ error: 'Key not found' });
      return;
    }

    // Revoke old key
    const revoked = await revokeApiKey(accountId, prefix);
    if (!revoked) {
      res.status(404).json({ error: 'Key not found or already revoked' });
      return;
    }

    // Create new key with the same label
    const result = await createApiKey(accountId, oldKey.label);

    if ('code' in result) {
      const err = result as ApiKeyError;
      res.status(400).json({ error: err.message, code: err.code });
      return;
    }

    res.status(201).json({
      key: result.rawKey,
      prefix: result.prefix,
      label: result.label,
      tier: result.tier,
      revokedPrefix: prefix,
      warning: 'Save this key now. It cannot be retrieved again.',
    });
  }
);

/**
 * Get usage statistics for the authenticated developer.
 *
 * Returns: { today, thisMonth, byEndpoint, byActor, byStatus }
 */
developerRouter.get('/usage', async (req: Request, res: Response) => {
  const accountId = req.auth!.accountId;
  try {
    const summary = await getUsageSummary(accountId);
    res.json(summary);
  } catch (error) {
    req.log.error({ error }, 'Failed to fetch usage summary');
    res.status(500).json({ error: 'Failed to fetch usage statistics' });
  }
});
