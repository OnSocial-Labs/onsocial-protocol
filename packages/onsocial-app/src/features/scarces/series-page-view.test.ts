import { describe, expect, it } from 'vitest';
import {
  invalidateOwnedVaultCache,
  putOwnedVaultPage,
} from '@/features/market/owned-vault-cache';
import {
  heldCollectionIdSet,
  humanizeSeriesId,
  ownedItemsInSeries,
  peekHeldSeriesItems,
  peekHoldsSeries,
  seriesCatalogShell,
  seriesDisplayTitle,
  seriesPageBackHref,
  seriesShopActionLabel,
  seriesUseFirst,
  shopRowCreatorHandle,
} from '@/features/scarces/series-page-view';
import type { OwnedScarceItem } from '@/features/market/market-listings';

function owned(
  over: Partial<OwnedScarceItem> & Pick<OwnedScarceItem, 'tokenId'>
): OwnedScarceItem {
  return {
    title: over.tokenId,
    ownerId: 'greenghost.onsocial.testnet',
    listingKind: null,
    ...over,
  };
}

const NIGHT_ROADS = {
  creatorId: 'alice.near',
  seriesId: 'night-roads',
  collectionIds: ['night-drive', 'dusk-run'],
};

describe('series page view', () => {
  it('humanizes a slug and prefers brand then stamped title', () => {
    expect(humanizeSeriesId('night-roads')).toBe('Night Roads');
    expect(humanizeSeriesId('audit-series')).toBe('Audit Series');
    expect(humanizeSeriesId('Ink Studies')).toBe('Ink Studies');
    expect(
      seriesDisplayTitle({
        brandingTitle: 'Ink Studies',
        dropSeriesTitle: 'Eggs',
        seriesId: 'ink',
      })
    ).toBe('Ink Studies');
    expect(
      seriesDisplayTitle({
        brandingTitle: null,
        dropSeriesTitle: 'Eggs',
        seriesId: 'eggs',
      })
    ).toBe('Eggs');
    expect(
      seriesDisplayTitle({
        brandingTitle: null,
        dropSeriesTitle: null,
        seriesId: 'night-roads',
      })
    ).toBe('Night Roads');
  });

  it('keeps a skeleton on SSR miss until the client catalog settles', () => {
    expect(
      seriesCatalogShell({
        hasCatalog: false,
        hasHeld: false,
        ssrMiss: true,
        clientSettled: false,
      })
    ).toBe('skeleton');
    expect(
      seriesCatalogShell({
        hasCatalog: true,
        hasHeld: false,
        ssrMiss: true,
        clientSettled: true,
      })
    ).toBe('ready');
    expect(
      seriesCatalogShell({
        hasCatalog: false,
        hasHeld: true,
        ssrMiss: true,
        clientSettled: false,
      })
    ).toBe('ready');
    expect(
      seriesCatalogShell({
        hasCatalog: false,
        hasHeld: false,
        ssrMiss: true,
        clientSettled: true,
      })
    ).toBe('empty');
  });

  it('uses Collect on live shop rows and Open otherwise', () => {
    expect(seriesShopActionLabel('live')).toBe('Collect');
    expect(seriesShopActionLabel('ended')).toBe('Open');
  });

  it('keeps the full named handle on shop rows', () => {
    expect(shopRowCreatorHandle('alice.near')).toBe('@alice.near');
    expect(shopRowCreatorHandle(' Bob.testnet ')).toBe('@Bob.testnet');
    expect(shopRowCreatorHandle('')).toBe('');
  });

  it('is use-first for owners and confirmed holders only', () => {
    expect(
      seriesUseFirst({ isOwner: true, holdsEditionInSeries: false })
    ).toBe(true);
    expect(
      seriesUseFirst({ isOwner: false, holdsEditionInSeries: true })
    ).toBe(true);
    expect(
      seriesUseFirst({ isOwner: false, holdsEditionInSeries: null })
    ).toBe(false);
    expect(
      seriesUseFirst({ isOwner: false, holdsEditionInSeries: false })
    ).toBe(false);
  });

  it('sends holders to Collectibles and visitors to this creator shop', () => {
    expect(
      seriesPageBackHref({
        useFirst: true,
        viewerAccountId: 'Alice.near',
        shopHref: '/market?creator=bob.near',
      })
    ).toBe('/@Alice.near/collectibles');
    expect(
      seriesPageBackHref({
        useFirst: false,
        viewerAccountId: 'alice.near',
        shopHref: '/market?creator=bob.near',
      })
    ).toBe('/market?creator=bob.near');
    expect(
      seriesPageBackHref({
        useFirst: true,
        viewerAccountId: '',
        shopHref: '/market?creator=bob.near',
      })
    ).toBe('/market?creator=bob.near');
  });

  it('matches holdings by catalog id or stamped series', () => {
    const items = [
      owned({
        tokenId: 'night-drive:3',
        collectionId: 'night-drive',
        creatorId: 'alice.near',
        seriesId: 'night-roads',
      }),
      owned({
        tokenId: 'other:1',
        collectionId: 'other',
        creatorId: 'alice.near',
        seriesId: 'other-line',
      }),
      owned({
        tokenId: 'dusk-run:1',
        collectionId: 'dusk-run',
        creatorId: 'Alice.near',
        seriesId: 'night-roads',
      }),
    ];
    const held = ownedItemsInSeries(items, NIGHT_ROADS);
    expect(held.map((item) => item.tokenId)).toEqual([
      'night-drive:3',
      'dusk-run:1',
    ]);
    expect([...heldCollectionIdSet(held)].sort()).toEqual([
      'dusk-run',
      'night-drive',
    ]);
    expect(
      ownedItemsInSeries(items, {
        creatorId: 'bob.near',
        seriesId: 'night-roads',
        collectionIds: [],
      }).map((item) => item.tokenId)
    ).toEqual([]);
  });

  it('reads a held series from the vault page cache', () => {
    invalidateOwnedVaultCache();
    putOwnedVaultPage('greenghost.onsocial.testnet', {
      items: [
        owned({
          tokenId: 'night-drive:3',
          collectionId: 'night-drive',
          creatorId: 'alice.near',
          seriesId: 'night-roads',
        }),
      ],
      nextFromEnd: 0,
      hasMore: false,
    });
    expect(
      peekHoldsSeries('Greenghost.onsocial.testnet', {
        creatorId: 'alice.near',
        seriesId: 'night-roads',
        collectionIds: [],
      })
    ).toBe(true);
    expect(
      peekHeldSeriesItems('greenghost.onsocial.testnet', {
        creatorId: 'alice.near',
        seriesId: 'night-roads',
        collectionIds: [],
      })[0]?.tokenId
    ).toBe('night-drive:3');
    expect(
      peekHoldsSeries('greenghost.onsocial.testnet', {
        creatorId: 'alice.near',
        seriesId: 'other-line',
        collectionIds: [],
      })
    ).toBe(false);
    invalidateOwnedVaultCache('greenghost.onsocial.testnet');
    expect(
      peekHoldsSeries('greenghost.onsocial.testnet', {
        creatorId: 'alice.near',
        seriesId: 'night-roads',
        collectionIds: ['night-drive'],
      })
    ).toBe(false);
  });
});
