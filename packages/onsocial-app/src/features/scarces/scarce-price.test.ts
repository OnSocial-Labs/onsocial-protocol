import { describe, expect, it } from 'vitest';
import {
  scarcePriceChangeHint,
  scarcePriceChangeReady,
  scarcePriceChangeSeed,
  scarcePriceInputDecimals,
  usdE6AmountInput,
} from '@/features/scarces/scarce-price';

describe('scarcePriceChangeReady', () => {
  it('allows a new fixed price and refuses auctions, dust, and the same price', () => {
    expect(
      scarcePriceChangeReady({
        listingKind: 'fixed',
        currentPriceNear: '1',
        nextPriceNear: '2',
      })
    ).toBe(true);
    expect(
      scarcePriceChangeReady({
        listingKind: 'auction',
        currentPriceNear: '1',
        nextPriceNear: '2',
      })
    ).toBe(false);
    expect(
      scarcePriceChangeReady({
        listingKind: 'fixed',
        currentPriceNear: '1',
        nextPriceNear: '0.001',
      })
    ).toBe(false);
    expect(
      scarcePriceChangeReady({
        listingKind: 'fixed',
        currentPriceNear: '1.0',
        nextPriceNear: '1',
      })
    ).toBe(false);
  });
});

describe('scarcePriceChangeHint', () => {
  it('speaks only for a low price or an unchanged price after an edit', () => {
    expect(
      scarcePriceChangeHint({
        currentPriceNear: '1',
        nextPriceNear: '0.001',
      })
    ).toBe('Minimum 0.01 NEAR.');
    expect(
      scarcePriceChangeHint({
        currentPriceNear: '1',
        nextPriceNear: '1',
      })
    ).toBeNull();
    expect(
      scarcePriceChangeHint({
        currentPriceNear: '1',
        nextPriceNear: '1',
        revealUnchanged: true,
      })
    ).toBe('This is the current price.');
    expect(
      scarcePriceChangeHint({
        currentPriceNear: '1',
        nextPriceNear: '2',
        revealUnchanged: true,
      })
    ).toBeNull();
  });
});

describe('scarcePriceChangeSeed', () => {
  it('opens a dollar listing on the sticker, not the stored NEAR floor', () => {
    expect(usdE6AmountInput('1000000')).toBe('1');
    expect(usdE6AmountInput('50000')).toBe('0.05');
    expect(
      scarcePriceChangeSeed({
        listedPriceNear: '0',
        listedUsdE6: '1000000',
      })
    ).toEqual({ unit: 'usd', amount: '1' });
    expect(
      scarcePriceChangeSeed({
        listedPriceNear: '2',
        listedUsdE6: null,
      })
    ).toEqual({ unit: 'near', amount: '2' });
  });
});

describe('dollar change price', () => {
  it('keeps a few-cent dollar ask and does not apply the NEAR floor', () => {
    expect(
      scarcePriceChangeReady({
        listingKind: 'fixed',
        currentPriceNear: '0',
        nextPriceNear: '0.05',
        unit: 'usd',
        currentUsdE6: '1000000',
      })
    ).toBe(true);
    expect(
      scarcePriceChangeHint({
        currentPriceNear: '0',
        nextPriceNear: '0.05',
        unit: 'usd',
        currentUsdE6: '1000000',
      })
    ).toBeNull();
    expect(
      scarcePriceChangeReady({
        listingKind: 'fixed',
        nextPriceNear: '1',
        unit: 'usd',
        currentUsdE6: '1000000',
      })
    ).toBe(false);
    expect(
      scarcePriceChangeHint({
        nextPriceNear: '1',
        revealUnchanged: true,
        unit: 'usd',
        currentUsdE6: '1000000',
      })
    ).toBe('This is the current price.');
    expect(scarcePriceInputDecimals('usd', '1')).toBe(2);
    expect(scarcePriceInputDecimals('usd', '1.2345')).toBe(4);
    expect(scarcePriceInputDecimals('near', '1.2345')).toBe(5);
  });
});
