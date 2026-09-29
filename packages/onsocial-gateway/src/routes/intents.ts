/**
 * Server-side NEAR Intents. The 1Click key stays here.
 * Dollar scarces are priced by Pyth; this route only funds the NEAR.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { config } from '../config/index.js';
import { requireAuth } from '../middleware/index.js';
import {
  buildExactNearQuote,
  hermesUpdateUrl,
  statusUrl,
  tokensUrl,
} from '../services/intents/quote.js';

export const intentsRouter = Router();

intentsRouter.get('/tokens', async (_req: Request, res: Response) => {
  try {
    const response = await fetch(tokensUrl());
    if (!response.ok) {
      res.status(502).json({ error: 'Token list is unavailable' });
      return;
    }
    const tokens: unknown = await response.json();
    res.json(tokens);
  } catch {
    res.status(502).json({ error: 'Token list is unavailable' });
  }
});

intentsRouter.get('/near-usd', async (_req: Request, res: Response) => {
  if (!config.pythApiKey) {
    res.status(503).json({ error: 'Pyth is not configured' });
    return;
  }
  try {
    const response = await fetch(hermesUpdateUrl(config.nearNetwork), {
      headers: { authorization: `Bearer ${config.pythApiKey}` },
    });
    if (!response.ok) {
      res.status(502).json({ error: 'NEAR price is unavailable' });
      return;
    }
    const payload = (await response.json()) as {
      binary?: { data?: string[] };
      parsed?: Array<{
        price?: { price?: string; conf?: string; expo?: number };
      }>;
    };
    const updateData = payload.binary?.data?.[0];
    const price = payload.parsed?.[0]?.price;
    if (!updateData || !price?.price || price.expo == null) {
      res.status(502).json({ error: 'NEAR price is unavailable' });
      return;
    }
    res.json({
      updateData,
      price: price.price,
      conf: price.conf ?? '0',
      expo: price.expo,
    });
  } catch {
    res.status(502).json({ error: 'NEAR price is unavailable' });
  }
});

intentsRouter.post(
  '/quote',
  requireAuth,
  async (req: Request, res: Response) => {
    if (!config.oneClickApiKey) {
      res.status(503).json({ error: '1Click is not configured' });
      return;
    }
    const body = req.body as {
      originAsset?: string;
      amountOutYocto?: string;
      recipient?: string;
      refundTo?: string;
      dry?: boolean;
    };
    let quote: ReturnType<typeof buildExactNearQuote>;
    try {
      quote = buildExactNearQuote({
        originAsset: String(body.originAsset ?? ''),
        amountOutYocto: String(body.amountOutYocto ?? ''),
        recipient: String(body.recipient ?? ''),
        refundTo: String(body.refundTo ?? body.recipient ?? ''),
        dry: body.dry !== false,
      });
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'Invalid quote',
      });
      return;
    }
    try {
      const response = await fetch(quote.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.oneClickApiKey}`,
        },
        body: JSON.stringify(quote.body),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        res.status(502).json({ error: 'Quote was refused' });
        return;
      }
      res.json(payload);
    } catch {
      res.status(502).json({ error: 'Quote is unavailable' });
    }
  }
);

intentsRouter.get('/status', async (req: Request, res: Response) => {
  const depositAddress = String(req.query.depositAddress ?? '');
  if (!depositAddress) {
    res.status(400).json({ error: 'Deposit address is required' });
    return;
  }
  try {
    const response = await fetch(statusUrl(depositAddress));
    if (!response.ok) {
      res.status(502).json({ error: 'Swap status is unavailable' });
      return;
    }
    res.json(await response.json());
  } catch {
    res.status(502).json({ error: 'Swap status is unavailable' });
  }
});
