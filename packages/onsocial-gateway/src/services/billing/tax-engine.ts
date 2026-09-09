/**
 * External tax engines for ZIP-level US (and future CA) rates.
 *
 * Stripe Tax is used when BILLING_TAX_ENGINE=stripe and a secret key is set.
 * Configure state registrations in the Stripe Tax dashboard to match allowlist.
 *
 * Env:
 *   BILLING_TAX_ENGINE=stripe|none
 *   BILLING_STRIPE_SECRET_KEY (or STRIPE_SECRET_KEY)
 *   BILLING_STRIPE_TAX_CODE (default electronically supplied services)
 *   BILLING_TAX_ENGINE_FALLBACK=1  → on Stripe failure use built-in state table
 */

import { logger } from '../../logger.js';

export interface TaxEngineQuoteInput {
  netMinor: number;
  currency: string;
  country: string;
  region: string;
  postalCode: string;
  line1?: string | null;
  city?: string | null;
  reference?: string;
}

export interface TaxEngineQuote {
  taxMinor: number;
  taxRateBps: number;
  engine: 'stripe';
  calculationId: string | null;
  note: string;
}

export function resolveTaxEngineMode(): 'stripe' | 'none' {
  const raw = process.env.BILLING_TAX_ENGINE?.trim().toLowerCase();
  if (raw === 'stripe') return 'stripe';
  return 'none';
}

export function resolveStripeSecretKey(): string | null {
  return (
    process.env.BILLING_STRIPE_SECRET_KEY?.trim() ||
    process.env.STRIPE_SECRET_KEY?.trim() ||
    null
  );
}

export function resolveStripeTaxCode(): string {
  return (
    process.env.BILLING_STRIPE_TAX_CODE?.trim() || 'txcd_10000000' // General - Electronically Supplied Services
  );
}

/** When true, Stripe failures fall back to the built-in US state table. */
export function isTaxEngineFallbackEnabled(): boolean {
  const raw = process.env.BILLING_TAX_ENGINE_FALLBACK?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on';
}

function formEncode(params: Record<string, string>): string {
  return Object.entries(params)
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
    )
    .join('&');
}

interface StripeTaxCalculation {
  id?: string;
  tax_amount_exclusive?: number;
  tax_breakdown?: Array<{
    amount?: number;
    tax_rate_details?: {
      percentage_decimal?: string;
      state?: string;
    };
  }>;
  error?: { message?: string };
}

/**
 * Quote sales tax via Stripe Tax Calculations API (no Stripe SDK dependency).
 * @see https://docs.stripe.com/api/tax/calculations/create
 */
export async function quoteStripeTax(
  input: TaxEngineQuoteInput
): Promise<TaxEngineQuote> {
  const secret = resolveStripeSecretKey();
  if (!secret) {
    throw new Error('Stripe Tax is enabled but no secret key is configured');
  }

  const taxCode = resolveStripeTaxCode();
  const body = formEncode({
    currency: input.currency.toLowerCase(),
    'customer_details[address][country]': input.country,
    'customer_details[address][state]': input.region,
    'customer_details[address][postal_code]': input.postalCode,
    ...(input.line1?.trim()
      ? { 'customer_details[address][line1]': input.line1.trim() }
      : {}),
    ...(input.city?.trim()
      ? { 'customer_details[address][city]': input.city.trim() }
      : {}),
    'customer_details[address_source]': 'billing',
    'line_items[0][amount]': String(input.netMinor),
    'line_items[0][tax_code]': taxCode,
    'line_items[0][reference]': input.reference || 'onsocial-api-subscription',
    'line_items[0][tax_behavior]': 'exclusive',
  });

  const res = await fetch('https://api.stripe.com/v1/tax/calculations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const json = (await res.json()) as StripeTaxCalculation;

  if (!res.ok) {
    const msg = json.error?.message || `Stripe Tax HTTP ${res.status}`;
    throw new Error(msg);
  }

  const taxMinor = Math.max(0, Math.round(json.tax_amount_exclusive ?? 0));
  const firstRate = json.tax_breakdown?.[0]?.tax_rate_details;
  let taxRateBps = 0;
  if (firstRate?.percentage_decimal) {
    const pct = Number(firstRate.percentage_decimal);
    if (Number.isFinite(pct)) {
      taxRateBps = Math.round(pct * 100);
    }
  } else if (input.netMinor > 0 && taxMinor > 0) {
    taxRateBps = Math.round((taxMinor * 10_000) / input.netMinor);
  }

  const state = firstRate?.state || input.region;
  return {
    taxMinor,
    taxRateBps,
    engine: 'stripe',
    calculationId: json.id ?? null,
    note:
      taxMinor > 0
        ? `US sales tax (${state}) via Stripe Tax on net plan price.`
        : `No US sales tax due for ${state} (Stripe Tax).`,
  };
}

/**
 * Returns a quote when an external engine is configured; null when engine=none.
 * Throws on engine errors unless caller catches for fallback.
 */
export async function quoteExternalTax(
  input: TaxEngineQuoteInput
): Promise<TaxEngineQuote | null> {
  const mode = resolveTaxEngineMode();
  if (mode === 'none') return null;
  if (mode === 'stripe') {
    return quoteStripeTax(input);
  }
  return null;
}

export async function quoteUsWithOptionalFallback(
  input: TaxEngineQuoteInput
): Promise<TaxEngineQuote | null> {
  try {
    return await quoteExternalTax(input);
  } catch (err) {
    logger.warn({ err, region: input.region }, 'Tax engine quote failed');
    if (isTaxEngineFallbackEnabled()) {
      return null;
    }
    throw err instanceof Error ? err : new Error('Tax engine quote failed');
  }
}
