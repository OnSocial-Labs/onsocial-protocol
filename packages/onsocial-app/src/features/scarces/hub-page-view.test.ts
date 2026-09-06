import { describe, expect, it } from 'vitest';
import {
  invalidateOwnedVaultCache,
  putOwnedVaultPage,
} from '@/features/market/owned-vault-cache';
import {
  hubActivityMeta,
  hubCatalogShell,
  hubPageBackHref,
  hubUseFirst,
  ownedItemsInHub,
  peekHeldHubItems,
  peekHoldsHub,
} from '@/features/scarces/hub-page-view';
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

const AUDIT_HUB = {
  appId: 'e2e-hub',
  collectionIds: ['night-drive', 'dusk-run'],
};

describe('hub page view', () => {
  it('keeps a skeleton on SSR miss until the client catalog settles', () => {
    expect(
      hubCatalogShell({
        hasCatalog: false,
        hasHeld: false,
        ssrMiss: true,
        clientSettled: false,
      })
    ).toBe('skeleton');
    expect(
      hubCatalogShell({
        hasCatalog: true,
        hasHeld: false,
        ssrMiss: true,
        clientSettled: true,
      })
    ).toBe('ready');
    expect(
      hubCatalogShell({
        hasCatalog: false,
        hasHeld: true,
        ssrMiss: true,
        clientSettled: false,
      })
    ).toBe('ready');
    expect(
      hubCatalogShell({
        hasCatalog: false,
        hasHeld: false,
        ssrMiss: true,
        clientSettled: true,
      })
    ).toBe('empty');
    expect(
      hubCatalogShell({
        hasCatalog: false,
        hasHeld: false,
        ssrMiss: false,
        clientSettled: false,
      })
    ).toBe('empty');
  });

  it('joins activity into a compact house meta line', () => {
    expect(
      hubActivityMeta({
        dropsTotal: 4,
        mintedTotal: 12,
        uniqueHolders: 6,
        volumeNearLabel: '4.0',
      })
    ).toBe('4 drops · 12 minted · 6 holders · 4.0 NEAR');
    expect(
      hubActivityMeta({
        dropsTotal: 1,
        mintedTotal: 0,
        uniqueHolders: 1,
        volumeNearLabel: '0',
      })
    ).toBe('1 drop · 1 holder');
    expect(
      hubActivityMeta({
        dropsTotal: 0,
        mintedTotal: 0,
        uniqueHolders: 0,
        volumeNearLabel: '0',
      })
    ).toBe('');
  });

  it('is use-first for confirmed holders only', () => {
    expect(hubUseFirst({ holdsEditionInHub: true })).toBe(true);
    expect(hubUseFirst({ holdsEditionInHub: null })).toBe(false);
    expect(hubUseFirst({ holdsEditionInHub: false })).toBe(false);
  });

  it('sends holders to Collectibles and visitors to Hubs', () => {
    expect(
      hubPageBackHref({
        useFirst: true,
        viewerAccountId: 'Alice.near',
      })
    ).toBe('/@Alice.near/collectibles');
    expect(
      hubPageBackHref({
        useFirst: false,
        viewerAccountId: 'alice.near',
      })
    ).toBe('/apps');
    expect(
      hubPageBackHref({
        useFirst: true,
        viewerAccountId: '',
      })
    ).toBe('/apps');
  });

  it('matches holdings by catalog id or stamped hub app id', () => {
    const items = [
      owned({
        tokenId: 'night-drive:3',
        collectionId: 'night-drive',
        creatorId: 'alice.near',
      }),
      owned({
        tokenId: 'other:1',
        collectionId: 'other',
        creatorId: 'alice.near',
      }),
      owned({
        tokenId: 'dusk-run:1',
        collectionId: 'dusk-run',
        creatorId: 'Alice.near',
      }),
      owned({
        tokenId: 'hub-only:1',
        collectionId: 'hub-only',
        appId: 'E2E-HUB',
      }),
    ];
    expect(ownedItemsInHub(items, AUDIT_HUB).map((item) => item.tokenId)).toEqual(
      ['night-drive:3', 'dusk-run:1', 'hub-only:1']
    );
    expect(
      ownedItemsInHub(items, { appId: 'e2e-hub', collectionIds: [] }).map(
        (item) => item.tokenId
      )
    ).toEqual(['hub-only:1']);
    expect(
      ownedItemsInHub(items, { appId: 'other-hub', collectionIds: [] })
    ).toEqual([]);
  });

  it('reads a held hub from the vault page cache', () => {
    invalidateOwnedVaultCache();
    putOwnedVaultPage('greenghost.onsocial.testnet', {
      items: [
        owned({
          tokenId: 'night-drive:3',
          collectionId: 'night-drive',
          creatorId: 'alice.near',
          appId: 'e2e-hub',
        }),
      ],
      nextFromEnd: 0,
      hasMore: false,
    });
    expect(
      peekHoldsHub('Greenghost.onsocial.testnet', {
        appId: 'e2e-hub',
        collectionIds: ['night-drive'],
      })
    ).toBe(true);
    expect(
      peekHeldHubItems('greenghost.onsocial.testnet', {
        appId: 'e2e-hub',
        collectionIds: ['night-drive'],
      })[0]?.tokenId
    ).toBe('night-drive:3');
    expect(
      peekHoldsHub('greenghost.onsocial.testnet', {
        appId: 'e2e-hub',
        collectionIds: [],
      })
    ).toBe(true);
    expect(
      peekHoldsHub('greenghost.onsocial.testnet', {
        appId: 'other-hub',
        collectionIds: ['other'],
      })
    ).toBe(false);
    invalidateOwnedVaultCache('greenghost.onsocial.testnet');
    expect(
      peekHoldsHub('greenghost.onsocial.testnet', {
        appId: 'e2e-hub',
        collectionIds: ['night-drive'],
      })
    ).toBe(false);
  });
});
