import { describe, expect, it } from 'vitest';
import {
  formatScarceBuyPrice,
  scarceBuyDealParts,
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

describe('scarceBuyDealParts', () => {
  it('speaks a primary mint like New drop', () => {
    expect(
      scarceBuyDealParts({
        isPrimaryMint: true,
        copies: 25,
        remaining: 25,
        unit: 'editions',
        priceNear: '1',
      })
    ).toEqual(['25 editions', '1 NEAR']);
  });

  it('keeps the unit ask when qty would change the footer total', () => {
    expect(
      scarceBuyDealParts({
        isPrimaryMint: true,
        copies: 10,
        remaining: 8,
        unit: 'editions',
        priceNear: '2',
      })
    ).toEqual(['8 of 10 left', '2 NEAR']);
  });

  it('does not say Ask on a resale', () => {
    expect(
      scarceBuyDealParts({
        isPrimaryMint: false,
        priceNear: '3',
        listedLabel: 'Listed 2d ago',
        mintedLabel: 'Minted 1w ago',
      })
    ).toEqual(['3 NEAR', 'Listed 2d ago', 'Minted 1w ago']);
  });

  it('does not invent Mint or Primary mint filler', () => {
    expect(
      scarceBuyDealParts({
        isPrimaryMint: true,
        copies: 1,
        remaining: 1,
        unit: 'editions',
        priceNear: '1',
      })
    ).toEqual(['1 NEAR']);
  });
});
