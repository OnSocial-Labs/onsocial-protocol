import type { PostRow } from '@onsocial/sdk';
import type { HomeFeedLens } from '@/features/home/home-feed-lens';
import type { HomeFeedSort } from '@/features/home/home-feed-sort';

/**
 * Same tab only — memory first, mirrored to sessionStorage so a hard
 * refresh paints the same list. The tab closing clears the copy.
 */
export const HOME_FEED_SESSION_TTL_MS = 30 * 60 * 1000;

const HOME_FEED_SESSION_STORAGE_KEY = 'onsocial.home-feed-session';
/** Presence only. The server uses it to skip a fetch the client will discard. */
export const HOME_FEED_SESSION_HINT_COOKIE = 'os-home-feed';
const HOME_FEED_SESSION_HINT_REFRESH_MS = 30_000;
/** Bump when the snapshot shape changes — old copies are ignored. */
const HOME_FEED_SESSION_STORAGE_VERSION = 1;
/** Longform values are large; a deep back-catalogue can blow the 5MB quota. */
const HOME_FEED_SESSION_PERSISTED_POSTS = 60;
/** Same defensive cap as the window cache — heights are tiny but bounded. */
const HOME_FEED_SESSION_PERSISTED_HEIGHTS = 400;

function sanitizeBlockHeights(
  input: Record<string, number> | undefined
): Record<string, number> | undefined {
  if (!input) return undefined;
  const entries = Object.entries(input).filter(
    ([, value]) =>
      typeof value === 'number' && Number.isFinite(value) && value > 0
  );
  if (entries.length === 0) return undefined;
  const kept =
    entries.length > HOME_FEED_SESSION_PERSISTED_HEIGHTS
      ? entries.slice(entries.length - HOME_FEED_SESSION_PERSISTED_HEIGHTS)
      : entries;
  return Object.fromEntries(kept);
}

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
  /**
   * Viewer stand epoch at write time. A stand confirmed after the snapshot
   * was written makes its standing sources stale — optional so older copies
   * stay readable.
   */
  standEpoch?: number;
  /**
   * Measured feed block heights (px) keyed by block head post key. Lets a
   * restored session land the windowed feed on the same content instead of
   * estimate placeholders. Optional — older copies stay readable.
   */
  blockHeights?: Record<string, number>;
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

/**
 * A saved list may skip a fetch only while those rows are the ones on screen.
 * Pulse, then Global, must load Global Hot again — the saved key alone would
 * leave the Pulse rows up and drop the amplified post.
 */
export function shouldKeepRestoredHomeFeed(input: {
  restoredKey: string | null;
  sessionKey: string;
  paintedKey: string | null;
  restoredCount: number;
  paintedCount: number;
  reloadNonce: number;
  restoreReloadNonce: number;
  standStale: boolean;
}): boolean {
  return (
    input.restoredKey != null &&
    input.restoredCount > 0 &&
    input.paintedCount > 0 &&
    input.restoredKey === input.sessionKey &&
    input.paintedKey === input.sessionKey &&
    input.reloadNonce === input.restoreReloadNonce &&
    !input.standStale
  );
}

let snapshot: HomeFeedSessionSnapshot | null = null;
/** True once a storage read was attempted this page load. */
let storageRead = false;
let hintSetAt = 0;

export function homeFeedSessionHintPresent(
  value: string | null | undefined
): boolean {
  return value === '1';
}

function touchHomeFeedSessionHint(force: boolean): void {
  if (typeof document === 'undefined') return;
  const now = Date.now();
  if (!force && now - hintSetAt < HOME_FEED_SESSION_HINT_REFRESH_MS) return;
  hintSetAt = now;
  const maxAge = Math.floor(HOME_FEED_SESSION_TTL_MS / 1000);
  document.cookie = `${HOME_FEED_SESSION_HINT_COOKIE}=1; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

function clearHomeFeedSessionHint(): void {
  hintSetAt = 0;
  if (typeof document === 'undefined') return;
  document.cookie = `${HOME_FEED_SESSION_HINT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

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
      JSON.stringify({
        v: HOME_FEED_SESSION_STORAGE_VERSION,
        snapshot: persisted,
      })
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
  clearHomeFeedSessionHint();
}

export function writeHomeFeedSession(input: {
  sessionKey: string | null;
  posts: readonly PostRow[];
  nextOffset: number | undefined;
  standingNetworkIds: readonly string[] | null;
  offsetShiftApplied: number;
  scrollTop: number;
  standEpoch?: number;
  blockHeights?: Record<string, number>;
  now?: number;
  /** False keeps the in-memory copy only. Tab storage stays on leave and pagehide. */
  storage?: boolean;
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
    standEpoch: input.standEpoch,
    blockHeights: sanitizeBlockHeights(input.blockHeights),
  };
  if (input.storage !== false) writeStorage(snapshot);
  touchHomeFeedSessionHint(input.storage !== false);
}

/** Scroll moved without a React render. Leave can remount from this line. */
export function noteHomeFeedSessionScroll(scrollTop: number): void {
  if (!snapshot) return;
  snapshot.scrollTop = Math.max(0, scrollTop);
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
    clearHomeFeedSessionHint();
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
