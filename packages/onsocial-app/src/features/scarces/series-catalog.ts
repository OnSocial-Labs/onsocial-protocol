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

/**
 * Group series drops for the catalog.
 * Empty buckets are omitted. Callers hide section labels when only one group.
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
      drops: buckets[bucket],
    })
  );
}
