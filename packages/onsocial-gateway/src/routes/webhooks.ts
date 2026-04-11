/**
 * Revolut webhook handler — receives payment lifecycle events.
 *
 * POST /webhooks/revolut
 *
 * No auth middleware — requests come from Revolut's servers.
 * Verified via HMAC-SHA256 signature (Revolut-Signature header).
 *
 * Events handled:
 *   ORDER_COMPLETED        → activate/renew subscription + upgrade tier
 *   ORDER_PAYMENT_DECLINED → mark subscription past_due
 *   ORDER_PAYMENT_FAILED   → mark subscription past_due
 *
 * Order resolution for subscriptions:
 *   1. Check order metadata (legacy one-off orders with embedded account_id)
 *   2. Look up setup_order_id in our DB (initial subscription activation)
 *   3. Search active subscriptions' cycles via Revolut API (renewal orders)
 *
 * Revolut webhook IPs (allowlist in firewall if needed):
 *   Production: 35.246.21.235, 34.89.70.170
 *   Sandbox:    35.242.130.242, 35.242.162.241
 */

import { Router } from 'express';
import express from 'express';
import type { Request, Response } from 'express';
import { config } from '../config/index.js';
import { logger } from '../logger.js';
import { subscriptionStore } from '../services/revolut/index.js';
import { getPlan } from '../services/revolut/plans.js';
import { updateAccountTier } from '../services/apikeys/index.js';
import { clearTierCache } from '../tiers/index.js';
import type { Tier } from '../types/index.js';
import type { SubscriptionRecord } from '../services/revolut/subscriptions.js';

export const webhookRouter = Router();

// Raw body needed for signature verification — use express.raw()
webhookRouter.use(express.raw({ type: 'application/json' }));

/**
 * POST /webhooks/revolut
 * Revolut sends: { event, order_id, merchant_order_ext_ref }
 */
