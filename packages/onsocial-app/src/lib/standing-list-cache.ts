import { readBoundedMap, writeBoundedMap } from '@/lib/bounded-map';
import type {
  StanceDetailKind,
  StandingAccountSummary,
} from '@/lib/profile-social-standings';

/**
 * Profile × kind (3) × settled search. Load-more rewrites the same key.
 * A heavy session is about 16 profiles with all three kinds, or ~30 opens
 * on the default kind plus a few searches. Each entry is the merged list,
 * so this is the recent back-stack.
 */
export const STANDING_LIST_CACHE_MAX = 48;

export interface StandingListCacheEntry {
  viewerAccountId: string | null;
  accounts: StandingAccountSummary[];
  listTotal: number;
  hasMore: boolean;
  counts?: { incoming: number; outgoing: number; mutual: number };
}

const standingListCache = new Map<string, StandingListCacheEntry>();

export function standingListCacheKey(
  accountId: string,
  kind: StanceDetailKind,
  searchQuery: string,
  viewerAccountId: string | null
): string {
  const viewerKey = viewerAccountId ?? '__anon__';
  return `${accountId}:${kind}:${searchQuery || '__all__'}:${viewerKey}`;
}

export function readStandingListCache(
  key: string
): StandingListCacheEntry | undefined {
  return readBoundedMap(standingListCache, key);
}

export function writeStandingListCache(
  key: string,
  entry: StandingListCacheEntry
): void {
  writeBoundedMap(standingListCache, key, entry, STANDING_LIST_CACHE_MAX);
}

export function clearStandingListCacheForTests(): void {
  standingListCache.clear();
}
