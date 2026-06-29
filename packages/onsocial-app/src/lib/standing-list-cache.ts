import type { StanceDetailKind, StandingAccountSummary } from '@/lib/profile-social-standings';

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
  return standingListCache.get(key);
}

export function writeStandingListCache(
  key: string,
  entry: StandingListCacheEntry
): void {
  standingListCache.set(key, entry);
}

export function clearStandingListCacheForTests(): void {
  standingListCache.clear();
}
