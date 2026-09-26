import { describe, expect, it } from 'vitest';
import type { CollectionView } from '@/features/scarces/collections-data';
import {
  groupSeriesDrops,
  seriesDropBucket,
  walkCreatorSeriesMatches,
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
    eventStartsAtMs: null,
    eventEndsAtMs: null,
    eventEndsAtPreviousMs: null,
    place: null,
    accessEndsAtMs: null,
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

  it('sorts live by ending soon and upcoming by opens soon', () => {
    const now = Date.UTC(2026, 7, 15, 12, 0, 0);
    const groups = groupSeriesDrops(
      [
        drop({
          collectionId: 'live-later',
          startTimeMs: now - 60_000,
          endTimeMs: now + 120_000,
          createdAtMs: 2,
        }),
        drop({
          collectionId: 'live-soon',
          startTimeMs: now - 60_000,
          endTimeMs: now + 30_000,
          createdAtMs: 1,
        }),
        drop({
          collectionId: 'upcoming-later',
          startTimeMs: now + 120_000,
        }),
        drop({
          collectionId: 'upcoming-soon',
          startTimeMs: now + 30_000,
        }),
      ],
      now
    );
    expect(groups[0]!.drops.map((d) => d.collectionId)).toEqual([
      'live-soon',
      'live-later',
    ]);
    expect(groups[1]!.drops.map((d) => d.collectionId)).toEqual([
      'upcoming-soon',
      'upcoming-later',
    ]);
  });
});

describe('walkCreatorSeriesMatches', () => {
  it('stops on the first matching page and leaves the rest unread', async () => {
    const seen: number[] = [];
    const result = await walkCreatorSeriesMatches({
      seriesId: 'ink',
      startOffset: 0,
      pageSize: 2,
      maxRounds: 3,
      fetchPage: async (offset) => {
        seen.push(offset);
        await Promise.resolve();
        return {
          views: [
            drop({
              collectionId: `a${offset}`,
              seriesId: offset === 2 ? 'ink' : 'other',
            }),
          ],
          fetched: 2,
        };
      },
    });
    expect(seen).toEqual([0, 2, 4]);
    expect(result.matches.map((row) => row.collectionId)).toEqual(['a2']);
    expect(result.nextOffset).toBe(4);
    expect(result.hasMore).toBe(true);
  });

  it('keeps a full tick open when none of the pages match', async () => {
    const result = await walkCreatorSeriesMatches({
      seriesId: 'ink',
      startOffset: 6,
      pageSize: 2,
      maxRounds: 2,
      fetchPage: async () => ({
        views: [drop({ collectionId: 'other', seriesId: 'other' })],
        fetched: 2,
      }),
    });
    expect(result.matches).toEqual([]);
    expect(result.nextOffset).toBe(10);
    expect(result.hasMore).toBe(true);
  });

  it('ends the catalog on a short page', async () => {
    const result = await walkCreatorSeriesMatches({
      seriesId: 'ink',
      startOffset: 0,
      pageSize: 4,
      fetchPage: async () => ({
        views: [drop({ collectionId: 'other', seriesId: 'other' })],
        fetched: 1,
      }),
    });
    expect(result.hasMore).toBe(false);
    expect(result.nextOffset).toBe(1);
  });
});
