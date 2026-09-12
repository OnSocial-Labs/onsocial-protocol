import { describe, expect, it, vi } from 'vitest';
import {
  invalidateOwnedVaultCache,
  putOwnedVaultPage,
} from '@/features/market/owned-vault-cache';
import {
  collectionCatalogShell,
  collectionCoverImmersive,
  collectionCoverSquare,
  collectionChildLeaveHref,
  collectionDropBackHref,
  collectionShowCommerceMeter,
  collectionShowInlineTracks,
  collectionUseFirst,
  peekHoldsCollection,
  peekHoldsCollectionForDropPage,
  peekOwnedTokenForCollection,
  resolveCollectionOwnership,
  seedCollectionViewFromNowPlaying,
} from '@/features/scarces/collection-page-view';

describe('collection page view', () => {
  it('keeps Art as an inset square, not a 16/10 bleed', () => {
    expect(collectionCoverSquare({ kind: 'art', isAudio: false })).toBe(true);
    expect(collectionCoverSquare({ kind: 'ticket', isAudio: false })).toBe(
      false
    );
    expect(collectionCoverSquare({ kind: 'audio', isAudio: true })).toBe(true);
    expect(collectionCoverImmersive({ hasMedia: true, kind: 'art' })).toBe(
      false
    );
    expect(collectionCoverImmersive({ hasMedia: true, kind: 'ticket' })).toBe(
      true
    );
    expect(collectionCoverImmersive({ hasMedia: false, kind: 'art' })).toBe(
      false
    );
  });

  it('resolves ownership to holder / visitor / unknown', () => {
    expect(
      resolveCollectionOwnership({
        isOwner: true,
        holdsEdition: false,
        walletLoading: false,
      })
    ).toBe('holder');
    expect(
      resolveCollectionOwnership({
        isOwner: false,
        holdsEdition: true,
        walletLoading: false,
        viewerAccountId: 'alice.near',
      })
    ).toBe('holder');
    expect(
      resolveCollectionOwnership({
        isOwner: false,
        holdsEdition: null,
        walletLoading: false,
        viewerAccountId: 'alice.near',
        playSessionMatches: true,
      })
    ).toBe('holder');
    expect(
      resolveCollectionOwnership({
        isOwner: false,
        holdsEdition: null,
        walletLoading: true,
      })
    ).toBe('unknown');
    expect(
      resolveCollectionOwnership({
        isOwner: false,
        holdsEdition: null,
        walletLoading: false,
        viewerAccountId: 'alice.near',
      })
    ).toBe('unknown');
    expect(
      resolveCollectionOwnership({
        isOwner: false,
        holdsEdition: false,
        walletLoading: false,
        viewerAccountId: 'alice.near',
      })
    ).toBe('visitor');
    expect(
      resolveCollectionOwnership({
        isOwner: false,
        holdsEdition: null,
        walletLoading: false,
        viewerAccountId: null,
      })
    ).toBe('visitor');
  });

  it('is use-first only for holders', () => {
    expect(collectionUseFirst('holder')).toBe(true);
    expect(collectionUseFirst('visitor')).toBe(false);
    expect(collectionUseFirst('unknown')).toBe(false);
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

  it('shows inline tracks for visitors only', () => {
    expect(
      collectionShowInlineTracks({
        hasPlayables: true,
        ownership: 'visitor',
      })
    ).toBe(true);
    expect(
      collectionShowInlineTracks({
        hasPlayables: true,
        ownership: 'holder',
      })
    ).toBe(false);
    expect(
      collectionShowInlineTracks({
        hasPlayables: true,
        ownership: 'unknown',
      })
    ).toBe(false);
    expect(
      collectionShowInlineTracks({
        hasPlayables: false,
        ownership: 'visitor',
      })
    ).toBe(false);
  });

  it('paints a skeleton on SSR miss until the client catalog settles', () => {
    expect(
      collectionCatalogShell({
        hasView: false,
        ssrMiss: true,
        clientSettled: false,
      })
    ).toBe('skeleton');
    expect(
      collectionCatalogShell({
        hasView: true,
        ssrMiss: true,
        clientSettled: true,
      })
    ).toBe('drop');
    expect(
      collectionCatalogShell({
        hasView: false,
        ssrMiss: true,
        clientSettled: true,
      })
    ).toBe('unavailable');
    expect(
      collectionCatalogShell({
        hasView: true,
        ssrMiss: false,
        clientSettled: false,
      })
    ).toBe('drop');
  });

  it('sends holders to Collectibles and visitors to Drops', () => {
    expect(
      collectionDropBackHref({
        useFirst: true,
        viewerAccountId: 'Alice.near',
      })
    ).toBe('/@Alice.near/collectibles');
    expect(
      collectionDropBackHref({ useFirst: false, viewerAccountId: 'alice.near' })
    ).toBe('/drops');
    expect(collectionDropBackHref({ useFirst: true, viewerAccountId: '' })).toBe(
      '/drops'
    );
  });

  it('sends door and redeem loading to the drop', () => {
    expect(collectionChildLeaveHref('night-drive')).toBe(
      '/collection/night-drive'
    );
    expect(collectionChildLeaveHref('  ')).toBe('/drops');
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

  it('seeds drop-page hold from the persisted wallet when React wallet is cold', () => {
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
    const store = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
      },
    });
    window.localStorage.setItem('onsocial.app.wallet.accountId', 'alice.near');
    expect(peekHoldsCollectionForDropPage(null, 'night-drive')).toBe(true);
    expect(peekHoldsCollectionForDropPage(null, 'chapter-one')).toBe(false);
    window.localStorage.removeItem('onsocial.app.wallet.accountId');
    vi.unstubAllGlobals();
    invalidateOwnedVaultCache('alice.near');
  });

  it('seeds drop view synchronously from a live now-playing session', () => {
    const view = seedCollectionViewFromNowPlaying({
      collectionId: 'night-drive',
      title: 'Night Drive',
      poster: 'https://cdn.example/night-drive.jpg',
      tracks: [
        {
          title: 'Intro',
          url: 'https://cdn.example/1.mp3',
          mime: 'audio/mpeg',
          artist: 'alice.near',
        },
        {
          title: 'Neon Skyline',
          url: 'https://cdn.example/2.mp3',
          mime: 'audio/mpeg',
          artist: 'alice.near',
        },
      ],
    });
    expect(view.collectionId).toBe('night-drive');
    expect(view.title).toBe('Night Drive');
    expect(view.creatorId).toBe('alice.near');
    expect(view.mediaUrl).toBe('https://cdn.example/night-drive.jpg');
    expect(view.kind).toBe('audio');
    expect(view.audioFormat).toBe('album');
    expect(view.playables).toHaveLength(2);
  });
});
