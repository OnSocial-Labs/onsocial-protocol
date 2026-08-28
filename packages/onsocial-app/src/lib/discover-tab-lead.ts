/** Compact counts for Discover tab lead lines. */
export function formatDiscoverTabCount(count: number): string {
  const numericCount = Number(count);
  if (!Number.isFinite(numericCount)) return '0';

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits:
      Math.abs(numericCount) >= 1000 && Math.abs(numericCount) < 100000 ? 1 : 0,
    notation: Math.abs(numericCount) >= 1000 ? 'compact' : 'standard',
  }).format(numericCount);
}

export function discoverSearchLead(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) return '';
  return `Searching “${trimmed}”`;
}

export function discoverProfilesLead(
  discoverableTotal: number | null | undefined,
  query: string
): string {
  const search = discoverSearchLead(query);
  if (search) return search;
  if (typeof discoverableTotal === 'number' && discoverableTotal > 0) {
    return `${formatDiscoverTabCount(discoverableTotal)} profiles`;
  }
  return 'Profiles';
}

export function discoverDaosLead(
  total: number,
  query: string,
  syncing: boolean
): string {
  const search = discoverSearchLead(query);
  if (search) return search;
  if (syncing && total === 0) return 'Finding NEAR DAOs…';
  if (total > 0) return `${total.toLocaleString()} NEAR DAOs`;
  return 'NEAR DAOs';
}

export function discoverGuildsLead(
  query: string,
  topicLabel: string | null
): string {
  const search = discoverSearchLead(query);
  if (search) return search;
  if (topicLabel) return `Guilds · ${topicLabel}`;
  return 'Public guilds';
}

export function discoverHubsLead(
  query: string,
  categoryLabel: string | null
): string {
  const search = discoverSearchLead(query);
  if (search) return search;
  if (categoryLabel) return `Hubs · ${categoryLabel}`;
  return 'Creator hubs';
}

export function discoverTopicsLead(filterPrefix: string): string {
  const prefix = filterPrefix.trim();
  if (prefix) return `Topics · #${prefix}`;
  return 'Trending topics';
}

export function discoverTickersLead(filterPrefix: string): string {
  const prefix = filterPrefix.trim();
  if (prefix) return `Tickers · $${prefix.toUpperCase()}`;
  return 'Trending tickers';
}

export function discoverTrendingLead(): string {
  return "What's moving";
}
