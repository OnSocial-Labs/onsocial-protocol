/**
 * Subscription routes — tier upgrades via Revolut Subscriptions API.
 *
 * POST   /developer/subscribe         → create Revolut subscription + redirect to checkout
 * GET    /developer/subscription       → get current subscription
 * POST   /developer/subscription/cancel → cancel subscription via Revolut
 *
 * All routes require JWT auth (wallet session).
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { requireAuth } from '../middleware/index.js';
import { config } from '../config/index.js';
import { logger } from '../logger.js';
import {
  getPlan,
  subscribableTiers,
  SUBSCRIPTION_PLANS,
  formatPrice,
  subscriptionStore,
  getPromotion,
  getActivePromoForTier,
  promoAppliesToTier,
  resolvePrice,
  formatDiscount,
} from '../services/revolut/index.js';

export const subscriptionRouter = Router();

// ── Public endpoints (no auth required) ───────────────────────

/**
 * GET /developer/plans
 * Public endpoint: list available subscription plans.
 */
subscriptionRouter.get('/plans', (_req: Request, res: Response) => {
  res.json({
    plans: SUBSCRIPTION_PLANS.map((p) => {
      const promo = getActivePromoForTier(p.tier);
      return {
        tier: p.tier,
        name: p.name,
        price: formatPrice(p),
        amountMinor: p.amountMinor,
        currency: p.currency,
        interval: p.interval,
        rateLimit: p.rateLimit,
        ...(promo && {
          promotion: {
            name: promo.name,
            discountPercent: promo.discountPercent,
            durationCycles: promo.durationCycles,
            discountedAmountMinor: resolvePrice(p, promo),
            discountedPrice: formatDiscount(p, promo),
          },
        }),
      };
    }),
  });
});

// ── Authenticated endpoints ───────────────────────────────────

// JWT-only auth (same pattern as developer.ts)
function requireJwtAuth(req: Request, res: Response, next: () => void): void {
  if (!req.auth) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (req.auth.method === 'apikey') {
    res
      .status(403)
      .json({ error: 'Use JWT (wallet login) for subscription management.' });
    return;
  }
  next();
}

subscriptionRouter.use(requireAuth);
subscriptionRouter.use(requireJwtAuth);

/**
 * POST /developer/subscribe
 *
 * Create a Revolut subscription for a plan.
 * Returns a checkout_url (the setup order's hosted checkout page).
 *
 * Body: { tier: "pro" | "scale", email: string, promoCode?: string }
 */
