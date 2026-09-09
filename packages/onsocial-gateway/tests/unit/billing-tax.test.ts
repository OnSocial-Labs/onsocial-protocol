import { afterEach, describe, expect, it } from 'vitest';
import {
  addTaxToNet,
  computeTaxBreakdown,
  normalizeCountryCode,
  normalizeVatId,
  splitInclusiveTotal,
} from '../../src/services/billing/tax.js';
import { issueInvoiceForOrder } from '../../src/services/billing/invoices.js';
import {
  invoicePdfFilename,
  renderInvoicePdf,
} from '../../src/services/billing/invoice-pdf.js';

describe('billing tax (net plan + tax at checkout)', () => {
  afterEach(() => {
    delete process.env.BILLING_VAT_RATE_BPS;
    delete process.env.BILLING_EU_OSS_ENABLED;
    delete process.env.BILLING_TAX_COLLECT_COUNTRIES;
  });

  it('normalizes country and VAT id', async () => {
    expect(normalizeCountryCode(' gb ')).toBe('GB');
    expect(normalizeCountryCode('G')).toBeNull();
    expect(normalizeVatId('GB 123 456 789')).toBe('GB123456789');
    expect(normalizeVatId('x')).toBeNull();
  });

  it('adds tax on net without rounding drift', async () => {
    expect(addTaxToNet(4900, 2000)).toEqual({
      netMinor: 4900,
      taxMinor: 980,
      totalMinor: 5880,
    });
    expect(addTaxToNet(4900, 2100)).toEqual({
      netMinor: 4900,
      taxMinor: 1029,
      totalMinor: 5929,
    });
  });

  it('splits inclusive totals (legacy helper)', async () => {
    expect(splitInclusiveTotal(4900, 2000)).toEqual({
      netMinor: 4083,
      taxMinor: 817,
    });
  });

  it('applies UK VAT on net plan price', async () => {
    const breakdown = await computeTaxBreakdown({
      netMinor: 4900,
      currency: 'USD',
      identity: { country: 'GB' },
    });
    expect(breakdown.treatment).toBe('uk_vat');
    expect(breakdown.taxRateBps).toBe(2000);
    expect(breakdown.netMinor).toBe(4900);
    expect(breakdown.taxMinor).toBe(980);
    expect(breakdown.totalMinor).toBe(5880);
  });

  it('applies EU OSS VAT for B2C consumers', async () => {
    const breakdown = await computeTaxBreakdown({
      netMinor: 4900,
      currency: 'USD',
      identity: { country: 'BE' },
    });
    expect(breakdown.treatment).toBe('eu_oss_vat');
    expect(breakdown.taxRateBps).toBe(2100);
    expect(breakdown.taxMinor).toBe(1029);
    expect(breakdown.totalMinor).toBe(5929);
  });

  it('applies EU reverse charge only when VAT ID is VIES-verified', async () => {
    const verified = await computeTaxBreakdown({
      netMinor: 19900,
      currency: 'USD',
      identity: {
        country: 'DE',
        vatId: 'DE123456789',
        vatVerified: true,
      },
    });
    expect(verified.treatment).toBe('eu_reverse_charge');
    expect(verified.taxMinor).toBe(0);
    expect(verified.totalMinor).toBe(19900);

    const unverified = await computeTaxBreakdown({
      netMinor: 19900,
      currency: 'USD',
      identity: { country: 'DE', vatId: 'DE123456789' },
    });
    expect(unverified.treatment).toBe('eu_oss_vat');
    expect(unverified.taxMinor).toBeGreaterThan(0);
  });

  it('records EU B2C as unconfigured when OSS is disabled', async () => {
    process.env.BILLING_EU_OSS_ENABLED = '0';
    const breakdown = await computeTaxBreakdown({
      netMinor: 4900,
      currency: 'USD',
      identity: { country: 'FR' },
    });
    expect(breakdown.treatment).toBe('eu_b2c_unconfigured');
    expect(breakdown.taxMinor).toBe(0);
    expect(breakdown.totalMinor).toBe(4900);
  });

  it('marks rest-of-world out of scope with net-only total', async () => {
    const breakdown = await computeTaxBreakdown({
      netMinor: 4900,
      currency: 'USD',
      identity: { country: 'HK' },
    });
    expect(breakdown.treatment).toBe('out_of_scope');
    expect(breakdown.taxMinor).toBe(0);
    expect(breakdown.totalMinor).toBe(4900);
  });

  it('applies US sales tax for taxable SaaS states when ZIP is present', async () => {
    const breakdown = await computeTaxBreakdown({
      netMinor: 4900,
      currency: 'USD',
      identity: {
        country: 'US',
        region: 'TX',
        postalCode: '78701',
        line1: '100 Congress Ave',
        city: 'Austin',
      },
    });
    expect(breakdown.treatment).toBe('us_sales_tax');
    expect(breakdown.taxRateBps).toBe(625);
    expect(breakdown.taxMinor).toBe(306);
    expect(breakdown.totalMinor).toBe(5206);
  });

  it('requires US state and ZIP', async () => {
    await expect(
      computeTaxBreakdown({
        netMinor: 4900,
        currency: 'USD',
        identity: { country: 'US' },
      })
    ).rejects.toThrow(/state/i);
  });

  it('requires US street and city', async () => {
    await expect(
      computeTaxBreakdown({
        netMinor: 4900,
        currency: 'USD',
        identity: {
          country: 'US',
          region: 'TX',
          postalCode: '78701',
        },
      })
    ).rejects.toThrow(/street/i);
  });

  it('applies Canada GST/HST by province', async () => {
    const breakdown = await computeTaxBreakdown({
      netMinor: 4900,
      currency: 'USD',
      identity: { country: 'CA', region: 'ON' },
    });
    expect(breakdown.treatment).toBe('ca_gst');
    expect(breakdown.taxRateBps).toBe(1300);
    expect(breakdown.totalMinor).toBe(4900 + 637);
  });

  it('applies national VAT/GST for Australia', async () => {
    const breakdown = await computeTaxBreakdown({
      netMinor: 4900,
      currency: 'USD',
      identity: { country: 'AU' },
    });
    expect(breakdown.treatment).toBe('destination_vat');
    expect(breakdown.taxRateBps).toBe(1000);
    expect(breakdown.taxMinor).toBe(490);
    expect(breakdown.totalMinor).toBe(5390);
  });

  it('respects BILLING_TAX_COLLECT_COUNTRIES allowlist', async () => {
    process.env.BILLING_TAX_COLLECT_COUNTRIES = 'GB,EU';

    const be = await computeTaxBreakdown({
      netMinor: 4900,
      currency: 'USD',
      identity: { country: 'BE' },
    });
    expect(be.treatment).toBe('eu_oss_vat');
    expect(be.taxMinor).toBeGreaterThan(0);

    const us = await computeTaxBreakdown({
      netMinor: 4900,
      currency: 'USD',
      identity: {
        country: 'US',
        region: 'TX',
        postalCode: '78701',
        line1: '100 Congress Ave',
        city: 'Austin',
      },
    });
    expect(us.treatment).toBe('out_of_scope');
    expect(us.taxMinor).toBe(0);
    expect(us.totalMinor).toBe(4900);

    const au = await computeTaxBreakdown({
      netMinor: 4900,
      currency: 'USD',
      identity: { country: 'AU' },
    });
    expect(au.treatment).toBe('out_of_scope');
    expect(au.taxMinor).toBe(0);
  });
});

