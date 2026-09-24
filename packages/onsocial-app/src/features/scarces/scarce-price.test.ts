import { describe, expect, it } from 'vitest';
import {
  scarcePriceChangeHint,
  scarcePriceChangeReady,
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
