import type { PostRow } from '@onsocial/sdk';
import type { HomeFeedLens } from '@/features/home/home-feed-lens';
import type { HomeFeedSort } from '@/features/home/home-feed-sort';

/**
 * Same tab only — memory first, mirrored to sessionStorage so a hard
 * refresh paints the same list. The tab closing clears the copy.
 */
export const HOME_FEED_SESSION_TTL_MS = 30 * 60 * 1000;

const HOME_FEED_SESSION_STORAGE_KEY = 'onsocial.home-feed-session';
/** Bump when the snapshot shape changes — old copies are ignored. */
const HOME_FEED_SESSION_STORAGE_VERSION = 1;
/** Longform values are large; a deep back-catalogue can blow the 5MB quota. */
const HOME_FEED_SESSION_PERSISTED_POSTS = 60;

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
/** True once a storage read was attempted this page load. */
let storageRead = false;

function readStorage(): HomeFeedSessionSnapshot | null {
  storageRead = true;
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const raw = sessionStorage.getItem(HOME_FEED_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      v?: number;
      snapshot?: HomeFeedSessionSnapshot;
    };
    if (parsed.v !== HOME_FEED_SESSION_STORAGE_VERSION) return null;
    const stored = parsed.snapshot;
    if (
      !stored ||
      typeof stored.sessionKey !== 'string' ||
      !Array.isArray(stored.posts) ||
      stored.posts.length === 0 ||
      typeof stored.savedAt !== 'number'
    ) {
      return null;
    }
    return {
      ...stored,
      posts: [...stored.posts],
      standingNetworkIds: stored.standingNetworkIds
        ? [...stored.standingNetworkIds]
        : null,
    };
  } catch {
    return null;
  }
}

function writeStorage(next: HomeFeedSessionSnapshot): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    const persisted: HomeFeedSessionSnapshot = {
      ...next,
      posts: next.posts.slice(0, HOME_FEED_SESSION_PERSISTED_POSTS),
    };
    sessionStorage.setItem(
      HOME_FEED_SESSION_STORAGE_KEY,
      JSON.stringify({ v: HOME_FEED_SESSION_STORAGE_VERSION, snapshot: persisted })
    );
  } catch {
    // Quota or private-mode denial — the in-memory copy still works.
  }
}

function clearStorage(): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.removeItem(HOME_FEED_SESSION_STORAGE_KEY);
  } catch {
    // Ignore — clearing is best-effort.
  }
}

export function clearHomeFeedSession(): void {
  snapshot = null;
  storageRead = false;
  clearStorage();
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
  writeStorage(snapshot);
}

export function peekHomeFeedSession(
  now: number = Date.now(),
  options: { hydrateStorage?: boolean } = {}
): HomeFeedSessionSnapshot | null {
  // Render passes `hydrateStorage: false` — the server and the first client
  // render must agree, so storage only joins in an effect after hydration.
  const hydrate = options.hydrateStorage ?? true;
  if (!snapshot && hydrate && !storageRead) {
    snapshot = readStorage();
  }
  if (!snapshot) return null;
  if (now - snapshot.savedAt > HOME_FEED_SESSION_TTL_MS) {
    snapshot = null;
    clearStorage();
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