subscriptionRouter.post('/subscribe', async (req: Request, res: Response) => {
  const accountId = req.auth!.accountId;
  const { tier, email, promoCode } = req.body;

  // Build redirect URL from Origin header so Revolut sends users back to billing
  const origin = req.headers.origin;
  const redirectUrl = origin
    ? `${origin}/onapi/billing?checkout=success`
    : undefined;

  // Validate tier
  if (!tier || !subscribableTiers().includes(tier)) {
    res.status(400).json({
      error: `Invalid tier. Choose one of: ${subscribableTiers().join(', ')}`,
    });
    return;
  }

  // Email required for Revolut customer creation
  if (!email || typeof email !== 'string') {
    res
      .status(400)
      .json({ error: 'Email address is required for subscription billing' });
    return;
  }

  const revolut = config.revolutClient;
  if (!revolut) {
    res.status(503).json({ error: 'Payment service not configured' });
    return;
  }

  // Check if already subscribed to same or higher tier
  const existing = await subscriptionStore.getActiveByAccount(accountId);
  if (existing) {
    const existingPlan = getPlan(existing.tier);
    const requestedPlan = getPlan(tier)!;
    if (existingPlan && existingPlan.amountMinor >= requestedPlan.amountMinor) {
      res.status(409).json({
        error: `Already subscribed to ${existing.tier} (active until ${existing.currentPeriodEnd})`,
        subscription: existing,
      });
      return;
    }
    // Upgrading — cancel old subscription first if it's via Revolut
    if (existing.revolutSubscriptionId) {
      try {
        await revolut.cancelSubscription(existing.revolutSubscriptionId);
      } catch {
        // Best effort — may already be cancelled
      }
    }
  }

  const plan = getPlan(tier)!;

  // Ensure plan has a Revolut variation ID
  if (!plan.revolutPlanVariationId) {
    res.status(503).json({
      error:
        'Subscription plans not yet configured. Run setup-revolut-plans.ts first.',
    });
    return;
  }

  // Resolve promotion: explicit code > auto-applied active promo
  let promo = promoCode ? getPromotion(promoCode) : getActivePromoForTier(tier);
  if (promoCode && !promo) {
    res.status(400).json({ error: 'Invalid or expired promo code' });
    return;
  }
  if (promo && !promoAppliesToTier(promo, tier)) {
    promo = undefined;
  }

  const subscriptionId = randomUUID();

  try {
    // 1. Create or find Revolut customer
    const customer = await revolut.getOrCreateCustomer(email, accountId);

    // 2. Create Revolut subscription
    const sub = await revolut.createSubscription({
      planVariationId: plan.revolutPlanVariationId,
      customerId: customer.id,
      redirectUrl,
      externalReference: `${accountId}:${tier}`,
    });

    // 3. Get the setup order for checkout URL
    let checkoutUrl: string | undefined;
    if (sub.setup_order_id) {
      const setupOrder = await revolut.getOrder(sub.setup_order_id);
      checkoutUrl = setupOrder.checkout_url;
    }

    if (!checkoutUrl) {
      res
        .status(502)
        .json({ error: 'Failed to get checkout URL from subscription' });
      return;
    }

    // 4. Store subscription in our DB (pending until webhook confirms payment)
    const now = new Date();
    const periodEnd = new Date(now);
    if (plan.interval === 'month') {
      periodEnd.setMonth(periodEnd.getMonth() + plan.intervalCount);
    } else {
      periodEnd.setFullYear(periodEnd.getFullYear() + plan.intervalCount);
    }

    await subscriptionStore.upsert({
      id: subscriptionId,
      accountId,
      tier: plan.tier,
      status: 'active', // will be confirmed by webhook
      revolutSubscriptionId: sub.id,
      revolutCustomerId: customer.id,
      revolutSetupOrderId: sub.setup_order_id || null,
      revolutLastOrderId: sub.setup_order_id || null,
      promotionCode: promo?.code || null,
      promotionCyclesRemaining: promo ? promo.durationCycles : 0,
      currentPeriodStart: now.toISOString(),
      currentPeriodEnd: periodEnd.toISOString(),
    });

    logger.info(
      {
        accountId,
        tier,
        revolutSubscriptionId: sub.id,
        setupOrderId: sub.setup_order_id,
        subscriptionId,
        promo: promo?.code,
      },
      'Revolut subscription created'
    );

    res.json({
      checkoutUrl,
      orderId: sub.setup_order_id,
      subscriptionId: sub.id,
      plan: {
        tier: plan.tier,
        name: plan.name,
        price: formatPrice(plan),
        rateLimit: plan.rateLimit,
      },
      ...(promo && {
        promotion: {
          code: promo.code,
          name: promo.name,
          discountPercent: promo.discountPercent,
          durationCycles: promo.durationCycles,
          effectivePrice: formatDiscount(plan, promo),
        },
      }),
    });
  } catch (err) {
    logger.error({ err, accountId, tier }, 'Failed to create subscription');
    res.status(502).json({ error: 'Failed to create subscription' });
  }
});

/**
 * GET /developer/subscription
 * Get current subscription for the authenticated account.
 */
subscriptionRouter.get('/subscription', async (req: Request, res: Response) => {
  const accountId = req.auth!.accountId;
  const sub = await subscriptionStore.getByAccount(accountId);

  if (!sub) {
    res.json({ subscription: null, tier: 'free' });
    return;
  }

  const plan = getPlan(sub.tier);
  res.json({
    subscription: {
      id: sub.id,
      tier: sub.tier,
      status: sub.status,
      currentPeriodStart: sub.currentPeriodStart,
      currentPeriodEnd: sub.currentPeriodEnd,
      price: plan ? formatPrice(plan) : null,
      promotionCode: sub.promotionCode ?? null,
      promotionCyclesRemaining: sub.promotionCyclesRemaining ?? 0,
    },
    tier:
      sub.status === 'active' && new Date(sub.currentPeriodEnd) > new Date()
        ? sub.tier
        : 'free',
  });
});

/**
 * POST /developer/subscription/cancel
 * Cancel subscription via Revolut — no further billing cycles will be created.
 */
subscriptionRouter.post(
  '/subscription/cancel',
  async (req: Request, res: Response) => {
    const accountId = req.auth!.accountId;
    const sub = await subscriptionStore.getActiveByAccount(accountId);

    if (!sub) {
      res.status(404).json({ error: 'No active subscription' });
      return;
    }

    // Cancel in Revolut first
    if (sub.revolutSubscriptionId) {
      const revolut = config.revolutClient;
      if (revolut) {
        try {
          await revolut.cancelSubscription(sub.revolutSubscriptionId);
        } catch (err) {
          logger.error(
            {
              err,
              accountId,
              revolutSubscriptionId: sub.revolutSubscriptionId,
            },
            'Failed to cancel Revolut subscription'
          );
          res.status(502).json({
            error: 'Failed to cancel subscription with payment provider',
          });
          return;
        }
      }
    }

    await subscriptionStore.updateStatus(accountId, 'cancelled');
    logger.info(
      {
        accountId,
        tier: sub.tier,
        revolutSubscriptionId: sub.revolutSubscriptionId,
      },
      'Subscription cancelled'
    );

    res.json({
      status: 'cancelled',
      message: `Subscription cancelled. ${sub.tier} access continues until ${sub.currentPeriodEnd}.`,
      activeUntil: sub.currentPeriodEnd,
    });
  }
);
