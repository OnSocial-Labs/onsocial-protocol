import type { DiscoverFaceFilter } from '@onsocial/sdk';
import { discoverPeopleSearchQuery } from '@/features/discover/discover-omni-search';
import type { DiscoverTab } from '@/features/discover/discover-tabs';
import type { DiscoverProfileSummary } from '@/lib/discover-profiles';
import type { DiscoverTabScrollMap } from '@/lib/discover-tab-scroll';

/** In-tab memory only — hard refresh starts from SSR. */
export const DISCOVER_LIST_SESSION_TTL_MS = 30 * 60 * 1000;

export type DiscoverListSessionSnapshot = {
  sessionKey: string;
  tab: DiscoverTab;
  profiles: DiscoverProfileSummary[];
  hasMore: boolean;
  tabScroll: DiscoverTabScrollMap;
  savedAt: number;
};

export function discoverListSessionKey(input: {
  query: string;
  face: DiscoverFaceFilter;
  industry: string;
  craft: string;
}): string {
  const query = discoverPeopleSearchQuery(input.query);
  const industry = input.industry.trim() || '__any__';
  const craft = input.craft.trim() || '__any__';
  return `${query || '__all__'}|${input.face}|${industry}|${craft}`;
}

let snapshot: DiscoverListSessionSnapshot | null = null;

export function clearDiscoverListSession(): void {
  snapshot = null;
}

function copyTabScroll(tabScroll: DiscoverTabScrollMap): DiscoverTabScrollMap {
  return { ...tabScroll };
}

function hasRememberedScroll(tabScroll: DiscoverTabScrollMap): boolean {
  return Object.values(tabScroll).some(
    (value) => typeof value === 'number' && Number.isFinite(value) && value > 0
  );
}

export function writeDiscoverListSession(input: {
  sessionKey: string | null;
  tab: DiscoverTab;
  profiles: readonly DiscoverProfileSummary[];
  hasMore: boolean;
  tabScroll: DiscoverTabScrollMap;
  now?: number;
}): void {
  const sessionKey = input.sessionKey?.trim();
  if (!sessionKey) return;
  if (input.profiles.length === 0 && !hasRememberedScroll(input.tabScroll)) {
    return;
  }
  snapshot = {
    sessionKey,
    tab: input.tab,
    profiles: [...input.profiles],
    hasMore: input.hasMore,
    tabScroll: copyTabScroll(input.tabScroll),
    savedAt: input.now ?? Date.now(),
  };
}

export function peekDiscoverListSession(
  now: number = Date.now()
): DiscoverListSessionSnapshot | null {
  if (!snapshot) return null;
  if (now - snapshot.savedAt > DISCOVER_LIST_SESSION_TTL_MS) {
    snapshot = null;
    return null;
  }
  if (
    snapshot.profiles.length === 0 &&
    !hasRememberedScroll(snapshot.tabScroll)
  ) {
    return null;
  }
  return {
    ...snapshot,
    profiles: [...snapshot.profiles],
    tabScroll: copyTabScroll(snapshot.tabScroll),
  };
}

export function readDiscoverListSession(
  sessionKey: string,
  now: number = Date.now()
): DiscoverListSessionSnapshot | null {
  const peeked = peekDiscoverListSession(now);
  if (!peeked || peeked.sessionKey !== sessionKey) return null;
  return peeked;
}
