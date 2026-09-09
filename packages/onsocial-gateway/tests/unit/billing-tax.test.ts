import { afterEach, describe, expect, it } from 'vitest';
import {
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

describe('billing tax (UK inclusive)', () => {
  afterEach(() => {
    delete process.env.BILLING_VAT_RATE_BPS;
  });

  it('normalizes country and VAT id', () => {
    expect(normalizeCountryCode(' gb ')).toBe('GB');
    expect(normalizeCountryCode('G')).toBeNull();
    expect(normalizeVatId('GB 123 456 789')).toBe('GB123456789');
    expect(normalizeVatId('x')).toBeNull();
  });

  it('splits inclusive totals without rounding drift', () => {
    expect(splitInclusiveTotal(4900, 2000)).toEqual({
      netMinor: 4083,
      taxMinor: 817,
    });
    expect(splitInclusiveTotal(19900, 2000)).toEqual({
      netMinor: 16583,
      taxMinor: 3317,
    });
    const a = splitInclusiveTotal(4900, 2000);
    expect(a.netMinor + a.taxMinor).toBe(4900);
  });

  it('extracts UK VAT from tax-inclusive list price', () => {
    const breakdown = computeTaxBreakdown({
      totalMinor: 4900,
      currency: 'USD',
      identity: { country: 'GB' },
    });
    expect(breakdown.treatment).toBe('uk_vat_inclusive');
    expect(breakdown.taxRateBps).toBe(2000);
    expect(breakdown.totalMinor).toBe(4900);
    expect(breakdown.netMinor + breakdown.taxMinor).toBe(4900);
    expect(breakdown.taxMinor).toBeGreaterThan(0);
  });

  it('applies EU reverse charge only when VAT ID is VIES-verified', () => {
    const verified = computeTaxBreakdown({
      totalMinor: 19900,
      currency: 'USD',
      identity: {
        country: 'DE',
        vatId: 'DE123456789',
        vatVerified: true,
      },
    });
    expect(verified.treatment).toBe('eu_reverse_charge');
    expect(verified.taxMinor).toBe(0);
    expect(verified.netMinor).toBe(19900);

    const unverified = computeTaxBreakdown({
      totalMinor: 19900,
      currency: 'USD',
      identity: { country: 'DE', vatId: 'DE123456789' },
    });
    expect(unverified.treatment).toBe('eu_b2c_unconfigured');
    expect(unverified.taxMinor).toBe(0);
  });

  it('records EU B2C without VAT ID as unconfigured', () => {
    const breakdown = computeTaxBreakdown({
      totalMinor: 4900,
      currency: 'USD',
      identity: { country: 'FR' },
    });
    expect(breakdown.treatment).toBe('eu_b2c_unconfigured');
    expect(breakdown.taxMinor).toBe(0);
  });

  it('marks rest-of-world out of scope', () => {
    const breakdown = computeTaxBreakdown({
      totalMinor: 4900,
      currency: 'USD',
      identity: { country: 'US' },
    });
    expect(breakdown.treatment).toBe('out_of_scope');
    expect(breakdown.taxMinor).toBe(0);
  });
});

describe('invoice idempotency', () => {
  it('issues once per Revolut order id', async () => {
    const input = {
      accountId: 'alice.testnet',
      tier: 'pro' as const,
      revolutOrderId: `order-tax-${Date.now()}`,
      currency: 'USD',
      totalMinor: 4900,
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
    expect(first.taxTreatment).toBe('uk_vat_inclusive');
    expect(first.taxMinor).toBe(817);
    expect(first.invoiceNumber).toMatch(/^INV-\d{4}-\d{6}$/);
  });
});

describe('invoice PDF', () => {
  it('renders a valid PDF containing invoice fields', async () => {
    const invoice = await issueInvoiceForOrder({
      accountId: 'alice.testnet',
      tier: 'scale',
      revolutOrderId: `order-pdf-${Date.now()}`,
      currency: 'USD',
      totalMinor: 19900,
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
    expect(text).toContain('$199.00');
    expect(text).toContain('Tax point');
    expect(invoicePdfFilename(invoice)).toBe(`${invoice.invoiceNumber}.pdf`);
  });
});
