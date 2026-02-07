import { Router } from 'express';
import type { Request, Response } from 'express';
import { config } from '../config/index.js';
import { requireTier } from '../middleware/index.js';

export const relayRouter = Router();

/**
 * POST /relay/submit
 * Submit signed transaction to relay
 * Relay handles gas fees for the user
 *
 * Body: {
 *   signedTransaction: string  // base64 encoded signed transaction
 * }
 */
relayRouter.post('/submit', async (req: Request, res: Response) => {
  const { signedTransaction } = req.body;

  if (!signedTransaction) {
    res.status(400).json({ error: 'Missing signedTransaction' });
    return;
  }

  try {
    const response = await fetch(`${config.relayUrl}/relay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        signed_transaction: signedTransaction,
      }),
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('Relay submit error:', error);
    res.status(502).json({ error: 'Failed to submit transaction' });
  }
});

/**
 * POST /relay/meta-tx
 * Submit meta-transaction (NEP-366)
 * Pro tier only - higher gas allowance
 *
 * Body: {
 *   delegateAction: object,
 *   signature: string
 * }
 */
relayRouter.post(
  '/meta-tx',
  requireTier('pro'),
  async (req: Request, res: Response) => {
    const { delegateAction, signature } = req.body;

    if (!delegateAction || !signature) {
      res.status(400).json({
        error: 'Missing required fields',
        required: ['delegateAction', 'signature'],
      });
      return;
    }

    try {
      const response = await fetch(`${config.relayUrl}/relay/meta`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          delegate_action: delegateAction,
          signature,
        }),
      });

      const data = await response.json();
      res.status(response.status).json(data);
    } catch (error) {
      console.error('Meta-tx submit error:', error);
      res.status(502).json({ error: 'Failed to submit meta-transaction' });
    }
  }
);

/**
 * GET /relay/status/:txHash
 * Check transaction status
 */
relayRouter.get('/status/:txHash', async (req: Request, res: Response) => {
  const { txHash } = req.params;

  try {
    const response = await fetch(`${config.relayUrl}/status/${txHash}`);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('Relay status error:', error);
    res.status(502).json({ error: 'Failed to get transaction status' });
  }
});

/**
 * GET /relay/health
 * Check relay health
 */
relayRouter.get('/health', async (_req: Request, res: Response) => {
  try {
    const response = await fetch(`${config.relayUrl}/health`);

    if (response.ok) {
      res.json({ status: 'ok', relay: 'connected' });
    } else {
      res.status(502).json({ status: 'error', relay: 'unhealthy' });
    }
  } catch {
    res.status(502).json({ status: 'error', relay: 'unreachable' });
  }
});
