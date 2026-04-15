#!/usr/bin/env npx tsx
/**
 * One-time setup: create subscription plans in Revolut Merchant API.
 *
 * Creates Pro (monthly) and Scale (monthly) plans, then prints the
 * plan_variation_ids you need to set as env vars:
 *
 *   REVOLUT_PRO_VARIATION_ID=<uuid>
 *   REVOLUT_SCALE_VARIATION_ID=<uuid>
 *
 * Usage:
 *   REVOLUT_SECRET_KEY=sk_... npx tsx src/scripts/setup-revolut-plans.ts
 *
 * Idempotent: if plans with identical names already exist, their IDs are printed
 * without creating duplicates.
 */

import {
  RevolutClient,
  type RevolutConfig,
  type RevolutPlan,
} from '../services/revolut/client.js';
import {
  resolveRevolutConfig,
  resolveRevolutVariationEnvName,
} from '../services/revolut/env.js';
import { SUBSCRIPTION_PLANS } from '../services/revolut/plans.js';

const revolut = resolveRevolutConfig();
if (!revolut.secretKey) {
  console.error('Error: REVOLUT_SECRET_KEY env var is required');
  process.exit(1);
}

const cfg: RevolutConfig = {
  secretKey: revolut.secretKey,
  publicKey: revolut.publicKey,
  webhookSigningSecret: revolut.webhookSigningSecret,
  apiUrl: revolut.apiUrl,
  apiVersion: revolut.apiVersion,
};

const client = new RevolutClient(cfg);

async function main() {
  console.log(
    `Using Revolut ${revolut.environment} environment (${cfg.apiUrl})`
  );

  // Check for existing plans
  const existing = await client.listSubscriptionPlans();
  const existingByName = new Map<string, RevolutPlan>();
  for (const plan of existing) {
    existingByName.set(plan.name, plan);
  }

  const results: Array<{ tier: string; planId: string; variationId: string }> =
    [];

  for (const plan of SUBSCRIPTION_PLANS) {
    const planName = `OnSocial API ${plan.name}`;
    const found = existingByName.get(planName);

    if (found && found.state === 'active') {
      console.log(`✓ Plan "${planName}" already exists (${found.id})`);
      results.push({
        tier: plan.tier,
        planId: found.id,
        variationId: found.variations[0].id,
      });
      continue;
    }

    console.log(`Creating plan "${planName}"...`);
    const created = await client.createSubscriptionPlan({
      name: planName,
      variations: [
        {
          phases: [
            {
              ordinal: 1,
              cycle_duration: plan.interval === 'month' ? 'P1M' : 'P1Y',
              amount: plan.amountMinor,
              currency: plan.currency,
            },
          ],
        },
      ],
    });

    console.log(`✓ Created "${planName}" → plan ${created.id}`);
    results.push({
      tier: plan.tier,
      planId: created.id,
      variationId: created.variations[0].id,
    });
  }

  // Print env var output
  console.log('\n─── Copy these to your .env or GSM secrets ───\n');
  console.log(`REVOLUT_ENVIRONMENT=${revolut.environment}`);
  for (const r of results) {
    const envName = resolveRevolutVariationEnvName(r.tier, revolut.environment);
    console.log(`${envName}=${r.variationId}`);
  }
  console.log('');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
