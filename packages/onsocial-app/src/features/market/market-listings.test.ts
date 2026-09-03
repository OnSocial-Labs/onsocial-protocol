import { describe, expect, it } from 'vitest';
import {
  excludeOwnedNativeListings,
  formatMarketRelativeTime,
  hasUnresolvedTitleTemplate,
  isPrimaryThoughtListing,
  mergeOwnedYoursItems,
  ownedListedItemsFromViewerListings,
  resolveListingMediumKind,
  resolveTokenDisplayTitle,
  sortMarketListings,
  type MarketListingItem,
  type OwnedScarceItem,
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

describe('ownedListedItemsFromViewerListings', () => {
  it('lifts the viewer’s native and auction rows so Yours can paint before the vault', () => {
    const listings: MarketListingItem[] = [
      { ...baseListing, kind: 'lazy', listingId: 'll:1' },
      { ...baseListing, kind: 'native', tokenId: 's:1' },
      {
        ...baseListing,
        kind: 'auction',
        tokenId: 's:2',
        creatorId: 'other.testnet',
      },
    ];
    const yours = ownedListedItemsFromViewerListings(
      listings,
      'seller.testnet'
    );
    expect(yours).toEqual([
      expect.objectContaining({
        tokenId: 's:1',
        listingKind: 'fixed',
        listedPriceNear: '1',
      }),
    ]);
    expect(
      excludeOwnedNativeListings(
        listings,
        new Set(yours.map((row) => row.tokenId))
      )
    ).toEqual([listings[0], listings[2]]);
  });
});

describe('mergeOwnedYoursItems', () => {
  it('keeps catalog-only listed rows until the vault includes them', () => {
    const catalog: OwnedScarceItem[] = [
      {
        tokenId: 's:1',
        title: 'Listed',
        ownerId: 'seller.testnet',
        listingKind: 'fixed',
        listedPriceNear: '1',
      },
    ];
    const vault: OwnedScarceItem[] = [
      {
        tokenId: 's:9',
        title: 'Unlisted',
        ownerId: 'seller.testnet',
        listingKind: null,
      },
    ];
    expect(mergeOwnedYoursItems(vault, catalog).map((row) => row.tokenId)).toEqual(
      ['s:1', 's:9']
    );
    expect(
      mergeOwnedYoursItems(
        [{ ...catalog[0]!, title: 'Vault wins' }, ...vault],
        catalog
      )[0]?.title
    ).toBe('Vault wins');
  });
});

describe('resolveListingMediumKind', () => {
  it('prefers the indexer column so resales keep the mint stamp', () => {
    expect(
      resolveListingMediumKind({
        mediumKind: 'thought',
        extraJson: null,
      })
    ).toBe('thought');
    expect(
      resolveListingMediumKind({
        mediumKind: 'music',
        extraJson: '{"kind":"art"}',
      })
    ).toBe('audio');
  });

  it('falls back to extra.kind when the column is empty', () => {
    expect(
      resolveListingMediumKind({
        mediumKind: null,
        extraJson: '{"kind":"thought"}',
      })
    ).toBe('thought');
  });
});

describe('isPrimaryThoughtListing', () => {
  it('matches lazy thought post-mints only', () => {
    expect(
      isPrimaryThoughtListing({
        kind: 'lazy',
        mediumKind: 'thought',
      })
    ).toBe(true);
    expect(
      isPrimaryThoughtListing({
        kind: 'native',
        mediumKind: 'thought',
      })
    ).toBe(false);
    expect(
      isPrimaryThoughtListing({
        kind: 'lazy',
        mediumKind: 'audio',
      })
    ).toBe(false);
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
