function formatDiscoverCount(count: number): string {
  const numericCount = Number(count);
  if (!Number.isFinite(numericCount)) return '0';

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits:
      Math.abs(numericCount) >= 1000 && Math.abs(numericCount) < 100000 ? 1 : 0,
    notation: Math.abs(numericCount) >= 1000 ? 'compact' : 'standard',
  }).format(numericCount);
}

export function formatDiscoverSubtitle(
  discoverableTotal: number | null | undefined
): string {
  if (typeof discoverableTotal === 'number' && discoverableTotal > 0) {
    return `Browse ${formatDiscoverCount(discoverableTotal)} identities on the graph.`;
  }

  return 'Browse identities on the OnSocial graph.';
}

export function buildDiscoverListSummary({
  shownCount,
  hasMore,
  query,
  discoverableTotal,
  indexedProfileTotal,
}: {
  shownCount: number;
  hasMore: boolean;
  query: string;
  discoverableTotal?: number | null;
  indexedProfileTotal?: number | null;
}): string | null {
  if (shownCount <= 0) return null;

  const shown = formatDiscoverCount(shownCount);
  const trimmedQuery = query.trim();

  if (trimmedQuery) {
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
