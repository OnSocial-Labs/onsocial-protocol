import { describe, expect, it, vi } from 'vitest';
import {
  invalidateOwnedVaultCache,
  putOwnedVaultPage,
} from '@/features/market/owned-vault-cache';
import {
  clearOwnedCollectionHold,
  rememberOwnedCollectionHold,
} from '@/features/scarces/owned-collection-hold-cache';
import { APP_WALLET_ACCOUNT_KEY } from '@/lib/gate-return';
import {
  collectionCatalogShell,
  collectionCoverExpandAction,
  collectionCoverImmersive,
  collectionCoverIsAudio,
  collectionCoverIsTextCard,
  collectionCoverSquare,
  collectionOpensWritingReader,
  collectionChildLeaveHref,
  collectionDropBackHref,
  editionTokenForCollection,
  collectionRouteYieldsLoadingSkeleton,
  collectionShowInlineTracks,
  collectionUseFirst,
  collectionViewNeedsCatalogSoftFill,
  collectionFaceTitle,
  collectionMediumBodyPending,
  collectionSoftFillPeek,
  mergeCatalogSoftFillIntoSeed,
  peekDropFaceHoldSeed,
  peekHoldsCollection,
  peekHoldsCollectionForDropPage,
  peekOwnedTokenForCollection,
  peekViewerAccountId,
  resolveCollectionOwnership,
  seedCollectionViewFromNowPlaying,
  seedCollectionViewFromPeek,
  seedCollectionViewFromPostScarceEmbed,
  seedCollectionViewFromStoreDrop,
} from '@/features/scarces/collection-page-view';

