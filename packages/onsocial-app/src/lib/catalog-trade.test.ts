import { describe, expect, it } from 'vitest';
import {
  forgetDrop,
  forgetMarketListing,
  marketListingMatches,
  registerDropForget,
  registerMarketForget,
} from './catalog-trade';

describe('marketListingMatches', () => {
  it('matches a resale by token and a lazy row by listing id', () => {
    expect(
      marketListingMatches(
        { kind: 'native', tokenId: 's:1', listingId: 'other' },
        { tokenId: 's:1' }
      )
    ).toBe(true);
    expect(
      marketListingMatches(
        { kind: 'lazy', tokenId: 's:1', listingId: 'll:9' },
        { tokenId: 's:1' }
      )
    ).toBe(false);
    expect(
      marketListingMatches(
        { kind: 'lazy', listingId: 'll:9' },
        { listingId: 'll:9' }
      )
    ).toBe(true);
  });
});

describe('catalog forget listeners', () => {
  it('tells every registered catalog once, then stops after unsubscribe', () => {
    const seen: string[] = [];
    const stop = registerMarketForget((target) => {
      seen.push(target.tokenId ?? '');
    });
    forgetMarketListing({ tokenId: 's:4' });
    stop();
    forgetMarketListing({ tokenId: 's:5' });
    expect(seen).toEqual(['s:4']);
  });

  it('ignores a drop id that is blank', () => {
    const seen: string[] = [];
    const stop = registerDropForget((id) => {
      seen.push(id);
    });
    forgetDrop('   ');
    forgetDrop('col:1');
    stop();
    expect(seen).toEqual(['col:1']);
  });
});
