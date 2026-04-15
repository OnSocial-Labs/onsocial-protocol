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
import { clearTierCache, isAdmin } from '../tiers/index.js';
import { updateAccountTier } from '../services/apikeys/index.js';
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

function hasPaidAccess(sub: {
  status: string;
  currentPeriodEnd: string;
}): boolean {
  return (
    sub.status !== 'pending' && new Date(sub.currentPeriodEnd) > new Date()
  );
}

function normalizeRevolutState(value?: string | null): string {
  return value?.trim().toLowerCase() || '';
}

function isResumableSetupOrderState(state: string): boolean {
  return ['created', 'pending', 'processing', 'authorized'].includes(
    normalizeRevolutState(state)
  );
}

function isTerminalSetupOrderState(state: string): boolean {
  return ['completed', 'failed', 'cancelled', 'expired'].includes(
    normalizeRevolutState(state)
  );
}

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

// Auth middleware applied per-route below (not router-wide) so /plans stays public

/**
 * POST /developer/subscribe
 *
 * Create a Revolut subscription for a plan.
 * Returns a checkout_url (the setup order's hosted checkout page).
 *
 * Body: { tier: "pro" | "scale", email: string, promoCode?: string }
 */
subscriptionRouter.post(
  '/subscribe',
  requireAuth,
  requireJwtAuth,
  async (req: Request, res: Response) => {
    const accountId = req.auth!.accountId;
    const { tier, email, promoCode } = req.body;

    // Build redirect URL from Origin header so Revolut sends users back to keys page
    // Skip localhost — Revolut production API rejects it
    const origin = req.headers.origin;
    const redirectUrl =
      origin && !origin.includes('localhost')
        ? `${origin}/onapi/keys?checkout=success`
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

    const revolut = await config.getRevolutClient();
    if (!revolut) {
      res.status(503).json({ error: 'Payment service not configured' });
      return;
    }

    // Check if the account still has paid access in the current billing period.
    const existing = await subscriptionStore.getWithValidPeriod(accountId);
    if (existing) {
      const existingPlan = getPlan(existing.tier);
      const requestedPlan = getPlan(tier)!;
      let clearedPendingSetup = false;

      if (existing.status === 'pending') {
        if (existing.revolutSetupOrderId) {
          try {
            const setupOrder = await revolut.getOrder(
              existing.revolutSetupOrderId
            );

            if (
              isResumableSetupOrderState(setupOrder.state) &&
              setupOrder.checkout_url
            ) {
              res.json({
                checkoutUrl: setupOrder.checkout_url,
                orderId: existing.revolutSetupOrderId,
                subscriptionId: existing.revolutSubscriptionId,
                plan: {
                  tier: requestedPlan.tier,
                  name: requestedPlan.name,
                  price: formatPrice(requestedPlan),
                  rateLimit: requestedPlan.rateLimit,
                },
                pending: true,
              });
              return;
            }

            if (isTerminalSetupOrderState(setupOrder.state)) {
              await subscriptionStore.updateStatus(accountId, 'cancelled');
              clearedPendingSetup = true;
            } else {
              res.status(409).json({
                error: `Subscription setup for ${existing.tier} is still pending confirmation.`,
                subscription: existing,
              });
              return;
            }
          } catch (err) {
            logger.warn(
              {
                err,
                accountId,
                setupOrderId: existing.revolutSetupOrderId,
              },
              'Failed to inspect pending Revolut setup order'
            );
            res.status(409).json({
              error: `Subscription setup for ${existing.tier} is still pending confirmation.`,
              subscription: existing,
            });
            return;
          }
        } else {
          res.status(409).json({
            error: `Subscription setup for ${existing.tier} is still pending confirmation.`,
            subscription: existing,
          });
          return;
        }
      }

      // Same tier — already subscribed
      if (
        !clearedPendingSetup &&
        existingPlan &&
        existingPlan.amountMinor === requestedPlan.amountMinor
      ) {
        res.status(409).json({
          error: `Already subscribed to ${existing.tier} (active until ${existing.currentPeriodEnd})`,
          subscription: existing,
        });
        return;
      }

      // Upgrade or downgrade — cancel old Revolut subscription, then fall
      // through to create a new checkout on the requested tier.
      // Revolut doesn't support changing plan_variation_id on an existing
      // subscription, so we must cancel + re-create.
      if (!clearedPendingSetup && existing.revolutSubscriptionId) {
        try {
          await revolut.cancelSubscription(existing.revolutSubscriptionId);
        } catch (err) {
          logger.warn(
            {
              err,
              accountId,
              revolutSubscriptionId: existing.revolutSubscriptionId,
            },
            'Revolut cancel failed during tier change'
          );
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
    let promo = promoCode
      ? getPromotion(promoCode)
      : getActivePromoForTier(tier);
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
      // If downgrading, preserve the old higher tier as a grace period so rate
      // limits aren't cut immediately.
      const oldPlan = existing ? getPlan(existing.tier) : null;
      const isDowngrade =
        existing &&
        oldPlan &&
        oldPlan.amountMinor > plan.amountMinor &&
        hasPaidAccess(existing);
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
        status: 'pending', // activated by webhook after payment confirmed
        revolutSubscriptionId: sub.id,
        revolutCustomerId: customer.id,
        revolutSetupOrderId: sub.setup_order_id || null,
        revolutLastOrderId: sub.setup_order_id || null,
        promotionCode: promo?.code || null,
        promotionCyclesRemaining: promo ? promo.durationCycles : 0,
        currentPeriodStart: now.toISOString(),
        currentPeriodEnd: periodEnd.toISOString(),
        graceTier: isDowngrade ? existing.tier : null,
        gracePeriodEnd: isDowngrade ? existing.currentPeriodEnd : null,
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
  }
);

/**
 * GET /developer/subscription
 * Get current subscription for the authenticated account.
 */
subscriptionRouter.get(
  '/subscription',
  requireAuth,
  requireJwtAuth,
  async (req: Request, res: Response) => {
    const accountId = req.auth!.accountId;
    const admin = isAdmin(accountId);
    try {
      const sub = await subscriptionStore.getByAccount(accountId);

      if (!sub) {
        res.json({
          subscription: null,
          tier: admin ? 'service' : 'free',
          admin,
        });
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
          graceTier: sub.graceTier ?? null,
          gracePeriodEnd: sub.gracePeriodEnd ?? null,
        },
        tier: admin ? 'service' : hasPaidAccess(sub) ? sub.tier : 'free',
        admin,
      });
    } catch (error) {
      req.log.error({ error }, 'Failed to fetch subscription');
      // Degrade gracefully — treat as free tier (or service for admins)
      res.json({ subscription: null, tier: admin ? 'service' : 'free', admin });
    }
  }
);

/**
 * POST /developer/subscription/cancel
 * Cancel subscription via Revolut — no further billing cycles will be created.
 */
subscriptionRouter.post(
  '/subscription/cancel',
  requireAuth,
  requireJwtAuth,
  async (req: Request, res: Response) => {
    const accountId = req.auth!.accountId;
    const sub = await subscriptionStore.getWithValidPeriod(accountId);

    if (!sub) {
      res.status(404).json({ error: 'No active subscription' });
      return;
    }

    // Cancel in Revolut (best-effort — still cancel locally even if Revolut fails)
    if (sub.revolutSubscriptionId) {
      const revolut = await config.getRevolutClient();
      if (revolut) {
        try {
          await revolut.cancelSubscription(sub.revolutSubscriptionId);
        } catch (err) {
          // Log but don't block — subscription may already be cancelled/pending in Revolut
          logger.warn(
            {
              err,
              accountId,
              revolutSubscriptionId: sub.revolutSubscriptionId,
            },
            'Revolut cancel failed (best-effort) — cancelling locally'
          );
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

subscriptionRouter.post(
  '/subscription/dev-complete',
  requireAuth,
  requireJwtAuth,
  async (req: Request, res: Response) => {
    if (config.nodeEnv === 'production') {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    const accountId = req.auth!.accountId;
    const sub = await subscriptionStore.getByAccount(accountId);

    if (!sub) {
      res.status(404).json({ error: 'No subscription found' });
      return;
    }

    const plan = getPlan(sub.tier);
    if (!plan) {
      res.status(400).json({ error: 'Unknown subscription tier' });
      return;
    }

    const now = new Date();
    const periodEnd = new Date(now);
    if (plan.interval === 'month') {
      periodEnd.setMonth(periodEnd.getMonth() + plan.intervalCount);
    } else {
      periodEnd.setFullYear(periodEnd.getFullYear() + plan.intervalCount);
    }

    const orderId =
      sub.revolutSetupOrderId || sub.revolutLastOrderId || `dev-${Date.now()}`;

    await subscriptionStore.updatePeriod(
      accountId,
      now.toISOString(),
      periodEnd.toISOString(),
      orderId
    );

    await updateAccountTier(accountId, sub.tier);
    clearTierCache(accountId);

    logger.info(
      { accountId, tier: sub.tier, orderId },
      'Subscription marked active via dev completion endpoint'
    );

    res.json({
      status: 'active',
      subscription: {
        tier: sub.tier,
        currentPeriodStart: now.toISOString(),
        currentPeriodEnd: periodEnd.toISOString(),
      },
    });
  }
);
