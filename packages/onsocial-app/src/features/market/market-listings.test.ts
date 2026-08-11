import { describe, expect, it } from 'vitest';
import {
  excludeOwnedNativeListings,
  formatMarketRelativeTime,
  hasUnresolvedTitleTemplate,
  resolveTokenDisplayTitle,
  sortMarketListings,
  type MarketListingItem,
} from '@/features/market/market-listings';

const baseListing: Omit<MarketListingItem, 'kind' | 'tokenId'> = {
  creatorId: 'seller.testnet',
  title: 'Scarce',
  priceNear: '1',
  blockTimestamp: 1,
};

describe('formatMarketRelativeTime', () => {
  it('returns empty for missing timestamps', () => {
    expect(formatMarketRelativeTime(0)).toBe('');
    expect(formatMarketRelativeTime(Number.NaN)).toBe('');
  });

  it('formats recent ages', () => {
    const now = Date.now();
    expect(formatMarketRelativeTime(now - 30_000, now)).toBe('just now');
    expect(formatMarketRelativeTime(now - 5 * 60_000, now)).toBe('5m ago');
    expect(formatMarketRelativeTime(now - 3 * 3_600_000, now)).toBe('3h ago');
    expect(formatMarketRelativeTime(now - 2 * 86_400_000, now)).toBe('2d ago');
  });
});

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

describe('sortMarketListings', () => {
  const listings: MarketListingItem[] = [
    {
      ...baseListing,
      kind: 'lazy',
      listingId: 'll:old',
      priceNear: '2',
      blockTimestamp: 10,
    },
    {
      ...baseListing,
      kind: 'auction',
      tokenId: 's:soon',
      priceNear: '0.5',
      blockTimestamp: 20,
      expiresAtNs: 3_000_000_000_000_000,
      bidCount: 2,
    },
    {
      ...baseListing,
      kind: 'native',
      tokenId: 's:ask',
      priceNear: '3',
      blockTimestamp: 30,
      priceLabel: 'Ask',
    },
    {
      ...baseListing,
      kind: 'auction',
      tokenId: 's:later',
      priceNear: '1',
      blockTimestamp: 40,
      expiresAtNs: 9_000_000_000_000_000,
      bidCount: 0,
    },
  ];

  it('sorts newest first by default key', () => {
    expect(sortMarketListings(listings, 'newest').map((row) => row.tokenId ?? row.listingId)).toEqual([
      's:later',
      's:ask',
      's:soon',
      'll:old',
    ]);
  });

  it('sorts by price ascending and descending', () => {
    expect(sortMarketListings(listings, 'price-asc').map((row) => row.priceNear)).toEqual([
      '0.5',
      '1',
      '2',
      '3',
    ]);
    expect(sortMarketListings(listings, 'price-desc').map((row) => row.priceNear)).toEqual([
      '3',
      '2',
      '1',
      '0.5',
    ]);
  });

  it('sorts ending auctions by soonest clock, then other auctions, then fixed', () => {
    expect(sortMarketListings(listings, 'ending').map((row) => row.tokenId ?? row.listingId)).toEqual([
      's:soon',
      's:later',
      's:ask',
      'll:old',
    ]);
  });
});
