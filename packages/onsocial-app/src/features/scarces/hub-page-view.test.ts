import { describe, expect, it } from 'vitest';
import {
  invalidateOwnedVaultCache,
  putOwnedVaultPage,
} from '@/features/market/owned-vault-cache';
import {
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

  it('is use-first for hub staff and confirmed holders only', () => {
    expect(
      hubUseFirst({ isAuthority: true, holdsEditionInHub: false })
    ).toBe(true);
    expect(
      hubUseFirst({ isAuthority: false, holdsEditionInHub: true })
    ).toBe(true);
    expect(
      hubUseFirst({ isAuthority: false, holdsEditionInHub: null })
    ).toBe(false);
    expect(
      hubUseFirst({ isAuthority: false, holdsEditionInHub: false })
    ).toBe(false);
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

  it('matches holdings by hub catalog id only', () => {
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
    ];
    expect(ownedItemsInHub(items, AUDIT_HUB).map((item) => item.tokenId)).toEqual(
      ['night-drive:3', 'dusk-run:1']
    );
    expect(
      ownedItemsInHub(items, { appId: 'e2e-hub', collectionIds: [] })
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
