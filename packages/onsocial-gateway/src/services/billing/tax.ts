/**
 * Global seller tax rules for OnAPI subscriptions (tax-exclusive net list prices).
 *
 * Plan amounts in plans.ts are **net** (excl. tax). Checkout adds VAT / sales tax
 * by buyer jurisdiction; Revolut charges net + tax; invoices match the charge.
 *
 * Scope:
 * - GB → UK VAT on net
 * - EU B2C → OSS standard VAT for buyer country (when enabled)
 * - EU B2B + VIES-verified VAT ID → reverse charge (0% on invoice)
 * - Rest of world → out of scope until a jurisdiction is registered (0% today)
 */

export type TaxTreatment =
  | 'uk_vat'
  | 'eu_oss_vat'
  | 'eu_reverse_charge'
  | 'eu_b2c_unconfigured'
  | 'out_of_scope'
  /** @deprecated Legacy invoices — UK VAT extracted from inclusive total */
  | 'uk_vat_inclusive';

export interface BillingIdentity {
  country: string;
  vatId?: string | null;
  companyName?: string | null;
  /**
   * Required for EU reverse charge. When false/undefined with a VAT ID,
   * treatment falls back to EU B2C OSS (never silently reverse-charge).
   */
  vatVerified?: boolean;
}

export interface TaxBreakdown {
  treatment: TaxTreatment;
  currency: string;
  netMinor: number;
  taxMinor: number;
  totalMinor: number;
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

/** EU standard VAT rates (bps) for OSS B2C digital services. */
export const EU_STANDARD_VAT_RATE_BPS: Readonly<Record<string, number>> = {
  AT: 2000,
  BE: 2100,
  BG: 2000,
  HR: 2500,
  CY: 1900,
  CZ: 2100,
  DK: 2500,
  EE: 2200,
  FI: 2550,
  FR: 2000,
  DE: 1900,
  GR: 2400,
  HU: 2700,
  IE: 2300,
  IT: 2200,
  LV: 2100,
  LT: 2100,
  LU: 1700,
  MT: 1800,
  NL: 2100,
  PL: 2300,
  PT: 2300,
  RO: 1900,
  SK: 2000,
  SI: 2200,
  ES: 2100,
  SE: 2500,
};

export function normalizeCountryCode(input: string): string | null {
  const code = input.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return null;
  return code;
}

/** Strip spaces and unify case; keep alphanumerics only for comparison. */
export function normalizeVatId(
  input: string | null | undefined
): string | null {
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

export function isEuOssEnabled(): boolean {
  const raw = process.env.BILLING_EU_OSS_ENABLED?.trim().toLowerCase();
  if (raw === '0' || raw === 'false' || raw === 'off') return false;
  return true;
}

export function getEuStandardVatRateBps(country: string): number | null {
  const rate = EU_STANDARD_VAT_RATE_BPS[country];
  return typeof rate === 'number' ? rate : null;
}

/**
 * Add tax on top of a net amount (tax-exclusive pricing).
 * taxMinor uses standard rounding; totalMinor = netMinor + taxMinor exactly.
 */
export function addTaxToNet(
  netMinor: number,
  taxRateBps: number
): Pick<TaxBreakdown, 'netMinor' | 'taxMinor' | 'totalMinor'> {
  if (netMinor < 0) {
    throw new Error('netMinor must be >= 0');
  }
  if (taxRateBps <= 0) {
    return { netMinor, taxMinor: 0, totalMinor: netMinor };
  }
  const taxMinor = Math.round((netMinor * taxRateBps) / 10_000);
  return { netMinor, taxMinor, totalMinor: netMinor + taxMinor };
}

/**
 * Split a tax-inclusive total into net + tax at the given rate (bps).
 * Legacy helper — new checkout uses addTaxToNet on net plan prices.
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
  netMinor: number;
  currency: string;
  identity: BillingIdentity;
}): TaxBreakdown {
  const country = normalizeCountryCode(input.identity.country);
  if (!country) {
    throw new Error('Invalid billing country');
  }

  const vatId = normalizeVatId(input.identity.vatId);
  const currency = input.currency.toUpperCase();
  const netMinor = input.netMinor;

  if (country === 'GB') {
    const taxRateBps = getUkVatRateBps();
    const amounts = addTaxToNet(netMinor, taxRateBps);
    return {
      treatment: 'uk_vat',
      currency,
      ...amounts,
      taxRateBps,
      note: `UK VAT at ${(taxRateBps / 100).toFixed(1).replace(/\.0$/, '')}% on net plan price.`,
    };
  }

  if (EU_COUNTRY_CODES.has(country)) {
    if (vatId && input.identity.vatVerified) {
      return {
        treatment: 'eu_reverse_charge',
        currency,
        netMinor,
        taxMinor: 0,
        totalMinor: netMinor,
        taxRateBps: 0,
        note: `EU B2B reverse charge. Customer VAT ${vatId} verified via VIES; VAT accounted for by the customer.`,
      };
    }

    const euRateBps = getEuStandardVatRateBps(country);
    if (isEuOssEnabled() && euRateBps != null) {
      const amounts = addTaxToNet(netMinor, euRateBps);
      return {
        treatment: 'eu_oss_vat',
        currency,
        ...amounts,
        taxRateBps: euRateBps,
        note: `EU VAT (${country}) at ${(euRateBps / 100).toFixed(1).replace(/\.0$/, '')}% via OSS on net plan price.`,
      };
    }

    return {
      treatment: 'eu_b2c_unconfigured',
      currency,
      netMinor,
      taxMinor: 0,
      totalMinor: netMinor,
      taxRateBps: 0,
      note: vatId
        ? 'EU VAT ID present but not VIES-verified — reverse charge not applied; OSS VAT not configured.'
        : 'EU buyer without VAT ID — OSS VAT not configured; net price only until OSS is enabled.',
    };
  }

  return {
    treatment: 'out_of_scope',
    currency,
    netMinor,
    taxMinor: 0,
    totalMinor: netMinor,
    taxRateBps: 0,
    note: 'No VAT / sales tax collected for this jurisdiction under current registrations.',
  };
}
