import { Router } from 'express';
import type { Request, Response } from 'express';
import { config } from '../config/index.js';
import { requireAuth } from '../middleware/index.js';
import { logger } from '../logger.js';

export const relayRouter = Router();

/** Build headers for relayer requests, including API key if configured. */
function relayHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (config.relayApiKey) {
    headers['X-Api-Key'] = config.relayApiKey;
  }
  return headers;
}

/** Pick a fetch timeout: 30s for fire-and-forget, 90s when waiting for finality. */
function relayTimeoutMs(req: Request): number {
  const wait = req.query.wait;
  return wait === 'true' || wait === '1' ? 90_000 : 30_000;
}

// ---------------------------------------------------------------------------
// POST /relay/delegate  — NEP-366 SignedDelegateAction (gasless meta-tx)
//
// Body: {
//   signed_delegate: "<base64 borsh SignedDelegateAction>",
//   options?: { ... }   // forwarded; reserved for future Transfer top-up
// }
// Query: ?wait=true  → upstream uses broadcast_tx_commit
//
// Forwarded as-is to the relayer's `/execute_delegate` endpoint. The relayer
// re-verifies the user signature, allowlists the inner receiver, and signs
// the OUTER transaction (relayer → user, single Action::Delegate(...)).
//
// Auth: requireAuth (any tier). Per-tier metering happens upstream of this
// router via the standard middleware stack. We intentionally do NOT gate on
// `requireTier('pro')` — gasless meta-tx is the default path for ALL users
// once a session key is provisioned.
// ---------------------------------------------------------------------------
relayRouter.post(
  '/delegate',
  requireAuth,
  async (req: Request, res: Response) => {
    const { signed_delegate, options } = req.body ?? {};

    if (typeof signed_delegate !== 'string' || signed_delegate.length === 0) {
      res.status(400).json({
        error: 'Missing or invalid signed_delegate (expected base64 string)',
      });
      return;
    }

    const upstream = `${config.relayUrl}/execute_delegate${
      req.query.wait === 'true' || req.query.wait === '1' ? '?wait=true' : ''
    }`;

    try {
      const response = await fetch(upstream, {
        method: 'POST',
        headers: relayHeaders(),
        signal: AbortSignal.timeout(relayTimeoutMs(req)),
        body: JSON.stringify({ signed_delegate, ...(options && { options }) }),
      });

      const data = await response.json();
      res.status(response.status).json(data);
    } catch (error) {
      logger.error(
        { error, accountId: req.auth?.accountId },
        'Delegate relay failed'
      );
      res.status(502).json({ error: 'Failed to relay delegate transaction' });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /relay/latest-block  — finalized block height + hash from upstream
//
// Used by the SDK to compute `max_block_height` for NEP-366 delegate
// signing. Public (no auth) by design — same info is available via any
// public NEAR RPC; we expose it here so SDK callers don't need a separate
// RPC dependency.
// ---------------------------------------------------------------------------
relayRouter.get('/latest-block', async (_req: Request, res: Response) => {
  try {
    const response = await fetch(`${config.relayUrl}/latest_block`, {
      signal: AbortSignal.timeout(5_000),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    logger.error({ error }, 'latest-block proxy failed');
    res.status(502).json({ error: 'Upstream unavailable' });
  }
});

// ---------------------------------------------------------------------------
// GET /relay/health  — check relayer connectivity
// ---------------------------------------------------------------------------
relayRouter.get('/health', async (_req: Request, res: Response) => {
  try {
    const response = await fetch(`${config.relayUrl}/health`, {
      signal: AbortSignal.timeout(5_000),
    });

    if (response.ok) {
      const data = await response.json();
      res.json({ status: 'ok', relay: 'connected', ...data });
    } else {
      res.status(502).json({ status: 'error', relay: 'unhealthy' });
    }
  } catch {
    res.status(502).json({ status: 'error', relay: 'unreachable' });
  }
});
