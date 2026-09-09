/**
 * Destination tax tables for jurisdictions outside UK VAT / EU OSS.
 *
 * US rates are **state-level SaaS** estimates (no local add-ons). Connect a
 * tax engine (TaxJar / Avalara) later to use ZIP-level combined rates.
 * ZIP is still collected so invoices and a future engine have the address.
 */

export interface JurisdictionRate {
  /** Basis points — 625 = 6.25%. */
  taxRateBps: number;
  treatment: 'us_sales_tax' | 'ca_gst' | 'destination_vat';
  note: string;
}

/** US states that generally do not levy state sales tax. */
const US_NO_SALES_TAX = new Set(['AK', 'DE', 'MT', 'NH', 'OR']);

/**
 * States where remotely provided SaaS is commonly treated as taxable.
 * Others stay 0% until a tax engine provides taxability + local rate.
 */
const US_SAAS_TAXABLE: Readonly<Record<string, number>> = {
  AZ: 560,
  CT: 635,
  DC: 600,
  HI: 400,
  IA: 600,
  IL: 625,
  IN: 700,
  KY: 600,
  MA: 625,
  MD: 600,
  MI: 600,
  MN: 688,
  MS: 700,
  NJ: 663,
  NM: 488,
  NY: 400,
  OH: 575,
  PA: 600,
  RI: 700,
  SC: 600,
  SD: 420,
  TN: 700,
  TX: 625,
  UT: 485,
  VT: 600,
  WA: 650,
  WI: 500,
  WV: 600,
};

/** Canada GST/HST (and combined GST+PST where a single rate is used at checkout). */
const CA_GST_HST_BPS: Readonly<Record<string, number>> = {
  AB: 500,
  BC: 1200,
  MB: 1200,
  NB: 1500,
  NL: 1500,
  NS: 1400,
  NT: 500,
  NU: 500,
  ON: 1300,
  PE: 1500,
  QC: 1498,
  SK: 1100,
  YT: 500,
};

/** National VAT/GST for B2C digital services (standard rate). */
const NATIONAL_VAT_BPS: Readonly<Record<string, number>> = {
  AU: 1000,
  NZ: 1500,
  NO: 2500,
  IS: 2400,
  CH: 810,
  LI: 810,
  SG: 900,
  JP: 1000,
  KR: 1000,
  IN: 1800,
  ZA: 1500,
  AE: 500,
  IL: 1800,
  MX: 1600,
  TR: 2000,
};

function rateLabel(bps: number): string {
  return `${(bps / 100).toFixed(2).replace(/\.?0+$/, '')}%`;
}

export function lookupUsSalesTax(region: string): JurisdictionRate | null {
  if (US_NO_SALES_TAX.has(region)) {
    return {
      taxRateBps: 0,
      treatment: 'us_sales_tax',
      note: `No state sales tax in ${region}.`,
    };
  }
  const taxRateBps = US_SAAS_TAXABLE[region];
  if (taxRateBps == null) {
    return {
      taxRateBps: 0,
      treatment: 'us_sales_tax',
      note: `SaaS not taxed at state level for ${region} in the built-in table (ZIP stored for a tax engine).`,
    };
  }
  return {
    taxRateBps,
    treatment: 'us_sales_tax',
    note: `US sales tax (${region}) at ${rateLabel(taxRateBps)} state rate on net plan price.`,
  };
}

export function lookupCaGst(region: string): JurisdictionRate | null {
  const taxRateBps = CA_GST_HST_BPS[region];
  if (taxRateBps == null) return null;
  return {
    taxRateBps,
    treatment: 'ca_gst',
    note: `Canada GST/HST (${region}) at ${rateLabel(taxRateBps)} on net plan price.`,
  };
}

export function lookupNationalVat(country: string): JurisdictionRate | null {
  const taxRateBps = NATIONAL_VAT_BPS[country];
  if (taxRateBps == null) return null;
  return {
    taxRateBps,
    treatment: 'destination_vat',
    note: `${country} VAT/GST at ${rateLabel(taxRateBps)} on net plan price.`,
  };
}

export function countryRequiresRegion(country: string): boolean {
  return country === 'US' || country === 'CA';
}

export function countryRequiresPostal(country: string): boolean {
  return country === 'US';
}
