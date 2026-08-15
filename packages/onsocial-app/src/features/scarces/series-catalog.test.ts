import { describe, expect, it } from 'vitest';
import type { CollectionView } from '@/features/scarces/collections-data';
import {
  groupSeriesDrops,
  seriesDropBucket,
} from '@/features/scarces/series-catalog';

function drop(
  partial: Partial<CollectionView> & Pick<CollectionView, 'collectionId'>
): CollectionView {
  const { collectionId, ...rest } = partial;
  return {
    collectionId,
    creatorId: 'creator.near',
    title: collectionId,
    mediaUrl: null,
    priceNear: null,
    priceYocto: '0',
    totalSupply: 10,
    minted: 0,
    remaining: 10,
    startTimeMs: null,
    endTimeMs: null,
    createdAtMs: 1,
    maxPerWallet: null,
    mintMode: 'open',
    paused: false,
    cancelled: false,
    soldOut: false,
    hasAllowlist: false,
    appId: null,
    appCommissionBps: null,
    kind: null,
    audioFormat: null,
    facets: [],
    playables: [],
    readables: [],
    bookPdf: null,
    writingFormat: null,
    writingManifestCid: null,
    transferable: true,
    renewable: false,
    maxRedeems: null,
    isVariations: false,
    randomAssignment: false,
    seriesId: 'ink',
    seriesTitle: 'Ink',
    royalty: null,
    ...rest,
  };
}

describe('series-catalog', () => {
  it('maps statuses into live / upcoming / past buckets', () => {
    expect(seriesDropBucket('live')).toBe('live');
    expect(seriesDropBucket('upcoming')).toBe('upcoming');
    expect(seriesDropBucket('ended')).toBe('past');
    expect(seriesDropBucket('sold_out')).toBe('past');
    expect(seriesDropBucket('paused')).toBe('past');
    expect(seriesDropBucket('cancelled')).toBe('past');
  });

  it('groups drops live → upcoming → past and omits empty buckets', () => {
    const now = Date.UTC(2026, 7, 15, 12, 0, 0);
    const groups = groupSeriesDrops(
      [
        drop({
          collectionId: 'ended-drop',
          endTimeMs: now - 60_000,
        }),
        drop({
          collectionId: 'live-drop',
          startTimeMs: now - 60_000,
        }),
        drop({
          collectionId: 'soon-drop',
          startTimeMs: now + 60_000,
        }),
      ],
      now
    );
    expect(groups.map((group) => group.bucket)).toEqual([
      'live',
      'upcoming',
      'past',
    ]);
    expect(groups[0]!.drops.map((d) => d.collectionId)).toEqual(['live-drop']);
    expect(groups[1]!.drops.map((d) => d.collectionId)).toEqual(['soon-drop']);
    expect(groups[2]!.drops.map((d) => d.collectionId)).toEqual(['ended-drop']);
  });

  it('returns a single group when all drops share a bucket', () => {
    const now = Date.UTC(2026, 7, 15, 12, 0, 0);
    const groups = groupSeriesDrops(
      [
        drop({ collectionId: 'a', startTimeMs: now - 1 }),
        drop({ collectionId: 'b', startTimeMs: now - 1 }),
      ],
      now
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.bucket).toBe('live');
    expect(groups[0]!.drops).toHaveLength(2);
  });
});
