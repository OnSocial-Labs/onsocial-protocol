import type { DiscoverProfileSummary } from '@/lib/discover-profiles';

export interface DiscoverListCacheEntry {
  viewerAccountId: string | null;
  profiles: DiscoverProfileSummary[];
  hasMore: boolean;
}

const discoverListCache = new Map<string, DiscoverListCacheEntry>();

export function discoverListCacheKey(
  searchQuery: string,
  viewerAccountId: string | null
): string {
  const viewerKey = viewerAccountId ?? '__anon__';
  return `discover:${searchQuery || '__all__'}:${viewerKey}`;
}

export function readDiscoverListCache(
  key: string
): DiscoverListCacheEntry | undefined {
  return discoverListCache.get(key);
}

export function writeDiscoverListCache(
  key: string,
  entry: DiscoverListCacheEntry
): void {
  discoverListCache.set(key, entry);
}

export function clearDiscoverListCacheForTests(): void {
  discoverListCache.clear();
}
