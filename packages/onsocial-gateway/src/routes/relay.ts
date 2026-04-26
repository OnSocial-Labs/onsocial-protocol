import { Router } from 'express';
import type { Request, Response } from 'express';
import { config } from '../config/index.js';
import { requireAuth, requireTier } from '../middleware/index.js';
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

/**
 * Build the upstream relayer URL, forwarding the optional `?wait=true` query
 * param. When `wait=true` the relayer uses `broadcast_tx_commit` and surfaces
 * the on-chain receipt status (`success` / `failure`) instead of fire-and-forget
 * `pending`. Use this for writes where the caller must know the tx outcome.
 */
function buildRelayUrl(req: Request): string {
  const url = `${config.relayUrl}/execute`;
  const wait = req.query.wait;
  if (wait === 'true' || wait === '1') {
    return `${url}?wait=true`;
  }
  return url;
}

/** Pick a fetch timeout: 30s for fire-and-forget, 90s when waiting for finality. */
function relayTimeoutMs(req: Request): number {
  const wait = req.query.wait;
  return wait === 'true' || wait === '1' ? 90_000 : 30_000;
}

// ---------------------------------------------------------------------------
// POST /relay/execute  — Intent auth (JWT → relayer acts on behalf of user)
//
// The gateway injects { auth: { type: "intent", actor_id: <JWT accountId> } }
// so the user only needs a valid JWT — no NEAR key signing required.
// The relayer must be registered as an intents_executor on the contract.
//
// Body: { action: { type: "set", data: {...} }, options?: {...} }
// ---------------------------------------------------------------------------
relayRouter.post(
  '/execute',
  requireAuth,
  async (req: Request, res: Response) => {
    const { action, options, target_account, actor_id } = req.body;
    const accountId = req.auth!.accountId;

    if (!action || !action.type) {
      res.status(400).json({ error: 'Missing action or action.type' });
      return;
    }

    // Actor passthrough: API-key users can specify an end-user identity.
    // JWT users are always locked to their own identity (the JWT proves who they are).
    // The contract enforces permission checks on actor_id regardless.
    const effectiveActorId =
      req.auth!.method === 'apikey' && typeof actor_id === 'string' && actor_id
        ? actor_id
        : accountId;

    // target_account defaults to JWT user; callers may override for cross-account
    // writes (e.g. grantee writing to owner's path). actor_id always stays locked
    // to the JWT identity — the contract enforces permission checks.
    const contractRequest = {
      target_account: target_account || effectiveActorId,
      action,
      auth: {
        type: 'intent',
        actor_id: effectiveActorId,
        intent: {},
      },
      ...(options && { options }),
    };

    try {
      const response = await fetch(buildRelayUrl(req), {
        method: 'POST',
        headers: relayHeaders(),
        signal: AbortSignal.timeout(relayTimeoutMs(req)),
        body: JSON.stringify(contractRequest),
      });

      const data = await response.json();
      res.status(response.status).json(data);
    } catch (error) {
      logger.error(
        { error, accountId, action: action.type },
        'Intent relay failed'
      );
      res.status(502).json({ error: 'Failed to relay transaction' });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /relay/signed  — SignedPayload auth (user signs with NEAR key)
//
// JWT required: proves identity to the gateway (rate limits, tier billing).
// Signed payload: proves to the smart contract that user authorized this action.
// These are complementary layers — JWT gates the gateway, signature gates the chain.
//
// Body: {
//   target_account: "alice.testnet",
//   action: { type: "set", data: {...} },
//   auth: {
//     type: "signed_payload",
//     public_key: "ed25519:...",
//     nonce: "1",
//     expires_at_ms: "1707400000000",
//     signature: "<base64>"
//   },
//   options?: {...}
// }
// ---------------------------------------------------------------------------
relayRouter.post(
  '/signed',
  requireAuth,
  async (req: Request, res: Response) => {
    const { target_account, action, auth, options } = req.body;

    if (!target_account) {
      res.status(400).json({ error: 'Missing target_account' });
      return;
    }
    if (!action || !action.type) {
      res.status(400).json({ error: 'Missing action or action.type' });
      return;
    }
    if (!auth || auth.type !== 'signed_payload') {
      res.status(400).json({ error: 'auth.type must be "signed_payload"' });
      return;
    }
    if (
      !auth.public_key ||
      !auth.nonce ||
      !auth.expires_at_ms ||
      !auth.signature
    ) {
      res.status(400).json({
        error: 'Missing required auth fields',
        required: ['public_key', 'nonce', 'expires_at_ms', 'signature'],
      });
      return;
    }

    const contractRequest = {
      target_account,
      action,
      auth,
      ...(options && { options }),
    };

    try {
      const response = await fetch(buildRelayUrl(req), {
        method: 'POST',
        headers: relayHeaders(),
        signal: AbortSignal.timeout(relayTimeoutMs(req)),
        body: JSON.stringify(contractRequest),
      });

      const data = await response.json();
      res.status(response.status).json(data);
    } catch (error) {
      logger.error(
        { error, target_account, action: action.type },
        'Signed relay failed'
      );
      res.status(502).json({ error: 'Failed to relay signed transaction' });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /relay/delegate  — DelegateAction auth (NEP-366 meta-tx, pro tier)
// ---------------------------------------------------------------------------
relayRouter.post(
  '/delegate',
  requireTier('pro'),
  async (req: Request, res: Response) => {
    const { target_account, action, auth, options } = req.body;

    if (!target_account || !action || !auth) {
      res.status(400).json({
        error: 'Missing required fields',
        required: ['target_account', 'action', 'auth'],
      });
      return;
    }
    if (auth.type !== 'delegate_action') {
      res.status(400).json({ error: 'auth.type must be "delegate_action"' });
      return;
    }

    const contractRequest = {
      target_account,
      action,
      auth,
      ...(options && { options }),
    };

    try {
      const response = await fetch(buildRelayUrl(req), {
        method: 'POST',
        headers: relayHeaders(),
        signal: AbortSignal.timeout(relayTimeoutMs(req)),
        body: JSON.stringify(contractRequest),
      });

      const data = await response.json();
      res.status(response.status).json(data);
    } catch (error) {
      logger.error(
        { error, target_account, action: action?.type },
        'Delegate relay failed'
      );
      res.status(502).json({ error: 'Failed to relay delegate transaction' });
    }
  }
);

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
