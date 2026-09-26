import {
  deriveCollectionStatus,
  type CollectionStatus,
  type CollectionView,
} from '@/features/scarces/collections-data';

/** Catalog sections on the series page — live first, then upcoming, then past. */
export type SeriesDropBucket = 'live' | 'upcoming' | 'past';

export interface SeriesDropGroup {
  bucket: SeriesDropBucket;
  label: string;
  drops: CollectionView[];
}

const BUCKET_ORDER: SeriesDropBucket[] = ['live', 'upcoming', 'past'];

const BUCKET_LABEL: Record<SeriesDropBucket, string> = {
  live: 'Live',
  upcoming: 'Upcoming',
  past: 'Past',
};

/** Map a drop status into a series catalog bucket. */
export function seriesDropBucket(status: CollectionStatus): SeriesDropBucket {
  if (status === 'live') return 'live';
  if (status === 'upcoming') return 'upcoming';
  return 'past';
}

function compareLive(a: CollectionView, b: CollectionView): number {
  // Ending soon first, then newest created.
  const aEnd = a.endTimeMs ?? Number.POSITIVE_INFINITY;
  const bEnd = b.endTimeMs ?? Number.POSITIVE_INFINITY;
  if (aEnd !== bEnd) return aEnd - bEnd;
  return (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0);
}

function compareUpcoming(a: CollectionView, b: CollectionView): number {
  // Opens soonest first.
  const aStart = a.startTimeMs ?? Number.POSITIVE_INFINITY;
  const bStart = b.startTimeMs ?? Number.POSITIVE_INFINITY;
  if (aStart !== bStart) return aStart - bStart;
  return (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0);
}

function comparePast(a: CollectionView, b: CollectionView): number {
  // Most recently closed / created first.
  const aEnd = a.endTimeMs ?? a.createdAtMs ?? 0;
  const bEnd = b.endTimeMs ?? b.createdAtMs ?? 0;
  if (aEnd !== bEnd) return bEnd - aEnd;
  return (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0);
}

function sortBucket(
  bucket: SeriesDropBucket,
  drops: CollectionView[]
): CollectionView[] {
  const next = [...drops];
  if (bucket === 'live') next.sort(compareLive);
  else if (bucket === 'upcoming') next.sort(compareUpcoming);
  else next.sort(comparePast);
  return next;
}

/**
 * Group series drops for the catalog.
 * Empty buckets are omitted. Callers hide section labels when only one group.
 * Within a bucket: live (ending soon), upcoming (opens soon), past (newest).
 */
export function groupSeriesDrops(
  drops: CollectionView[],
  nowMs: number = Date.now()
): SeriesDropGroup[] {
  const buckets: Record<SeriesDropBucket, CollectionView[]> = {
    live: [],
    upcoming: [],
    past: [],
  };
  for (const drop of drops) {
    buckets[seriesDropBucket(deriveCollectionStatus(drop, nowMs))].push(drop);
  }
  return BUCKET_ORDER.filter((bucket) => buckets[bucket].length > 0).map(
    (bucket) => ({
      bucket,
      label: BUCKET_LABEL[bucket],
      drops: sortBucket(bucket, buckets[bucket]),
    })
  );
}

/** One scroll tick. A full page with no match keeps `hasMore` for the next tick. */
const SERIES_WALK_ROUNDS = 4;

/**
 * Read a few creator pages together until this series has a match, or the
 * tick ends. `nextOffset` stays on the first matching page so later drops
 * in the burst are not skipped.
 */
export async function walkCreatorSeriesMatches(opts: {
  seriesId: string;
  startOffset: number;
  pageSize: number;
  maxRounds?: number;
  fetchPage: (
    offset: number
  ) => Promise<{ views: CollectionView[]; fetched: number }>;
}): Promise<{
  matches: CollectionView[];
  nextOffset: number;
  hasMore: boolean;
}> {
  const maxRounds = opts.maxRounds ?? SERIES_WALK_ROUNDS;
  const width = opts.pageSize;
  const offsets: number[] = [];
  for (let i = 0; i < maxRounds; i += 1) {
    offsets.push(opts.startOffset + i * width);
  }
  const pages = await Promise.all(
    offsets.map((offset) => opts.fetchPage(offset))
  );
  const matches: CollectionView[] = [];
  let offset = opts.startOffset;
  let hasMore = true;
  for (let i = 0; i < pages.length; i += 1) {
    const page = pages[i]!;
    const pageOffset = offsets[i]!;
    matches.push(
      ...page.views.filter((view) => view.seriesId === opts.seriesId)
    );
    offset = pageOffset + page.fetched;
    hasMore = page.fetched >= width && page.fetched > 0;
    if (page.fetched === 0 || !hasMore || matches.length > 0) break;
  }
  return { matches, nextOffset: offset, hasMore };
}
