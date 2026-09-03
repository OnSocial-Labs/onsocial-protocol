import type { DiscoverFaceFilter } from '@onsocial/sdk';
import { formatDiscoverTabCount } from '@/lib/discover-tab-lead';

function formatDiscoverCount(count: number): string {
  return formatDiscoverTabCount(count);
}

export function formatDiscoverSubtitle(
  discoverableTotal: number | null | undefined
): string {
  if (typeof discoverableTotal === 'number' && discoverableTotal > 0) {
    return `${formatDiscoverCount(discoverableTotal)} profiles`;
  }

  return 'Profiles';
}

export function buildDiscoverListSummary({
  shownCount,
  hasMore,
  query,
  face = 'all',
  discoverableTotal,
  indexedProfileTotal,
}: {
  shownCount: number;
  hasMore: boolean;
  query: string;
  face?: DiscoverFaceFilter;
  discoverableTotal?: number | null;
  indexedProfileTotal?: number | null;
}): string | null {
  if (shownCount <= 0) return null;

  const shown = formatDiscoverCount(shownCount);
  const trimmedQuery = query.trim();

  if (trimmedQuery) {
    if (face === 'hiring') {
      return hasMore
        ? `Showing ${shown} matching orgs`
        : `${shown} matching org${shownCount === 1 ? '' : 's'}`;
    }
    return hasMore
      ? `Showing ${shown} matching profiles`
      : `${shown} matching profile${shownCount === 1 ? '' : 's'}`;
  }

  if (typeof discoverableTotal === 'number' && discoverableTotal > 0) {
    const ofDiscoverable = `Showing ${shown} of ${formatDiscoverCount(discoverableTotal)} discoverable`;
    if (
      typeof indexedProfileTotal === 'number' &&
      indexedProfileTotal > discoverableTotal
    ) {
      return `${ofDiscoverable} · ${formatDiscoverCount(indexedProfileTotal)} indexed`;
    }
    return ofDiscoverable;
  }

  return hasMore ? `Showing ${shown} profiles` : `${shown} profiles`;
}
