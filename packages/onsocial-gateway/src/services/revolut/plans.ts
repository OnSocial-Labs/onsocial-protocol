/**
 * Subscription plans & promotions — single source of truth for tier pricing.
 *
 * Add, remove, or re-price tiers by editing the SUBSCRIPTION_PLANS array.
 * Add time-limited discounts by editing the PROMOTIONS array.
 * Everything else (routes, webhooks, billing cron) reads from here.
 *
 * Amounts are in **minor currency units** (e.g. cents for USD).
 */

import type { Tier } from '../../types/index.js';

export interface SubscriptionPlan {
  /** Plan identifier — matches the Tier type ('pro', 'scale', etc.) */
  tier: Exclude<Tier, 'free' | 'service'>;
  /** Display name */
  name: string;
  /** Price in minor units (e.g. 4900 = $49.00) */
  amountMinor: number;
  /** ISO 4217 currency code */
  currency: string;
  /** Billing interval */
  interval: 'month' | 'year';
  /** Number of intervals per billing cycle (1 = every month, 12 = annual) */
  intervalCount: number;
  /** Human-readable description (shown on checkout) */
  description: string;
  /** Rate limit (requests per minute) */
  rateLimit: number;
  /** Revolut plan variation UUID — set via env var after running setup-revolut-plans.ts */
  revolutPlanVariationId?: string;
}

// --- Promotions ------------------------------------------------------------

export interface Promotion {
  /** Unique code customers enter (uppercased on lookup) */
  code: string;
  /** Human-readable name */
  name: string;
  /** Discount percentage (0–100). e.g. 50 = 50% off */
  discountPercent: number;
  /** How many billing cycles the discount applies (e.g. 3 = first 3 months) */
  durationCycles: number;
  /** Which tiers this promotion applies to (empty = all subscribable tiers) */
  tiers: string[];
  /** Promotion is only valid between these dates (inclusive). Omit for no date restriction. */
  validFrom?: string; // ISO 8601
  validUntil?: string; // ISO 8601
  /** Max total redemptions (undefined = unlimited) */
  maxRedemptions?: number;
  /** Whether this promo is currently active */
  active: boolean;
}

/**
 * Active subscription plans.
 *
 * To add a tier:   push a new entry.
 * To remove a tier: delete the entry (existing subs expire naturally).
 * To re-price:     change amountMinor (takes effect on next billing cycle).
 */
export const SUBSCRIPTION_PLANS: readonly SubscriptionPlan[] = [
  {
    tier: 'pro',
    name: 'Pro',
    amountMinor: 4900,
    currency: 'USD',
    interval: 'month',
    intervalCount: 1,
    description: 'OnSocial API Pro — 600 req/min',
    rateLimit: 600,
  },
  {
    tier: 'scale',
    name: 'Scale',
    amountMinor: 19900,
    currency: 'USD',
    interval: 'month',
    intervalCount: 1,
    description: 'OnSocial API Scale — 3,000 req/min',
    rateLimit: 3000,
  },
] as const;

/** Map tier → env var name for Revolut plan variation IDs */
const VARIATION_ENV: Record<string, string> = {
  pro: 'REVOLUT_PRO_VARIATION_ID',
  scale: 'REVOLUT_SCALE_VARIATION_ID',
};

/**
 * Active promotions.
 *
 * To add a promo:    push a new entry with a unique code.
 * To deactivate:     set active: false (existing promos expire naturally).
 * To change terms:   edit discountPercent or durationCycles (existing subs keep their original terms).
 *
 * Example: first 3 months at 50% off for Pro tier:
 *   { code: 'LAUNCH50', name: 'Launch discount', discountPercent: 50, durationCycles: 3, tiers: ['pro'], active: true }
 */
export const PROMOTIONS: readonly Promotion[] = [
  // {
  //   code: 'LAUNCH50',
  //   name: '50% off first 3 months',
  //   discountPercent: 50,
  //   durationCycles: 3,
  //   tiers: [],           // empty = all tiers
  //   active: true,
  // },
] as const;

/** Lookup plan by tier name (resolves variation ID lazily from process.env) */
export function getPlan(tier: string): SubscriptionPlan | undefined {
  const plan = SUBSCRIPTION_PLANS.find((p) => p.tier === tier);
  if (!plan) return undefined;
  const envName = VARIATION_ENV[plan.tier];
  const variationId = envName ? process.env[envName] || undefined : undefined;
  return { ...plan, revolutPlanVariationId: variationId };
}

/** All subscribable tier names */
export function subscribableTiers(): string[] {
  return SUBSCRIPTION_PLANS.map((p) => p.tier);
}

/** Format minor units to display price (e.g. 4900 → "$49.00") */
export function formatPrice(plan: SubscriptionPlan): string {
  const major = (plan.amountMinor / 100).toFixed(2);
  const symbol = plan.currency === 'USD' ? '$' : plan.currency;
  return `${symbol}${major}/${plan.interval}`;
}

// --- Promotion helpers -----------------------------------------------------

/** Lookup a promotion by code (case-insensitive). Returns undefined if not found or inactive. */
export function getPromotion(code: string): Promotion | undefined {
  const upper = code.toUpperCase();
  const promo = PROMOTIONS.find((p) => p.code === upper);
  if (!promo || !promo.active) return undefined;

  const now = new Date();
  if (promo.validFrom && now < new Date(promo.validFrom)) return undefined;
  if (promo.validUntil && now > new Date(promo.validUntil)) return undefined;

  return promo;
}

/** Check if a promotion applies to a given tier */
export function promoAppliesToTier(promo: Promotion, tier: string): boolean {
  return promo.tiers.length === 0 || promo.tiers.includes(tier);
}

/** Calculate the discounted amount in minor units */
export function resolvePrice(
  plan: SubscriptionPlan,
  promo?: Promotion
): number {
  if (!promo) return plan.amountMinor;
  if (!promoAppliesToTier(promo, plan.tier)) return plan.amountMinor;
  const discount = Math.round((plan.amountMinor * promo.discountPercent) / 100);
  return plan.amountMinor - discount;
}

/** Format the discount summary for display */
export function formatDiscount(
  plan: SubscriptionPlan,
  promo: Promotion
): string {
  const discounted = resolvePrice(plan, promo);
  const fullPrice = formatPrice(plan);
  const discountedMajor = (discounted / 100).toFixed(2);
  const symbol = plan.currency === 'USD' ? '$' : plan.currency;
  return `${symbol}${discountedMajor}/${plan.interval} (${promo.discountPercent}% off for ${promo.durationCycles} ${plan.interval}s, then ${fullPrice})`;
}

/** Find the best active promotion for a given tier (if any). */
export function getActivePromoForTier(tier: string): Promotion | undefined {
  const now = new Date();
  return PROMOTIONS.find((p) => {
    if (!p.active) return false;
    if (p.validFrom && now < new Date(p.validFrom)) return false;
    if (p.validUntil && now > new Date(p.validUntil)) return false;
    return p.tiers.length === 0 || p.tiers.includes(tier);
  });
}
