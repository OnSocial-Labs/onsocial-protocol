import { describe, expect, it } from 'vitest';
import {
  invalidateOwnedVaultCache,
  putOwnedVaultPage,
} from '@/features/market/owned-vault-cache';
import {
  collectionDropBackHref,
  collectionShowCommerceMeter,
  collectionUseFirst,
  peekHoldsCollection,
  peekOwnedTokenForCollection,
} from '@/features/scarces/collection-page-view';

describe('collection page view', () => {
  it('is use-first for owners and confirmed holders only', () => {
    expect(collectionUseFirst({ isOwner: true, holdsEdition: false })).toBe(
      true
    );
    expect(collectionUseFirst({ isOwner: false, holdsEdition: true })).toBe(
      true
    );
    expect(collectionUseFirst({ isOwner: false, holdsEdition: null })).toBe(
      false
    );
    expect(collectionUseFirst({ isOwner: false, holdsEdition: false })).toBe(
      false
    );
  });

  it('keeps the mint meter for visitors and holders who can mint more', () => {
    expect(
      collectionShowCommerceMeter({ useFirst: false, canMintMore: false })
    ).toBe(true);
    expect(
      collectionShowCommerceMeter({ useFirst: true, canMintMore: false })
    ).toBe(false);
    expect(
      collectionShowCommerceMeter({ useFirst: true, canMintMore: true })
    ).toBe(true);
  });

  it('sends holders to Collectibles and visitors to Market', () => {
    expect(
      collectionDropBackHref({
        useFirst: true,
        viewerAccountId: 'Alice.near',
      })
    ).toBe('/@Alice.near/collectibles');
    expect(
      collectionDropBackHref({ useFirst: false, viewerAccountId: 'alice.near' })
    ).toBe('/market');
    expect(collectionDropBackHref({ useFirst: true, viewerAccountId: '' })).toBe(
      '/market'
    );
  });

  it('reads a held drop from the vault page cache', () => {
    invalidateOwnedVaultCache();
    putOwnedVaultPage('alice.near', {
      items: [
        {
          tokenId: 'night-drive:3',
          title: 'Night Drive',
          ownerId: 'alice.near',
          collectionId: 'night-drive',
          listingKind: null,
        },
      ],
      nextFromEnd: 0,
      hasMore: false,
    });
    expect(peekHoldsCollection('Alice.near', 'night-drive')).toBe(true);
    expect(peekOwnedTokenForCollection('alice.near', 'night-drive')).toBe(
      'night-drive:3'
    );
    expect(peekHoldsCollection('alice.near', 'chapter-one')).toBe(false);
    invalidateOwnedVaultCache('alice.near');
    expect(peekHoldsCollection('alice.near', 'night-drive')).toBe(false);
  });
});