webhookRouter.post('/revolut', async (req: Request, res: Response) => {
  const revolut = config.revolutClient;
  if (!revolut) {
    res.status(503).json({ error: 'Payment service not configured' });
    return;
  }

  // --- Verify signature ---
  const rawBody =
    typeof req.body === 'string'
      ? req.body
      : Buffer.isBuffer(req.body)
        ? req.body.toString('utf-8')
        : JSON.stringify(req.body);

  const signatureHeader = req.headers['revolut-signature'] as
    | string
    | undefined;
  const timestampHeader = req.headers['revolut-request-timestamp'] as
    | string
    | undefined;

  if (!signatureHeader || !timestampHeader) {
    logger.warn('Webhook missing signature or timestamp headers');
    res.status(401).json({ error: 'Missing signature' });
    return;
  }

  if (
    !revolut.verifyWebhookSignature(rawBody, signatureHeader, timestampHeader)
  ) {
    logger.warn('Webhook signature verification failed');
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  // --- Parse event ---
  let event: {
    event: string;
    order_id: string;
    merchant_order_ext_ref?: string;
  };
  try {
    event =
      typeof req.body === 'string' || Buffer.isBuffer(req.body)
        ? JSON.parse(rawBody)
        : req.body;
  } catch {
    res.status(400).json({ error: 'Invalid JSON' });
    return;
  }

  logger.info(
    { event: event.event, orderId: event.order_id },
    'Webhook received'
  );

  try {
    switch (event.event) {
      case 'ORDER_COMPLETED':
        await handleOrderCompleted(event.order_id);
        break;

      case 'ORDER_PAYMENT_DECLINED':
      case 'ORDER_PAYMENT_FAILED':
        await handlePaymentFailed(event.order_id);
        break;

      default:
        logger.debug({ event: event.event }, 'Webhook event ignored');
    }

    // Acknowledge receipt
    res.status(204).send();
  } catch (err) {
    logger.error(
      { err, event: event.event, orderId: event.order_id },
      'Webhook handler error'
    );
    // Return 500 so Revolut retries delivery
    res.status(500).json({ error: 'Internal handler error' });
  }
});

// --- Order resolution helpers ------------------------------------------------

/**
 * Resolve an order to our internal subscription record.
 *
 * Strategy:
 *   1. Check order metadata for account_id (legacy one-off orders)
 *   2. Look up by setup_order_id in our DB (initial subscription activation)
 *   3. Search active subscriptions' cycles via Revolut API (renewal orders)
 */
async function resolveSubscriptionForOrder(
  orderId: string
): Promise<{ sub: SubscriptionRecord; tier: Tier } | null> {
  const revolut = config.revolutClient!;
  const order = await revolut.getOrder(orderId);

  // Strategy 1: legacy orders with metadata
  if (order.metadata?.account_id && order.metadata?.tier) {
    const accountId = order.metadata.account_id;
    const tier = order.metadata.tier as Tier;
    const sub = await subscriptionStore.getByAccount(accountId);
    if (sub) return { sub, tier };
    // No record yet — might be a very first subscription from old code path
    return null;
  }

  // Strategy 2: look up by setup_order_id
  const bySetup = await subscriptionStore.findBySetupOrderId(orderId);
  if (bySetup) {
    return { sub: bySetup, tier: bySetup.tier };
  }

  // Strategy 3: search active subscriptions for a cycle with this order_id
  const activeSubs = await subscriptionStore.listActiveWithRevolutSub();
  for (const sub of activeSubs) {
    if (!sub.revolutSubscriptionId) continue;
    try {
      const cycles = await revolut.getSubscriptionCycles(
        sub.revolutSubscriptionId
      );
      const match = cycles.find((c) => c.order_id === orderId);
      if (match) {
        return { sub, tier: sub.tier };
      }
    } catch (err) {
      logger.warn(
        { err, revolutSubscriptionId: sub.revolutSubscriptionId },
        'Failed to fetch cycles for subscription'
      );
    }
  }

  return null;
}

// --- Event handlers --------------------------------------------------------

async function handleOrderCompleted(orderId: string): Promise<void> {
  const resolved = await resolveSubscriptionForOrder(orderId);

  if (!resolved) {
    logger.warn(
      { orderId },
      'ORDER_COMPLETED for unknown subscription — ignoring'
    );
    return;
  }

  const { sub, tier } = resolved;
  const plan = getPlan(tier);

  if (!plan) {
    logger.warn({ tier, orderId }, 'Order references unknown tier');
    return;
  }

  // Calculate billing period
  const now = new Date();
  const periodEnd = new Date(now);
  if (plan.interval === 'month') {
    periodEnd.setMonth(periodEnd.getMonth() + plan.intervalCount);
  } else {
    periodEnd.setFullYear(periodEnd.getFullYear() + plan.intervalCount);
  }

  // Update subscription period (handles both initial activation and renewals)
  await subscriptionStore.updatePeriod(
    sub.accountId,
    now.toISOString(),
    periodEnd.toISOString(),
    orderId
  );

  // Decrement promo cycles on renewal (not initial activation)
  if (sub.revolutLastOrderId && sub.revolutLastOrderId !== orderId) {
    if (sub.promotionCyclesRemaining > 0) {
      await subscriptionStore.decrementPromoCycles(sub.accountId);
    }
  }

  // Upgrade tier on all API keys
  await updateAccountTier(sub.accountId, tier);
  clearTierCache(sub.accountId);

  logger.info(
    {
      accountId: sub.accountId,
      tier,
      orderId,
      periodEnd: periodEnd.toISOString(),
    },
    'Subscription activated/renewed'
  );
}

async function handlePaymentFailed(orderId: string): Promise<void> {
  const resolved = await resolveSubscriptionForOrder(orderId);

  if (!resolved) {
    logger.warn(
      { orderId },
      'Payment failed for unknown subscription — ignoring'
    );
    return;
  }

  const { sub } = resolved;
  await subscriptionStore.updateStatus(sub.accountId, 'past_due');

  logger.warn(
    {
      accountId: sub.accountId,
      orderId,
      revolutSubscriptionId: sub.revolutSubscriptionId,
    },
    'Subscription payment failed — marked past_due'
  );
}
