import { Router } from 'express';
import type { Request, Response } from 'express';
import { config } from '../config/index.js';
import { requireAuth, requireTier } from '../middleware/index.js';
import { logger } from '../logger.js';

export const relayRouter = Router();

// ---------------------------------------------------------------------------
// POST /relay/execute  — Intent auth (JWT → relayer acts on behalf of user)
//
// The gateway injects { auth: { type: "intent", actor_id: <JWT accountId> } }
// so the user only needs a valid JWT — no NEAR key signing required.
// The relayer must be registered as an intents_executor on the contract.
//
// Body: { action: { type: "set", data: {...} }, options?: {...} }
// ---------------------------------------------------------------------------
relayRouter.post('/execute', requireAuth, async (req: Request, res: Response) => {
  const { action, options } = req.body;
  const accountId = req.auth!.accountId;

  if (!action || !action.type) {
    res.status(400).json({ error: 'Missing action or action.type' });
    return;
  }

  const contractRequest = {
    target_account: accountId,
    action,
    auth: {
      type: 'intent',
      actor_id: accountId,
      intent: {},
    },
    ...(options && { options }),
  };

  try {
    const response = await fetch(`${config.relayUrl}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(contractRequest),
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    logger.error({ error, accountId, action: action.type }, 'Intent relay failed');
    res.status(502).json({ error: 'Failed to relay transaction' });
  }
});

// ---------------------------------------------------------------------------
// POST /relay/signed  — SignedPayload auth (user signs with NEAR key)
//
// Trustless: contract verifies the ed25519 signature on-chain.
// The gateway just forwards the pre-signed request to the relayer.
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
relayRouter.post('/signed', async (req: Request, res: Response) => {
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
  if (!auth.public_key || !auth.nonce || !auth.signature) {
    res.status(400).json({
      error: 'Missing required auth fields',
      required: ['public_key', 'nonce', 'expires_at_ms', 'signature'],
    });
    return;
  }

  const contractRequest = { target_account, action, auth, ...(options && { options }) };

  try {
    const response = await fetch(`${config.relayUrl}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(contractRequest),
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    logger.error({ error, target_account, action: action.type }, 'Signed relay failed');
    res.status(502).json({ error: 'Failed to relay signed transaction' });
  }
});

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

    const contractRequest = { target_account, action, auth, ...(options && { options }) };

    try {
      const response = await fetch(`${config.relayUrl}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contractRequest),
      });

      const data = await response.json();
      res.status(response.status).json(data);
    } catch (error) {
      logger.error({ error, target_account, action: action?.type }, 'Delegate relay failed');
      res.status(502).json({ error: 'Failed to relay delegate transaction' });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /relay/health  — check relayer connectivity
// ---------------------------------------------------------------------------
relayRouter.get('/health', async (_req: Request, res: Response) => {
  try {
    const response = await fetch(`${config.relayUrl}/health`);

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
