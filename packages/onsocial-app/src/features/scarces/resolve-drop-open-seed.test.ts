import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearCollectionViewCache,
  rememberCollectionView,
} from '@/features/scarces/collection-view-cache';
import { seedCollectionViewFromPeek } from '@/features/scarces/collection-page-view';
import { resolveDropOpenSeed } from '@/features/scarces/drop-place-open';
import type { CollectionView } from '@/features/scarces/collections-data';

function solidView(id: string, title: string): CollectionView {
  const peek = seedCollectionViewFromPeek({
    collectionId: id,
    title,
    coverUrl: 'ipfs://cover',
    creatorId: 'maker.near',
  })!;
  return { ...peek, createdAtMs: 1_700_000_000_000 };
}

describe('resolveDropOpenSeed', () => {
  beforeEach(() => {
    clearCollectionViewCache();
  });

  it('prefers a solid list seed over peek and thin', () => {
    const solid = solidView('drop-a', 'Solid');
    rememberCollectionView(solidView('drop-a', 'Cached'));
    const thin = seedCollectionViewFromPeek({
      collectionId: 'drop-a',
      title: 'Thin',
    });
    expect(
      resolveDropOpenSeed({ collectionId: 'drop-a', initial: solid })?.title
    ).toBe('Solid');
    expect(
      resolveDropOpenSeed({ collectionId: 'drop-a', initial: thin })?.title
    ).toBe('Cached');
  });

  it('falls back to thin seed when cache is cold', () => {
    const thin = seedCollectionViewFromPeek({
      collectionId: 'drop-b',
      title: 'Jacket',
      coverUrl: 'ipfs://j',
    });
    expect(
      resolveDropOpenSeed({ collectionId: 'drop-b', initial: thin })?.title
    ).toBe('Jacket');
  });
});
