import { describe, expect, it } from 'vitest';
import {
  formatScarceBuyPrice,
  scarceBuyDealParts,
  scarceBuyPriceLine,
  scarceBuySupplyPart,
} from './scarce-buy-deal';

describe('formatScarceBuyPrice', () => {
  it('speaks a unit ask in NEAR', () => {
    expect(formatScarceBuyPrice('1')).toBe('1 NEAR');
    expect(formatScarceBuyPrice('2.5')).toBe('2.5 NEAR');
  });

  it('stays quiet when there is no ask', () => {
    expect(formatScarceBuyPrice(undefined)).toBe('');
    expect(formatScarceBuyPrice('')).toBe('');
  });
});

describe('scarceBuySupplyPart', () => {
  it('matches New drop when the edition is still full', () => {
    expect(
      scarceBuySupplyPart({ copies: 25, remaining: 25, unit: 'editions' })
    ).toBe('25 editions');
    expect(
      scarceBuySupplyPart({ copies: 100, remaining: 100, unit: 'copies' })
    ).toBe('100 copies');
  });

  it('says what is left once some are gone', () => {
    expect(
      scarceBuySupplyPart({ copies: 10, remaining: 8, unit: 'editions' })
    ).toBe('8 of 10 left');
  });

  it('hides supply on a 1/1', () => {
    expect(
      scarceBuySupplyPart({ copies: 1, remaining: 1, unit: 'editions' })
    ).toBeNull();
  });
});

describe('scarceBuyPriceLine', () => {
  it('prefers a dollar sticker over the NEAR ask', () => {
    expect(scarceBuyPriceLine({ priceLabel: '$5', priceNear: '1.06' })).toBe(
      '$5'
    );
    expect(scarceBuyPriceLine({ priceNear: '3' })).toBe('3 NEAR');
    expect(scarceBuyPriceLine({ priceNear: '0' })).toBe('');
    expect(scarceBuyPriceLine({})).toBe('');
  });
});

describe('scarceBuyDealParts', () => {
  it('keeps supply under the price on a primary mint', () => {
    expect(
      scarceBuyDealParts({
        isPrimaryMint: true,
        copies: 25,
        remaining: 25,
        unit: 'editions',
      })
    ).toEqual(['25 editions']);
  });

  it('says what is left once some are gone', () => {
    expect(
      scarceBuyDealParts({
        isPrimaryMint: true,
        copies: 10,
        remaining: 8,
        unit: 'editions',
      })
    ).toEqual(['8 of 10 left']);
  });

  it('keeps one clock on a resale', () => {
    expect(
      scarceBuyDealParts({
        isPrimaryMint: false,
        listedLabel: 'Listed 2d ago',
      })
    ).toEqual(['Listed 2d ago']);
  });

  it('stays quiet on a 1/1 with no clock', () => {
    expect(
      scarceBuyDealParts({
        isPrimaryMint: true,
        copies: 1,
        remaining: 1,
        unit: 'editions',
      })
    ).toEqual([]);
    expect(scarceBuyDealParts({ isPrimaryMint: false })).toEqual([]);
  });
});
