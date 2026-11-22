import type { DiscoverFaceFilter } from '@onsocial/sdk';
import { readBoundedMap, writeBoundedMap } from '@/lib/bounded-map';
import type { DiscoverProfileSummary } from '@/lib/discover-profiles';

/**
 * Query × 6 faces × industry × craft. A heavy session is one pass over the
 * face rail, a handful of industries on the faces that show them, a few
 * crafts, and some searches — not the 37×12 catalog. Each entry is a page
 * of profiles.
 */
export const DISCOVER_LIST_CACHE_MAX = 36;

export interface DiscoverListCacheEntry {
  viewerAccountId: string | null;
  profiles: DiscoverProfileSummary[];
  hasMore: boolean;
}

const discoverListCache = new Map<string, DiscoverListCacheEntry>();

export function discoverListCacheKey(
  searchQuery: string,
  viewerAccountId: string | null,
  face: DiscoverFaceFilter = 'all',
  industry = '',
  craft = ''
): string {
  const viewerKey = viewerAccountId ?? '__anon__';
  const industryKey = industry.trim() || '__any__';
  const craftKey = craft.trim() || '__any__';
  return `discover:${searchQuery || '__all__'}:${viewerKey}:${face}:${industryKey}:${craftKey}`;
}

export function readDiscoverListCache(
  key: string
): DiscoverListCacheEntry | undefined {
  return readBoundedMap(discoverListCache, key);
}

export function writeDiscoverListCache(
  key: string,
  entry: DiscoverListCacheEntry
): void {
  writeBoundedMap(discoverListCache, key, entry, DISCOVER_LIST_CACHE_MAX);
}

export function clearDiscoverListCacheForTests(): void {
  discoverListCache.clear();
}
