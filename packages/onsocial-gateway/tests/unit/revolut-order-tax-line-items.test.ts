import { describe, expect, it } from 'vitest';
import { buildRevolutTaxLineItems } from '../../src/services/revolut/order-tax-line-items.js';

describe('buildRevolutTaxLineItems', () => {
  it('splits net unit price and VAT for Revolut Included tax', () => {
    expect(
      buildRevolutTaxLineItems({
        planName: 'Pro',
        breakdown: {
          treatment: 'uk_vat',
          currency: 'USD',
          netMinor: 4900,
          taxMinor: 980,
          totalMinor: 5880,
          taxRateBps: 2000,
          note: 'UK VAT at 20% on net plan price.',
        },
      })
    ).toEqual([
      {
        name: 'OnSocial API Pro',
        type: 'service',
        quantity: { value: 1 },
        unit_price_amount: 4900,
        total_amount: 5880,
        taxes: [{ name: 'VAT 20%', amount: 980 }],
        description: 'UK VAT at 20% on net plan price.',
      },
    ]);
  });

  it('omits taxes when none are due', () => {
    const items = buildRevolutTaxLineItems({
      planName: 'Pro',
      breakdown: {
        treatment: 'eu_reverse_charge',
        currency: 'USD',
        netMinor: 4900,
        taxMinor: 0,
        totalMinor: 4900,
        taxRateBps: 0,
        note: 'EU reverse charge.',
      },
    });
    expect(items[0].taxes).toBeUndefined();
    expect(items[0].total_amount).toBe(4900);
  });
});
