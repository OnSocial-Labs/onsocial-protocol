/**
 * Resolve Revolut plan variation IDs for tax-inclusive checkout totals.
 *
 * Base plans in setup-revolut-plans.ts use net amounts (no tax). When tax applies,
 * we find or create a dedicated Revolut plan at the gross total so subscription
 * renewals charge the same amount as the tax invoice.
 */

import type { RevolutClient } from './client.js';
import type { SubscriptionPlan } from './plans.js';

const variationCache = new Map<string, string>();

function cacheKey(
  tier: string,
  currency: string,
  totalMinor: number
): string {
  return `${tier}:${currency}:${totalMinor}`;
}

function grossPlanName(plan: SubscriptionPlan, totalMinor: number): string {
  const major = (totalMinor / 100).toFixed(2);
  return `OnSocial API ${plan.name} ${plan.currency} ${major} gross`;
}

/**
 * Returns a Revolut plan_variation_id whose phase amount equals chargeTotalMinor.
 * Uses the default env-linked variation when charge equals the net plan price.
 */
export async function resolveRevolutPlanVariationId(
  client: RevolutClient,
  plan: SubscriptionPlan,
  chargeTotalMinor: number
): Promise<string> {
  if (
    chargeTotalMinor === plan.amountMinor &&
    plan.revolutPlanVariationId
  ) {
    return plan.revolutPlanVariationId;
  }

  const key = cacheKey(plan.tier, plan.currency, chargeTotalMinor);
  const cached = variationCache.get(key);
  if (cached) return cached;

  const name = grossPlanName(plan, chargeTotalMinor);
  const existing = await client.listSubscriptionPlans();
  for (const candidate of existing) {
    if (
      candidate.name === name &&
      candidate.state === 'active' &&
      candidate.variations[0]?.phases[0]?.amount === chargeTotalMinor
    ) {
      const variationId = candidate.variations[0].id;
      variationCache.set(key, variationId);
      return variationId;
    }
  }

  const created = await client.createSubscriptionPlan({
    name,
    variations: [
      {
        phases: [
          {
            ordinal: 1,
            cycle_duration: plan.interval === 'month' ? 'P1M' : 'P1Y',
            amount: chargeTotalMinor,
            currency: plan.currency,
          },
        ],
      },
    ],
  });

  const variationId = created.variations[0]?.id;
  if (!variationId) {
    throw new Error(`Revolut plan created without variation id (${name})`);
  }

  variationCache.set(key, variationId);
  return variationId;
}

/** Test helper — clear in-memory cache between tests. */
export function clearChargeVariationCache(): void {
  variationCache.clear();
}
