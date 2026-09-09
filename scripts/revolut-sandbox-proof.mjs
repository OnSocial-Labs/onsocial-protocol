#!/usr/bin/env node
/**
 * Revolut sandbox live-proof helper.
 *
 * Validates sandbox billing env, optionally registers a public webhook URL,
 * and prints the manual checkout checklist.
 *
 * Usage:
 *   node scripts/revolut-sandbox-proof.mjs
 *   WEBHOOK_URL=https://xxxx.trycloudflare.com/webhooks/revolut \
 *     node scripts/revolut-sandbox-proof.mjs --register-webhook
 *
 * Requires sandbox secrets in the environment (or packages/onsocial-gateway/.env.sandbox).
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SANDBOX_ENV = resolve(ROOT, 'packages/onsocial-gateway/.env.sandbox');
const API_VERSION = process.env.REVOLUT_API_VERSION_SANDBOX || '2025-12-04';
const API_URL = (
  process.env.REVOLUT_API_URL_SANDBOX ||
  'https://sandbox-merchant.revolut.com/api'
).replace(/\/$/, '');

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(SANDBOX_ENV);

function required(name) {
  const value = process.env[name]?.trim() || '';
  if (!value || value === 'CHANGE_ME') {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

async function revolut(path, { method = 'GET', body } = {}) {
  const secret = required('REVOLUT_SECRET_KEY_SANDBOX');
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secret}`,
      'Revolut-Api-Version': API_VERSION,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(
      `${method} ${path} → ${res.status}: ${JSON.stringify(json)}`
    );
  }
  return json;
}

function printChecklist(webhookUrl) {
  console.log(`
════════════════════════════════════════════════════════════
 Sandbox live proof checklist
════════════════════════════════════════════════════════════

1. Gateway running with REVOLUT_ENVIRONMENT=sandbox
2. Public webhook → ${webhookUrl || '<set WEBHOOK_URL>'}
3. Portal: pnpm --filter @onsocial/portal run dev:local-sandbox
4. Open http://localhost:3000/onapi/keys
5. Connect wallet, enter billing email, upgrade to Pro
6. Pay with a Revolut sandbox test card
   Docs: https://developer.revolut.com/docs/guides/merchant/test-and-go-live/set-up-sandbox
7. After pay, return to /onapi/keys (localhost has no Revolut redirect)
8. Toast should morph Confirming → Payment confirmed
9. GET /developer/subscription must show status=active + paid tier
10. Do NOT use "Mark sandbox payment complete" for this proof

Pass criteria:
  ✓ ORDER_COMPLETED hits gateway (signed)
  ✓ subscription status active
  ✓ rate limit / tier elevated without using dev-complete
════════════════════════════════════════════════════════════
`);
}

async function main() {
  const register = process.argv.includes('--register-webhook');
  const webhookUrl =
    process.env.WEBHOOK_URL?.trim() ||
    (register ? '' : 'https://<public-host>/webhooks/revolut');

  console.log('Revolut sandbox proof');
  console.log(`API: ${API_URL} (version ${API_VERSION})`);

  const secret = required('REVOLUT_SECRET_KEY_SANDBOX');
  required('REVOLUT_PUBLIC_KEY_SANDBOX');
  required('REVOLUT_WEBHOOK_SIGNING_SECRET_SANDBOX');
  required('REVOLUT_PRO_VARIATION_ID_SANDBOX');
  required('REVOLUT_SCALE_VARIATION_ID_SANDBOX');

  console.log(`Secret: ${secret.slice(0, 6)}… (${secret.length} chars)`);
  console.log(
    `Pro variation: ${process.env.REVOLUT_PRO_VARIATION_ID_SANDBOX}`
  );
  console.log(
    `Scale variation: ${process.env.REVOLUT_SCALE_VARIATION_ID_SANDBOX}`
  );

  // Auth smoke test — list plans if available, else customers
  try {
    const plans = await revolut('/subscription-plans');
    const count = Array.isArray(plans)
      ? plans.length
      : (plans?.subscription_plans?.length ?? plans?.items?.length ?? '?');
    console.log(`✓ Sandbox API reachable (subscription-plans: ${count})`);
  } catch (err) {
    // Some API versions nest differently — still try a lightweight call
    console.warn(`subscription-plans probe: ${err.message}`);
    await revolut('/orders?limit=1');
    console.log('✓ Sandbox API reachable (orders list)');
  }

  const webhooks = await revolut('/webhooks');
  const list = Array.isArray(webhooks)
    ? webhooks
    : (webhooks?.webhooks ?? webhooks?.items ?? []);
  console.log(`Existing webhooks: ${list.length}`);
  for (const hook of list) {
    console.log(
      `  - ${hook.id || '?'}  ${hook.url || hook.webhook_url || ''}  events=${JSON.stringify(hook.events || [])}`
    );
  }

  if (register) {
    if (!webhookUrl || webhookUrl.includes('<')) {
      throw new Error(
        'Set WEBHOOK_URL=https://your-public-host/webhooks/revolut to register'
      );
    }
    const existing = list.find(
      (h) => (h.url || h.webhook_url) === webhookUrl
    );
    if (existing) {
      console.log(`✓ Webhook already registered: ${existing.id}`);
    } else {
      const created = await revolut('/webhooks', {
        method: 'POST',
        body: {
          url: webhookUrl,
          events: [
            'ORDER_COMPLETED',
            'ORDER_PAYMENT_DECLINED',
            'ORDER_PAYMENT_FAILED',
          ],
        },
      });
      console.log('✓ Registered webhook:', created.id || created);
      if (created.signing_secret) {
        console.log(
          '\nIMPORTANT: Revolut returned a new signing secret for this webhook.'
        );
        console.log(
          'Set REVOLUT_WEBHOOK_SIGNING_SECRET_SANDBOX to that value and restart the gateway,'
        );
        console.log(
          'or delete this webhook and reuse an existing URL whose secret you already have.'
        );
        console.log(
          `Signing secret (store securely): ${created.signing_secret}`
        );
      }
    }
  }

  printChecklist(webhookUrl.includes('<') ? null : webhookUrl);
}

main().catch((err) => {
  console.error(`\nFAIL: ${err.message}`);
  process.exit(1);
});
