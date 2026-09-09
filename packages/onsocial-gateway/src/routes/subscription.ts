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
  hasPaidAccess,
  getPromotion,
  getActivePromoForTier,
  promoAppliesToTier,
  resolvePrice,
  formatDiscount,
} from '../services/revolut/index.js';
import {
  computeTaxBreakdown,
  EU_COUNTRY_CODES,
  normalizeCountryCode,
  normalizeVatId,
} from '../services/billing/tax.js';
import { validateEuVatId } from '../services/billing/vies.js';
import {
  invoiceStore,
  issueInvoiceForOrder,
} from '../services/billing/invoices.js';
import {
  invoicePdfFilename,
  renderInvoicePdf,
} from '../services/billing/invoice-pdf.js';

export const subscriptionRouter = Router();

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

function formatMoneyMinor(minor: number, currency: string): string {
  const amount = (minor / 100).toFixed(2);
  return currency.toUpperCase() === 'USD'
    ? `$${amount}`
    : `${amount} ${currency}`;
}

/**
 * POST /developer/tax-preview
 *
 * Pre-checkout tax breakdown for a plan + billing identity.
 * List prices stay tax-inclusive; this only explains net / VAT / treatment.
 * Revolut still charges the inclusive total.
 *
 * Public by default (same idea as /plans). Optional `verifyVat: true` runs VIES
 * and requires a wallet JWT so we do not expose unauthenticated VIES traffic.
 *
 * Body: {
 *   tier: "pro" | "scale",
 *   country: string,
 *   companyName?: string,
 *   vatId?: string,
 *   verifyVat?: boolean   // run VIES when EU + VAT ID (debounced from portal)
 * }
 */
subscriptionRouter.post(
  '/tax-preview',
  async (req: Request, res: Response) => {
    const { tier, country, companyName, vatId, verifyVat } = req.body ?? {};

    if (!tier || !subscribableTiers().includes(tier)) {
      res.status(400).json({
        error: `Invalid tier. Choose one of: ${subscribableTiers().join(', ')}`,
      });
      return;
    }

    const plan = getPlan(tier);
    if (!plan) {
      res.status(400).json({ error: 'Unknown plan' });
      return;
    }

    const billingCountry = normalizeCountryCode(
      typeof country === 'string' ? country : ''
    );
    if (!billingCountry) {
      res.status(400).json({
        error: 'Billing country is required (ISO 3166-1 alpha-2, e.g. GB)',
      });
      return;
    }

    let billingCompanyName =
      typeof companyName === 'string' && companyName.trim()
        ? companyName.trim().slice(0, 120)
        : null;
    const billingVatId =
      typeof vatId === 'string' ? normalizeVatId(vatId) : null;
    if (typeof vatId === 'string' && vatId.trim() && !billingVatId) {
      res.status(400).json({ error: 'Invalid VAT / tax ID format' });
      return;
    }

    let vatVerified = false;
    let viesRequestId: string | null = null;
    let viesStatus: 'skipped' | 'verified' | 'invalid' | 'unavailable' =
      'skipped';

    const shouldVerify =
      Boolean(verifyVat) &&
      Boolean(billingVatId) &&
      EU_COUNTRY_CODES.has(billingCountry);

    if (shouldVerify && billingVatId) {
      if (!req.auth || req.auth.method === 'apikey') {
        res.status(401).json({
          error: 'Wallet login required to verify a VAT number',
        });
        return;
      }

      const vies = await validateEuVatId({
        country: billingCountry,
        vatId: billingVatId,
      });
      if (!vies.ok) {
        viesStatus = 'unavailable';
      } else if (!vies.valid) {
        viesStatus = 'invalid';
        res.status(400).json({
          error:
            vies.reason ||
            'VAT number is not valid. Check the number or leave VAT blank.',
          viesStatus,
        });
        return;
      } else {
        vatVerified = true;
        viesStatus = 'verified';
        viesRequestId = vies.requestIdentifier;
        if (!billingCompanyName && vies.name) {
          billingCompanyName = vies.name.slice(0, 120);
        }
      }
    }

    const promo = getActivePromoForTier(tier);
    const resolved = promo ? resolvePrice(plan, promo) : plan.amountMinor;
    const totalMinor =
      typeof resolved === 'number' && Number.isFinite(resolved)
        ? resolved
        : plan.amountMinor;

    let breakdown;
    try {
      breakdown = computeTaxBreakdown({
        totalMinor,
        currency: plan.currency,
        identity: {
          country: billingCountry,
          vatId: billingVatId,
          companyName: billingCompanyName,
          vatVerified,
        },
      });
    } catch {
      res.status(400).json({ error: 'Invalid billing country' });
      return;
    }

    const pendingViesNote =
      Boolean(billingVatId) &&
      EU_COUNTRY_CODES.has(billingCountry) &&
      !vatVerified &&
      viesStatus === 'skipped'
        ? ' EU VAT will be checked via VIES when you continue to checkout before reverse charge applies.'
        : '';

    res.json({
      tier: plan.tier,
      currency: breakdown.currency,
      totalMinor: breakdown.totalMinor,
      netMinor: breakdown.netMinor,
      taxMinor: breakdown.taxMinor,
      taxRateBps: breakdown.taxRateBps,
      taxTreatment: breakdown.treatment,
      taxNote: `${breakdown.note}${pendingViesNote}`.trim(),
      totalFormatted: formatMoneyMinor(
        breakdown.totalMinor,
        breakdown.currency
      ),
      netFormatted: formatMoneyMinor(breakdown.netMinor, breakdown.currency),
      taxFormatted: formatMoneyMinor(breakdown.taxMinor, breakdown.currency),
      vatVerified,
      viesStatus,
      viesRequestId,
      billingCountry,
      billingVatId,
      billingCompanyName,
      chargeNote:
        'You pay the tax-inclusive total. Revolut collects payment; your OnSocial tax invoice shows the VAT breakdown.',
    });
  }
);

