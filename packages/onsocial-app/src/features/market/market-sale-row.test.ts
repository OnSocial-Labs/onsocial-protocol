import { describe, expect, it } from 'vitest';
import { marketSalePriceLabel } from '@/features/market/market-sale-row';

describe('marketSalePriceLabel', () => {
  it('rounds the NEAR after a dollar sticker to 2 decimals', () => {
    expect(
      marketSalePriceLabel({
        usdE6: '5000000',
        priceNear: '1.06864246861300357540199',
      })
    ).toBe('$5 · 1.07 NEAR');
    expect(
      marketSalePriceLabel({
        usdE6: '1000000',
        priceNear: '0.1977',
      })
    ).toBe('$1 · 0.20 NEAR');
  });

  it('keeps a NEAR sale at 4 decimals', () => {
    expect(marketSalePriceLabel({ priceNear: '0.1' })).toBe('0.1 NEAR');
    expect(marketSalePriceLabel({ priceNear: '1' })).toBe('1 NEAR');
    expect(marketSalePriceLabel({ priceNear: '1.06864' })).toBe('1.0686 NEAR');
  });
});
