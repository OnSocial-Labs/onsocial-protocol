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
}: {
  shownCount: number;
  hasMore: boolean;
  query: string;
  face?: DiscoverFaceFilter;
  /** @deprecated Face chips own browse census; ignored. */
  discoverableTotal?: number | null;
  /** @deprecated Face chips own browse census; ignored. */
  indexedProfileTotal?: number | null;
}): string | null {
  if (shownCount <= 0) return null;

  const shown = formatDiscoverCount(shownCount);
  const trimmedQuery = query.trim();

  // Browse census lives on the face chips. Footer only narrates search hits.
  if (!trimmedQuery) return null;

  if (face === 'offers') {
    return hasMore
      ? `Showing ${shown} matching profiles`
      : `${shown} matching profile${shownCount === 1 ? '' : 's'}`;
  }
  if (face === 'hiring') {
    return hasMore
      ? `Showing ${shown} matching orgs`
      : `${shown} matching org${shownCount === 1 ? '' : 's'}`;
  }
  return hasMore
    ? `Showing ${shown} matching profiles`
    : `${shown} matching profile${shownCount === 1 ? '' : 's'}`;
}