/**
 * POST /developer/subscribe
 *
 * Create a Revolut subscription for a plan.
 * Returns a checkout_url (the setup order's hosted checkout page).
 *
 * Body: {
 *   tier: "pro" | "scale",
 *   email: string,
 *   country: string,           // ISO 3166-1 alpha-2
 *   companyName?: string,
 *   vatId?: string,
 *   promoCode?: string
 * }
 */
subscriptionRouter.post(
  '/subscribe',
  requireAuth,
  requireJwtAuth,
  async (req: Request, res: Response) => {
    const accountId = req.auth!.accountId;
    const { tier, email, promoCode, country, companyName, vatId } = req.body;

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

    const billingCountry = normalizeCountryCode(
      typeof country === 'string' ? country : ''
    );
    if (!billingCountry) {
      res.status(400).json({
        error: 'Billing country is required (ISO 3166-1 alpha-2, e.g. GB)',
      });
      return;
    }

    let billingCompanyName =
      typeof companyName === 'string' && companyName.trim()
        ? companyName.trim().slice(0, 120)
        : null;
    const billingVatId =
      typeof vatId === 'string' ? normalizeVatId(vatId) : null;
    if (typeof vatId === 'string' && vatId.trim() && !billingVatId) {
      res.status(400).json({ error: 'Invalid VAT / tax ID format' });
      return;
    }

    // EU reverse charge requires a live VIES pass — never honor-system.
    let billingVatVerified = false;
    let billingViesRequestId: string | null = null;
    if (billingVatId && EU_COUNTRY_CODES.has(billingCountry)) {
      const vies = await validateEuVatId({
        country: billingCountry,
        vatId: billingVatId,
      });
      if (!vies.ok) {
        res.status(503).json({
          error:
            'VAT verification service is temporarily unavailable. Try again shortly, or leave VAT blank to continue without reverse charge.',
        });
        return;
      }
      if (!vies.valid) {
        res.status(400).json({
          error:
            vies.reason ||
            'VAT number is not valid. Check the number or leave VAT blank.',
        });
        return;
      }
      billingVatVerified = true;
      billingViesRequestId = vies.requestIdentifier;
      if (!billingCompanyName && vies.name) {
        billingCompanyName = vies.name.slice(0, 120);
      }
    }

    // Preview tax treatment (list prices are tax-inclusive; Revolut charge unchanged)
    const planForTax = getPlan(tier);
    if (planForTax) {
      try {
        computeTaxBreakdown({
          totalMinor: planForTax.amountMinor,
          currency: planForTax.currency,
          identity: {
            country: billingCountry,
            vatId: billingVatId,
            companyName: billingCompanyName,
            vatVerified: billingVatVerified,
          },
        });
      } catch {
        res.status(400).json({ error: 'Invalid billing country' });
        return;
      }
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
              // Persist latest billing identity so invoices match checkout.
              await subscriptionStore.upsert({
                ...existing,
                billingEmail: email.trim(),
                billingCountry,
                billingCompanyName,
                billingVatId,
                billingVatVerified,
                billingViesRequestId,
              });
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
      // Preserve prior paid access via grace while checkout is pending so
      // upgrades/downgrades do not drop the account to free mid-payment.
      const hadPaidAccess = existing ? hasPaidAccess(existing) : false;
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
        // Only set after ORDER_COMPLETED — keeps webhook idempotency correct
        revolutLastOrderId: null,
        promotionCode: promo?.code || null,
        promotionCyclesRemaining: promo ? promo.durationCycles : 0,
        currentPeriodStart: now.toISOString(),
        currentPeriodEnd: periodEnd.toISOString(),
        graceTier: hadPaidAccess && existing ? existing.tier : null,
        gracePeriodEnd:
          hadPaidAccess && existing ? existing.currentPeriodEnd : null,
        billingEmail: email.trim(),
        billingCountry,
        billingCompanyName,
        billingVatId,
        billingVatVerified,
        billingViesRequestId,
      });

      logger.info(
        {
          accountId,
          tier,
          revolutSubscriptionId: sub.id,
          setupOrderId: sub.setup_order_id,
          subscriptionId,
          promo: promo?.code,
          billingVatVerified,
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
          billingEmail: sub.billingEmail ?? null,
          billingCountry: sub.billingCountry ?? null,
          billingCompanyName: sub.billingCompanyName ?? null,
          billingVatId: sub.billingVatId ?? null,
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
 * GET /developer/invoices
 * List tax invoices for the authenticated account (newest first).
 */
subscriptionRouter.get(
  '/invoices',
  requireAuth,
  requireJwtAuth,
  async (req: Request, res: Response) => {
    try {
      const invoices = await invoiceStore.listByAccount(req.auth!.accountId);
      res.json({ invoices });
    } catch (error) {
      req.log.error({ error }, 'Failed to list invoices');
      res.status(500).json({ error: 'Failed to list invoices' });
    }
  }
);

/**
 * GET /developer/invoices/:id/pdf
 * Download tax invoice as PDF.
 */
subscriptionRouter.get(
  '/invoices/:id/pdf',
  requireAuth,
  requireJwtAuth,
  async (req: Request, res: Response) => {
    try {
      const invoice = await invoiceStore.getById(
        req.auth!.accountId,
        String(req.params.id)
      );
      if (!invoice) {
        res.status(404).json({ error: 'Invoice not found' });
        return;
      }

      const pdf = renderInvoicePdf(invoice);
      const filename = invoicePdfFilename(invoice);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"`
      );
      res.setHeader('Content-Length', String(pdf.length));
      res.status(200).send(pdf);
    } catch (error) {
      req.log.error({ error }, 'Failed to render invoice PDF');
      res.status(500).json({ error: 'Failed to render invoice PDF' });
    }
  }
);

/**
 * GET /developer/invoices/:id
 */
subscriptionRouter.get(
  '/invoices/:id',
  requireAuth,
  requireJwtAuth,
  async (req: Request, res: Response) => {
    try {
      const invoice = await invoiceStore.getById(
        req.auth!.accountId,
        String(req.params.id)
      );
      if (!invoice) {
        res.status(404).json({ error: 'Invoice not found' });
        return;
      }
      res.json({ invoice });
    } catch (error) {
      req.log.error({ error }, 'Failed to fetch invoice');
      res.status(500).json({ error: 'Failed to fetch invoice' });
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

    if (sub.billingCountry && sub.billingEmail) {
      try {
        await issueInvoiceForOrder({
          accountId,
          tier: sub.tier,
          revolutOrderId: orderId,
          currency: plan.currency,
          totalMinor: plan.amountMinor,
          billingEmail: sub.billingEmail,
          billingCountry: sub.billingCountry,
          billingCompanyName: sub.billingCompanyName,
          billingVatId: sub.billingVatId,
          vatVerified: Boolean(sub.billingVatVerified),
          viesRequestId: sub.billingViesRequestId,
          periodStart: now.toISOString(),
          periodEnd: periodEnd.toISOString(),
        });
      } catch (err) {
        logger.warn(
          { err, accountId, orderId },
          'Failed to issue invoice on dev-complete'
        );
      }
    }

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

/**
 * Non-production recovery: activate a paid Revolut order after webhook miss
 * (e.g. signing-secret mismatch / in-memory store restart).
 *
 * Body: {
 *   orderId: string,
 *   revolutSubscriptionId?: string,
 *   tier?: "pro" | "scale"
 * }
 */
subscriptionRouter.post(
  '/subscription/dev-recover',
  requireAuth,
  requireJwtAuth,
  async (req: Request, res: Response) => {
    if (config.nodeEnv === 'production') {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    const accountId = req.auth!.accountId;
    const orderId =
      typeof req.body?.orderId === 'string' ? req.body.orderId.trim() : '';
    if (!orderId) {
      res.status(400).json({ error: 'orderId is required' });
      return;
    }

    const revolut = await config.getRevolutClient();
    if (!revolut) {
      res.status(503).json({ error: 'Payment service not configured' });
      return;
    }

    let order;
    try {
      order = await revolut.getOrder(orderId);
    } catch (err) {
      logger.warn({ err, orderId }, 'dev-recover: failed to fetch order');
      res.status(404).json({ error: 'Order not found in Revolut' });
      return;
    }

    const orderState = String(order.state || '').toLowerCase();
    if (orderState !== 'completed') {
      res.status(409).json({
        error: `Order is ${order.state || 'unknown'}, expected completed`,
      });
      return;
    }

    const externalRef =
      typeof order.merchant_order_ext_ref === 'string'
        ? order.merchant_order_ext_ref
        : undefined;

    let tier =
      typeof req.body?.tier === 'string'
        ? req.body.tier.trim().toLowerCase()
        : '';
    const revolutSubscriptionId =
      typeof req.body?.revolutSubscriptionId === 'string'
        ? req.body.revolutSubscriptionId.trim()
        : '';

    if (!tier && externalRef?.includes(':')) {
      const parts = externalRef.split(':');
      const refTier = parts[1];
      if (refTier) tier = refTier.toLowerCase();
    }
    if (!tier && order.metadata?.tier) {
      tier = String(order.metadata.tier).toLowerCase();
    }
    if (!tier) {
      tier = 'pro';
    }

    if (!subscribableTiers().includes(tier)) {
      res.status(400).json({ error: `Invalid tier: ${tier}` });
      return;
    }

    const plan = getPlan(tier);
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

    const existing = await subscriptionStore.getByAccount(accountId);
    const subscriptionId = existing?.id || randomUUID();

    await subscriptionStore.upsert({
      id: subscriptionId,
      accountId,
      tier: plan.tier,
      status: 'pending',
      revolutSubscriptionId:
        revolutSubscriptionId || existing?.revolutSubscriptionId || null,
      revolutCustomerId:
        existing?.revolutCustomerId || order.customer?.id || null,
      revolutSetupOrderId: orderId,
      revolutLastOrderId: null,
      promotionCode: existing?.promotionCode || null,
      promotionCyclesRemaining: existing?.promotionCyclesRemaining || 0,
      currentPeriodStart: now.toISOString(),
      currentPeriodEnd: periodEnd.toISOString(),
      graceTier: null,
      gracePeriodEnd: null,
      billingEmail: existing?.billingEmail || null,
      billingCountry: existing?.billingCountry || null,
      billingCompanyName: existing?.billingCompanyName || null,
      billingVatId: existing?.billingVatId || null,
      billingVatVerified: Boolean(existing?.billingVatVerified),
      billingViesRequestId: existing?.billingViesRequestId || null,
    });

    await subscriptionStore.updatePeriod(
      accountId,
      now.toISOString(),
      periodEnd.toISOString(),
      orderId
    );
    await updateAccountTier(accountId, plan.tier);
    clearTierCache(accountId);

    if (existing?.billingCountry && existing.billingEmail) {
      try {
        await issueInvoiceForOrder({
          accountId,
          tier: plan.tier,
          revolutOrderId: orderId,
          currency: plan.currency,
          totalMinor: plan.amountMinor,
          billingEmail: existing.billingEmail,
          billingCountry: existing.billingCountry,
          billingCompanyName: existing.billingCompanyName,
          billingVatId: existing.billingVatId,
          vatVerified: Boolean(existing.billingVatVerified),
          viesRequestId: existing.billingViesRequestId,
          periodStart: now.toISOString(),
          periodEnd: periodEnd.toISOString(),
        });
      } catch (err) {
        logger.warn(
          { err, accountId, orderId },
          'Failed to issue invoice on dev-recover'
        );
      }
    }

    logger.info(
      {
        accountId,
        tier: plan.tier,
        orderId,
        revolutSubscriptionId: revolutSubscriptionId || null,
      },
      'Subscription recovered via dev-recover from completed Revolut order'
    );

    res.json({
      status: 'active',
      subscription: {
        tier: plan.tier,
        currentPeriodStart: now.toISOString(),
        currentPeriodEnd: periodEnd.toISOString(),
        orderId,
      },
    });
  }
);
