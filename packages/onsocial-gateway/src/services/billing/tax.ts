/**
 * UK seller tax rules for OnAPI subscriptions (tax-inclusive list prices).
 *
 * Revolut still charges the plan amount (e.g. $49 / $199). This module only
 * decides how that total is broken out on *our* invoices.
 *
 * Day-one scope:
 * - GB → extract UK VAT at BILLING_VAT_RATE_BPS (default 20%)
 * - EU + VAT ID → reverse charge (0% VAT)
 * - EU without VAT ID → recorded untaxed until OSS is configured
 * - Rest of world → out of scope (0%)
 */

export type TaxTreatment =
  | 'uk_vat_inclusive'
  | 'eu_reverse_charge'
  | 'eu_b2c_unconfigured'
  | 'out_of_scope';

export interface BillingIdentity {
  country: string;
  vatId?: string | null;
  companyName?: string | null;
  /**
   * Required for EU reverse charge. When false/undefined with a VAT ID,
   * treatment falls back to eu_b2c_unconfigured (never silently reverse-charge).
   */
  vatVerified?: boolean;
}

export interface TaxBreakdown {
  treatment: TaxTreatment;
  currency: string;
  totalMinor: number;
  netMinor: number;
  taxMinor: number;
  /** Basis points — 2000 = 20%. */
  taxRateBps: number;
  note: string;
}

/** ISO 3166-1 alpha-2 EU member states (post-Brexit, no GB). */
export const EU_COUNTRY_CODES = new Set([
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
]);

export function normalizeCountryCode(input: string): string | null {
  const code = input.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return null;
  return code;
}

/** Strip spaces and unify case; keep alphanumerics only for comparison. */
export function normalizeVatId(input: string | null | undefined): string | null {
  if (!input) return null;
  const cleaned = input.replace(/[\s.-]/g, '').toUpperCase();
  if (cleaned.length < 4 || cleaned.length > 20) return null;
  if (!/^[A-Z0-9]+$/.test(cleaned)) return null;
  return cleaned;
}

export function getUkVatRateBps(): number {
  const raw = process.env.BILLING_VAT_RATE_BPS?.trim();
  if (!raw) return 2000;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 10000) return 2000;
  return Math.round(n);
}

/**
 * Split a tax-inclusive total into net + tax at the given rate (bps).
 * Uses remainder-on-tax so net + tax === total exactly.
 */
export function splitInclusiveTotal(
  totalMinor: number,
  taxRateBps: number
): { netMinor: number; taxMinor: number } {
  if (totalMinor < 0) {
    throw new Error('totalMinor must be >= 0');
  }
  if (taxRateBps <= 0) {
    return { netMinor: totalMinor, taxMinor: 0 };
  }
  const netMinor = Math.round(totalMinor / (1 + taxRateBps / 10_000));
  return { netMinor, taxMinor: totalMinor - netMinor };
}

export function computeTaxBreakdown(input: {
  totalMinor: number;
  currency: string;
  identity: BillingIdentity;
}): TaxBreakdown {
  const country = normalizeCountryCode(input.identity.country);
  if (!country) {
    throw new Error('Invalid billing country');
  }

  const vatId = normalizeVatId(input.identity.vatId);
  const currency = input.currency.toUpperCase();
  const totalMinor = input.totalMinor;

  if (country === 'GB') {
    const taxRateBps = getUkVatRateBps();
    const { netMinor, taxMinor } = splitInclusiveTotal(totalMinor, taxRateBps);
    return {
      treatment: 'uk_vat_inclusive',
      currency,
      totalMinor,
      netMinor,
      taxMinor,
      taxRateBps,
      note: `Includes UK VAT at ${(taxRateBps / 100).toFixed(0)}% (tax-inclusive price).`,
    };
  }

  if (EU_COUNTRY_CODES.has(country)) {
    if (vatId && input.identity.vatVerified) {
      return {
        treatment: 'eu_reverse_charge',
        currency,
        totalMinor,
        netMinor: totalMinor,
        taxMinor: 0,
        taxRateBps: 0,
        note: `EU B2B reverse charge. Customer VAT ${vatId} verified via VIES; VAT accounted for by the customer.`,
      };
    }
    if (vatId && !input.identity.vatVerified) {
      return {
        treatment: 'eu_b2c_unconfigured',
        currency,
        totalMinor,
        netMinor: totalMinor,
        taxMinor: 0,
        taxRateBps: 0,
        note: 'EU VAT ID present but not VIES-verified — reverse charge not applied.',
      };
    }
    return {
      treatment: 'eu_b2c_unconfigured',
      currency,
      totalMinor,
      netMinor: totalMinor,
      taxMinor: 0,
      taxRateBps: 0,
      note: 'EU buyer without VAT ID — OSS VAT not configured yet; recorded with 0% tax.',
    };
  }

  return {
    treatment: 'out_of_scope',
    currency,
    totalMinor,
    netMinor: totalMinor,
    taxMinor: 0,
    taxRateBps: 0,
    note: 'Supply outside UK/EU VAT scope for day-one rules.',
  };
}