describe('collection page view', () => {
  it('keeps ?t= only when the token belongs to this drop', () => {
    expect(
      editionTokenForCollection('cats', 'cats:1')
    ).toBe('cats:1');
    expect(editionTokenForCollection('cats', 'other:1')).toBe('');
    expect(editionTokenForCollection('cats', '  ')).toBe('');
  });

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

  it('treats playables and writing cards like the live drop place', () => {
    expect(
      collectionCoverIsAudio({ kind: 'video', playablesLength: 2 })
    ).toBe(true);
    expect(
      collectionCoverIsAudio({ kind: 'art', playablesLength: 0 })
    ).toBe(false);
    expect(
      collectionCoverIsTextCard({
        kind: 'writing',
        cardBg: null,
        isAudio: false,
      })
    ).toBe(true);
    expect(
      collectionCoverIsTextCard({
        kind: 'art',
        cardBg: 'linear-gradient(#000,#111)',
        isAudio: false,
      })
    ).toBe(true);
    expect(
      collectionCoverIsTextCard({
        kind: 'writing',
        cardBg: null,
        isAudio: true,
      })
    ).toBe(false);
  });

  it('opens the larger cover from the picture and keeps Read on the labeled action', () => {
    expect(
      collectionOpensWritingReader({ kind: 'writing', hasReadables: false })
    ).toBe(true);
    expect(
      collectionOpensWritingReader({ kind: 'art', hasReadables: false })
    ).toBe(false);
    expect(
      collectionOpensWritingReader({ kind: 'art', hasReadables: true })
    ).toBe(true);
    expect(collectionCoverExpandAction({ hasMedia: true })).toBe('artwork');
    expect(collectionCoverExpandAction({ hasMedia: false })).toBe(null);
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

  it('keeps the track list for every viewer', () => {
    expect(collectionShowInlineTracks({ hasPlayables: true })).toBe(true);
    expect(collectionShowInlineTracks({ hasPlayables: false })).toBe(false);
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

  it('does not yield to a drop route loading.tsx (instant host owns the tap)', () => {
    expect(
      collectionRouteYieldsLoadingSkeleton({
        embedded: false,
        clientMounted: false,
      })
    ).toBe(false);
    expect(
      collectionRouteYieldsLoadingSkeleton({
        embedded: false,
        clientMounted: true,
      })
    ).toBe(false);
    expect(
      collectionRouteYieldsLoadingSkeleton({
        embedded: true,
        clientMounted: false,
      })
    ).toBe(false);
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
    expect(
      collectionDropBackHref({ useFirst: true, viewerAccountId: '' })
    ).toBe('/drops');
  });

  it('sends door and redeem loading to the drop', () => {
    expect(collectionChildLeaveHref('night-drive')).toBe(
      '/collection/night-drive'
    );
    expect(collectionChildLeaveHref('  ')).toBe('/drops');
  });

  it('reads a held drop from the vault page cache', () => {
    invalidateOwnedVaultCache();
    clearOwnedCollectionHold();
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
    // Vault page TTL wipe must not erase drop-face last-good hold.
    invalidateOwnedVaultCache('alice.near');
    expect(peekHoldsCollection('alice.near', 'night-drive')).toBe(true);
    clearOwnedCollectionHold('alice.near');
    expect(peekHoldsCollection('alice.near', 'night-drive')).toBe(false);
  });

  it('imperative wallet peek seeds hold; render peeks need the React account id', () => {
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
    window.localStorage.setItem(APP_WALLET_ACCOUNT_KEY, 'alice.near');
    // Imperative peek may read storage; render peeks take the React wallet id.
    expect(peekViewerAccountId(null)).toBe('alice.near');
    expect(peekViewerAccountId('bob.near')).toBe('bob.near');
    expect(peekHoldsCollectionForDropPage(null, 'night-drive')).toBe(false);
    expect(
      peekHoldsCollectionForDropPage(peekViewerAccountId(null), 'night-drive')
    ).toBe(true);
    expect(
      peekHoldsCollectionForDropPage(peekViewerAccountId(null), 'chapter-one')
    ).toBe(false);
    expect(peekOwnedTokenForCollection(null, 'night-drive')).toBe(null);
    expect(
      peekOwnedTokenForCollection(peekViewerAccountId(null), 'night-drive')
    ).toBe('night-drive:3');
    expect(peekDropFaceHoldSeed(null, 'night-drive')).toEqual({
      holds: null,
      tokenId: null,
    });
    expect(
      peekDropFaceHoldSeed(peekViewerAccountId(null), 'night-drive')
    ).toEqual({
      holds: true,
      tokenId: 'night-drive:3',
    });
    clearOwnedCollectionHold();
    rememberOwnedCollectionHold('alice.near', 'solo-pass', 'solo-pass:1');
    expect(peekDropFaceHoldSeed('alice.near', 'solo-pass')).toEqual({
      holds: true,
      tokenId: 'solo-pass:1',
    });
    rememberOwnedCollectionHold('alice.near', 'empty-pass', null);
    expect(peekDropFaceHoldSeed('alice.near', 'empty-pass')).toEqual({
      holds: false,
      tokenId: null,
    });
    window.localStorage.removeItem(APP_WALLET_ACCOUNT_KEY);
    expect(peekViewerAccountId(null)).toBe(null);
    vi.unstubAllGlobals();
    invalidateOwnedVaultCache('alice.near');
    clearOwnedCollectionHold();
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

  it('seeds a discover cover peek without a skeleton-only open', () => {
    const view = seedCollectionViewFromPeek({
      collectionId: 'just-sold',
      title: 'Just Sold',
      coverUrl: 'https://cdn.example/cover.jpg',
      appId: 'hub.near',
      creatorId: 'alice.near',
      kind: 'writing',
      description: 'A line from the list.',
    });
    expect(view?.collectionId).toBe('just-sold');
    expect(view?.title).toBe('Just Sold');
    expect(view?.mediaUrl).toBe('https://cdn.example/cover.jpg');
    expect(view?.appId).toBe('hub.near');
    expect(view?.creatorId).toBe('alice.near');
    expect(view?.kind).toBe('writing');
    expect(view?.description).toBe('A line from the list.');
    expect(view?.playables).toEqual([]);
    expect(collectionViewNeedsCatalogSoftFill(view)).toBe(true);
    expect(seedCollectionViewFromPeek({ collectionId: '  ' })).toBeNull();
  });

  it('soft-fills peek placeholders and skips solid SSR shells', () => {
    expect(collectionViewNeedsCatalogSoftFill(null)).toBe(true);
    const peek = seedCollectionViewFromPeek({
      collectionId: 'drop-1',
      title: 'Drop',
    });
    expect(collectionViewNeedsCatalogSoftFill(peek)).toBe(true);
    expect(
      collectionViewNeedsCatalogSoftFill({
        ...peek!,
        createdAtMs: 1_700_000_000_000,
        creatorId: 'alice.near',
        totalSupply: 5,
        minted: 1,
        remaining: 4,
      })
    ).toBe(false);
  });

  it('seeds store drops with deal status so commerce does not pop after open', () => {
    const view = seedCollectionViewFromStoreDrop(
      {
        collectionId: 'miauu',
        title: 'Miauu event',
        mediaUrl: 'https://cdn.example/t.jpg',
        priceNear: '0',
        remaining: 0,
        totalSupply: 10,
        status: 'sold_out',
        mediumKind: 'ticket',
      },
      'test05.onsocial.testnet'
    );
    expect(view?.creatorId).toBe('test05.onsocial.testnet');
    expect(view?.soldOut).toBe(true);
    expect(view?.totalSupply).toBe(10);
    expect(view?.minted).toBe(10);
    expect(view?.kind).toBe('ticket');
    expect(collectionViewNeedsCatalogSoftFill(view)).toBe(true);
  });

  it('seeds feed Drop CTA from the scarce embed already on the card', () => {
    const view = seedCollectionViewFromPostScarceEmbed(
      {
        collectionId: 'night-piece',
        mediaUrl: 'https://cdn.example/cover.jpg',
        mediumKind: 'writing',
        creatorId: 'alice.testnet',
        copies: 25,
        remaining: 10,
        priceNear: '1',
        status: 'drop',
      },
      { title: 'Night piece' }
    );
    expect(view?.title).toBe('Night piece');
    expect(view?.mediaUrl).toBe('https://cdn.example/cover.jpg');
    expect(view?.kind).toBe('writing');
    expect(view?.totalSupply).toBe(25);
    expect(view?.remaining).toBe(10);
    expect(view?.creatorId).toBe('alice.testnet');
  });

  it('never paints the collection id as the Drop title', () => {
    const peek = seedCollectionViewFromPeek({ collectionId: 'night-piece' });
    expect(peek?.title).toBe('');
    expect(collectionFaceTitle(peek?.title, 'night-piece')).toBe('');
    expect(collectionFaceTitle('night-piece', 'night-piece')).toBe('');
    expect(collectionFaceTitle('Night piece', 'night-piece')).toBe(
      'Night piece'
    );
    const feed = seedCollectionViewFromPostScarceEmbed({
      collectionId: 'night-piece',
      mediaUrl: 'https://cdn.example/cover.jpg',
      status: 'drop',
    });
    expect(feed?.title).toBe('');
  });

  it('keeps a seed title stable when catalog soft-fill lands', () => {
    const seed = seedCollectionViewFromPeek({
      collectionId: 'night-piece',
      title: 'Night piece',
      coverUrl: 'https://cdn.example/seed.jpg',
      kind: 'writing',
    });
    expect(seed).not.toBeNull();
    const catalog = {
      ...seed!,
      title: 'Night Piece',
      description: 'A long blurb',
      createdAtMs: 1_700_000_000_000,
      mediaUrl: 'https://cdn.example/catalog.jpg',
      totalSupply: 10,
      remaining: 4,
      minted: 6,
      kind: 'art',
    };
    const merged = mergeCatalogSoftFillIntoSeed(seed!, catalog);
    expect(merged.title).toBe('Night piece');
    expect(merged.kind).toBe('writing');
    expect(merged.description).toBe('A long blurb');
    expect(merged.createdAtMs).toBe(1_700_000_000_000);
    expect(merged.totalSupply).toBe(10);
    expect(merged.mediaUrl).toBe('https://cdn.example/catalog.jpg');
  });

  it('drops catalog id-as-title on soft-fill merge', () => {
    const seed = seedCollectionViewFromPeek({
      collectionId: 'night-piece',
      coverUrl: 'https://cdn.example/seed.jpg',
    });
    const catalog = {
      ...seed!,
      title: 'night-piece',
      createdAtMs: 1_700_000_000_000,
    };
    expect(mergeCatalogSoftFillIntoSeed(seed!, catalog).title).toBe('');
  });

  it('flags list→place soft-fill peeks for shimmer rails', () => {
    const peek = seedCollectionViewFromPeek({
      collectionId: 'night-piece',
      title: 'Night piece',
    });
    expect(collectionSoftFillPeek(peek)).toBe(true);
    expect(
      collectionSoftFillPeek({ ...peek!, createdAtMs: 1_700_000_000_000 })
    ).toBe(false);
  });

  it('holds the audio medium seat until soft-fill lands tracks', () => {
    expect(
      collectionMediumBodyPending({
        softFillPeek: true,
        isAudio: true,
        hasPlayables: false,
      })
    ).toBe(true);
    expect(
      collectionMediumBodyPending({
        softFillPeek: true,
        isAudio: true,
        hasPlayables: true,
      })
    ).toBe(false);
    expect(
      collectionMediumBodyPending({
        softFillPeek: false,
        isAudio: true,
        hasPlayables: false,
      })
    ).toBe(false);
    expect(
      collectionMediumBodyPending({
        softFillPeek: true,
        isAudio: false,
        hasPlayables: false,
      })
    ).toBe(false);
  });
});
