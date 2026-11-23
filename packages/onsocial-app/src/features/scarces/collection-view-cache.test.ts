import { describe, expect, it, beforeEach } from 'vitest';
import {
  clearCollectionViewCache,
  hasCollectionView,
  readCollectionView,
  rememberCollectionView,
} from '@/features/scarces/collection-view-cache';
import { seedCollectionViewFromPeek } from '@/features/scarces/collection-page-view';
import { resolveDropOpenSeed } from '@/features/scarces/drop-place-open';
import { seedCollectionViewFromPostScarceEmbed } from '@/features/scarces/collection-page-view';

describe('collection view cache', () => {
  beforeEach(() => {
    clearCollectionViewCache();
  });

  it('reads a remembered view without requiring a peek touch', () => {
    const view = seedCollectionViewFromPeek({
      collectionId: 'night-piece',
      title: 'Night piece',
      coverUrl: 'https://cdn.example/c.jpg',
      creatorId: 'alice.testnet',
      kind: 'writing',
    });
    expect(view).not.toBeNull();
    rememberCollectionView({
      ...view!,
      createdAtMs: 1_700_000_000_000,
      description: 'A blurb',
      totalSupply: 10,
      remaining: 3,
      minted: 7,
    });
    expect(hasCollectionView('night-piece')).toBe(true);
    const read = readCollectionView('night-piece');
    expect(read?.title).toBe('Night piece');
    expect(read?.createdAtMs).toBe(1_700_000_000_000);
    expect(read?.description).toBe('A blurb');
  });

  it('open resolve prefers remembered full view over thin feed seed', () => {
    const view = seedCollectionViewFromPeek({
      collectionId: 'night-piece',
      title: 'Night piece',
      coverUrl: 'https://cdn.example/c.jpg',
      kind: 'writing',
    });
    rememberCollectionView({
      ...view!,
      createdAtMs: 1_700_000_000_000,
      description: 'From catalog',
    });
    const thin = seedCollectionViewFromPostScarceEmbed(
      {
        collectionId: 'night-piece',
        mediaUrl: 'https://cdn.example/embed.jpg',
        status: 'drop',
        copies: 5,
        remaining: 2,
      },
      { title: 'Night piece' }
    );
    expect(thin?.createdAtMs).toBe(0);
    const opened = resolveDropOpenSeed({
      collectionId: 'night-piece',
      initial: thin,
    });
    expect(opened?.createdAtMs).toBe(1_700_000_000_000);
    expect(opened?.description).toBe('From catalog');
    expect(opened?.title).toBe('Night piece');
  });
});