describe('invoice idempotency', () => {
  it('issues once per Revolut order id', async () => {
    const input = {
      accountId: 'alice.testnet',
      tier: 'pro' as const,
      revolutOrderId: `order-tax-${Date.now()}`,
      currency: 'USD',
      netMinor: 4900,
      billingEmail: 'alice@example.com',
      billingCountry: 'GB',
      billingCompanyName: 'Alice Ltd',
      billingVatId: null,
      periodStart: new Date().toISOString(),
      periodEnd: new Date(Date.now() + 86400000).toISOString(),
    };

    const first = await issueInvoiceForOrder(input);
    const second = await issueInvoiceForOrder(input);
    expect(second.id).toBe(first.id);
    expect(first.taxTreatment).toBe('uk_vat');
    expect(first.taxMinor).toBe(980);
    expect(first.totalMinor).toBe(5880);
    expect(first.invoiceNumber).toMatch(/^INV-\d{4}-\d{6}$/);
  });
});

describe('invoice PDF', () => {
  it('renders a valid PDF containing invoice fields', async () => {
    process.env.BILLING_SELLER_OSS_VAT_NUMBER = 'IE1234567AB';
    const invoice = await issueInvoiceForOrder({
      accountId: 'alice.testnet',
      tier: 'scale',
      revolutOrderId: `order-pdf-${Date.now()}`,
      currency: 'USD',
      netMinor: 19900,
      billingEmail: 'alice@example.com',
      billingCountry: 'GB',
      billingCompanyName: 'Alice Ltd',
      billingVatId: 'GB123456789',
      periodStart: new Date().toISOString(),
      periodEnd: new Date(Date.now() + 86400000).toISOString(),
    });

    const pdf = renderInvoicePdf(invoice);
    const text = pdf.toString('latin1');
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('%%EOF');
    expect(text).toContain(invoice.invoiceNumber);
    expect(text).toContain('alice.testnet');
    expect(text).toContain('$238.80');
    expect(text).toContain('Tax point');
    expect(text).toContain('IE1234567AB');
    expect(invoice.sellerOssVatNumber).toBe('IE1234567AB');
    expect(invoicePdfFilename(invoice)).toBe(`${invoice.invoiceNumber}.pdf`);
    delete process.env.BILLING_SELLER_OSS_VAT_NUMBER;
  });
});
