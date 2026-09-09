import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  quoteStripeTax,
  resolveTaxEngineMode,
} from '../../src/services/billing/tax-engine.js';
import { computeTaxBreakdown } from '../../src/services/billing/tax.js';

describe('Stripe Tax engine', () => {
  afterEach(() => {
    delete process.env.BILLING_TAX_ENGINE;
    delete process.env.BILLING_STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.BILLING_TAX_ENGINE_FALLBACK;
    delete process.env.BILLING_TAX_COLLECT_COUNTRIES;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('resolves engine mode', () => {
    expect(resolveTaxEngineMode()).toBe('none');
    process.env.BILLING_TAX_ENGINE = 'stripe';
    expect(resolveTaxEngineMode()).toBe('stripe');
  });

  it('quotes US tax from Stripe Tax Calculations API', async () => {
    process.env.BILLING_STRIPE_SECRET_KEY = 'sk_test_x';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          id: 'taxcalc_123',
          tax_amount_exclusive: 402,
          tax_breakdown: [
            {
              amount: 402,
              tax_rate_details: {
                percentage_decimal: '8.2',
                state: 'TX',
              },
            },
          ],
        }),
      }))
    );

    const quote = await quoteStripeTax({
      netMinor: 4900,
      currency: 'USD',
      country: 'US',
      region: 'TX',
      postalCode: '78701',
    });
    expect(quote.taxMinor).toBe(402);
    expect(quote.taxRateBps).toBe(820);
    expect(quote.calculationId).toBe('taxcalc_123');
    expect(quote.engine).toBe('stripe');
  });

  it('uses Stripe quote inside computeTaxBreakdown for US', async () => {
    process.env.BILLING_TAX_ENGINE = 'stripe';
    process.env.BILLING_STRIPE_SECRET_KEY = 'sk_test_x';
    process.env.BILLING_TAX_COLLECT_COUNTRIES = 'GB,EU,US';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          id: 'taxcalc_tx',
          tax_amount_exclusive: 306,
          tax_breakdown: [
            {
              tax_rate_details: {
                percentage_decimal: '6.25',
                state: 'TX',
              },
            },
          ],
        }),
      }))
    );

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
    expect(breakdown.taxMinor).toBe(306);
    expect(breakdown.totalMinor).toBe(5206);
    expect(breakdown.note).toMatch(/Stripe Tax/i);
  });

  it('falls back to state table when Stripe fails and fallback is on', async () => {
    process.env.BILLING_TAX_ENGINE = 'stripe';
    process.env.BILLING_STRIPE_SECRET_KEY = 'sk_test_x';
    process.env.BILLING_TAX_ENGINE_FALLBACK = '1';
    process.env.BILLING_TAX_COLLECT_COUNTRIES = 'US';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        json: async () => ({ error: { message: 'boom' } }),
      }))
    );

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
    expect(breakdown.taxMinor).toBe(306);
    expect(breakdown.note).toMatch(/built-in state estimate/i);
  });
});
