import { describe, expect, it } from 'vitest';
import {
  groupMarketCreatorDrops,
  listedCollectionIdSet,
  marketCreatorBackHref,
  marketCreatorCatalogShell,
  marketCreatorDocumentTitle,
  marketCreatorDropMatchesMedium,
  marketCreatorDropMatchesQuery,
  marketCreatorDropMetaBits,
  marketCreatorBrowseLabel,
  marketCreatorEmptyCopy,
  marketCreatorScreenTitle,
  marketCreatorShopCountCopy,
  marketCreatorShop,
  marketCreatorShopActionLabel,
} from '@/features/market/market-creator-view';
import type { ProfileStoreDrop } from '@/lib/profile-store-types';

function drop(
  over: Partial<ProfileStoreDrop> & Pick<ProfileStoreDrop, 'collectionId'>
): ProfileStoreDrop {
  return {
    key: over.collectionId,
    title: over.title ?? over.collectionId,
    mediaUrl: null,
    priceNear: '2',
    remaining: 8,
    totalSupply: 10,
    status: 'live',
    ...over,
  };
}

describe('market creator view', () => {
  it('is shop mode only when a creator is set', () => {
    expect(marketCreatorShop('alice.near')).toBe(true);
    expect(marketCreatorShop('  ')).toBe(false);
    expect(marketCreatorShop(null)).toBe(false);
  });

  it('names the shop and sends back to Market', () => {
    expect(
      marketCreatorScreenTitle({
        displayName: 'Alice',
        creatorId: 'alice.near',
      })
    ).toBe('Alice');
    expect(
      marketCreatorScreenTitle({
        displayName: null,
        creatorId: 'e2e.market.testnet',
      })
    ).toBe('@e2e.market.testnet');
    expect(
      marketCreatorDocumentTitle({
        displayName: null,
        creatorId: 'e2e.market.testnet',
      })
    ).toBe('@e2e.market.testnet • Market');
    expect(marketCreatorBackHref()).toBe('/market');
    expect(marketCreatorEmptyCopy()).toBe('Nothing in this shop yet.');
    expect(marketCreatorBrowseLabel()).toBe('Browse Market');
    expect(
      marketCreatorShopCountCopy({ dropCount: 2, listingCount: 1 })
    ).toBe('2 drops · 1 for sale');
    expect(
      marketCreatorShopCountCopy({ dropCount: 1, listingCount: 0 })
    ).toBe('1 drop');
    expect(
      marketCreatorShopCountCopy({ dropCount: 0, listingCount: 0 })
    ).toBeNull();
  });

  it('keeps a skeleton on SSR miss until the client catalog settles', () => {
    expect(
      marketCreatorCatalogShell({
        hasDrops: false,
        hasListings: false,
        ssrMiss: true,
        clientSettled: false,
      })
    ).toBe('skeleton');
    expect(
      marketCreatorCatalogShell({
        hasDrops: true,
        hasListings: false,
        ssrMiss: true,
        clientSettled: false,
      })
    ).toBe('ready');
    expect(
      marketCreatorCatalogShell({
        hasDrops: false,
        hasListings: false,
        ssrMiss: true,
        clientSettled: true,
      })
    ).toBe('empty');
  });

  it('uses Mint on live remaining drops and Open otherwise', () => {
    expect(
      marketCreatorShopActionLabel(drop({ collectionId: 'a', status: 'live' }))
    ).toBe('Mint');
    expect(
      marketCreatorShopActionLabel(
        drop({ collectionId: 'b', status: 'live', remaining: 0 })
      )
    ).toBe('Open');
    expect(
      marketCreatorShopActionLabel(drop({ collectionId: 'c', status: 'ended' }))
    ).toBe('Open');
  });

  it('uses house format labels and drops status when grouped', () => {
    const night = drop({
      collectionId: 'night',
      title: 'Night Drive',
      mediumKind: 'audio',
      audioFormat: 'album',
    });
    expect(marketCreatorDropMetaBits(night)).toEqual([
      'Live',
      'Album',
      '2 NEAR',
    ]);
    expect(marketCreatorDropMetaBits(night, { includeStatus: false })).toEqual([
      'Album',
      '2 NEAR',
    ]);
    expect(
      marketCreatorDropMetaBits(
        drop({
          collectionId: 'quiet',
          status: 'ended',
          mediumKind: 'art',
          priceNear: '0',
        }),
        { includeStatus: false }
      )
    ).toEqual(['Art', 'Free']);
  });

  it('groups live then past and matches shop search', () => {
    const groups = groupMarketCreatorDrops([
      drop({ collectionId: 'quiet', title: 'Quiet Print', status: 'ended' }),
      drop({ collectionId: 'night', title: 'Night Drive', status: 'live' }),
    ]);
    expect(groups.map((group) => group.label)).toEqual(['Live', 'Past']);
    expect(groups[0]?.drops[0]?.title).toBe('Night Drive');
    expect(
      marketCreatorDropMatchesQuery(
        drop({ collectionId: 'night', title: 'Night Drive' }),
        'night'
      )
    ).toBe(true);
    expect(
      marketCreatorDropMatchesQuery(
        drop({ collectionId: 'quiet', title: 'Quiet Print' }),
        'night'
      )
    ).toBe(false);
    expect(
      marketCreatorDropMatchesMedium(
        drop({ collectionId: 'night', mediumKind: 'audio' }),
        'audio'
      )
    ).toBe(true);
    expect(
      marketCreatorDropMatchesMedium(
        drop({ collectionId: 'night', mediumKind: 'audio' }),
        'art'
      )
    ).toBe(false);
  });

  it('reads listing collection ids from the row or the token', () => {
    expect(
      [...listedCollectionIdSet([
        { collectionId: 'night-drive' },
        { tokenId: 'dusk-run:1' },
        { collectionId: '  ', tokenId: null },
      ])].sort()
    ).toEqual(['dusk-run', 'night-drive']);
  });
});
