import { describe, expect, it } from 'vitest';
import {
  excludeOwnedNativeListings,
  hasUnresolvedTitleTemplate,
  resolveTokenDisplayTitle,
  type MarketListingItem,
} from '@/features/market/market-listings';

const baseListing: Omit<MarketListingItem, 'kind' | 'tokenId'> = {
  creatorId: 'seller.testnet',
  title: 'Scarce',
  priceNear: '1',
  blockTimestamp: 1,
};

describe('hasUnresolvedTitleTemplate', () => {
  it.each(['Genesis #{id}', 'Genesis {token_id}', '{seat_number}'])(
    'recognizes an unresolved title template: %s',
    (title) => {
      expect(hasUnresolvedTitleTemplate(title)).toBe(true);
    }
  );

  it('keeps resolved titles unchanged', () => {
    expect(hasUnresolvedTitleTemplate('Genesis #12')).toBe(false);
  });

  it('resolves legacy edition placeholders from the token id', () => {
    expect(resolveTokenDisplayTitle('Genesis #{id}', 'genesis:12')).toBe(
      'Genesis #12'
    );
  });
});

describe('excludeOwnedNativeListings', () => {
  it('keeps creator lazy listings while removing owned resales and auctions', () => {
    const listings: MarketListingItem[] = [
      {
        ...baseListing,
        kind: 'lazy',
        listingId: 'll:1',
      },
      {
        ...baseListing,
        kind: 'native',
        tokenId: 's:1',
      },
      {
        ...baseListing,
        kind: 'auction',
        tokenId: 's:2',
      },
      {
        ...baseListing,
        kind: 'native',
        tokenId: 's:3',
      },
    ];

    expect(
      excludeOwnedNativeListings(listings, new Set(['s:1', 's:2']))
    ).toEqual([listings[0], listings[3]]);
  });
});
