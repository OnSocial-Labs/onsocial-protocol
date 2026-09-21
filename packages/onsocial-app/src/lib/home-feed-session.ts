import type { PostRow } from '@onsocial/sdk';
import type { HomeFeedLens } from '@/features/home/home-feed-lens';
import type { HomeFeedSort } from '@/features/home/home-feed-sort';

/** In-tab memory only — hard refresh starts from SSR. */
export const HOME_FEED_SESSION_TTL_MS = 30 * 60 * 1000;

/** Immediate probe after restore; first visit still waits to avoid a double fetch. */
export const HOME_FEED_SESSION_PROBE_DELAY_MS = 0;
export const HOME_FEED_COLD_PROBE_DELAY_MS = 12_000;

export type HomeFeedSessionSnapshot = {
  sessionKey: string;
  posts: PostRow[];
  nextOffset: number | undefined;
  standingNetworkIds: readonly string[] | null;
  offsetShiftApplied: number;
  scrollTop: number;
  savedAt: number;
};

export function homeFeedSessionKey(input: {
  lens: HomeFeedLens;
  sort: HomeFeedSort;
  focusKey: string | null;
  accountId: string | null;
}): string {
  const accountScoped =
    input.lens === 'saved' || input.lens === 'pulse' || input.lens === 'circle';
  return `${input.lens}|${input.sort}|${input.focusKey ?? ''}|${
    accountScoped ? (input.accountId ?? '') : ''
  }`;
}

export const HOME_FEED_SSR_SESSION_KEY = homeFeedSessionKey({
  lens: 'global',
  sort: 'hot',
  focusKey: null,
  accountId: null,
});

let snapshot: HomeFeedSessionSnapshot | null = null;

export function clearHomeFeedSession(): void {
  snapshot = null;
}

export function writeHomeFeedSession(input: {
  sessionKey: string | null;
  posts: readonly PostRow[];
  nextOffset: number | undefined;
  standingNetworkIds: readonly string[] | null;
  offsetShiftApplied: number;
  scrollTop: number;
  now?: number;
}): void {
  const sessionKey = input.sessionKey?.trim();
  if (!sessionKey || input.posts.length === 0) return;
  snapshot = {
    sessionKey,
    posts: [...input.posts],
    nextOffset: input.nextOffset,
    standingNetworkIds: input.standingNetworkIds
      ? [...input.standingNetworkIds]
      : null,
    offsetShiftApplied: input.offsetShiftApplied,
    scrollTop: Math.max(0, input.scrollTop),
    savedAt: input.now ?? Date.now(),
  };
}

export function peekHomeFeedSession(
  now: number = Date.now()
): HomeFeedSessionSnapshot | null {
  if (!snapshot) return null;
  if (now - snapshot.savedAt > HOME_FEED_SESSION_TTL_MS) {
    snapshot = null;
    return null;
  }
  if (snapshot.posts.length === 0) return null;
  return {
    ...snapshot,
    posts: [...snapshot.posts],
    standingNetworkIds: snapshot.standingNetworkIds
      ? [...snapshot.standingNetworkIds]
      : null,
  };
}

export function readHomeFeedSession(
  sessionKey: string,
  now: number = Date.now()
): HomeFeedSessionSnapshot | null {
  const peeked = peekHomeFeedSession(now);
  if (!peeked || peeked.sessionKey !== sessionKey) return null;
  return peeked;
}

export function homeFeedSessionProbeDelayMs(restored: boolean): number {
  return restored
    ? HOME_FEED_SESSION_PROBE_DELAY_MS
    : HOME_FEED_COLD_PROBE_DELAY_MS;
}
