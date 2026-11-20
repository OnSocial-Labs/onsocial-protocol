import type { PostRow } from '@onsocial/sdk';
import type { HomeFeedLens } from '@/features/home/home-feed-lens';
import type { HomeFeedSort } from '@/features/home/home-feed-sort';
import type { PostEngagement } from '@/hooks/use-post-engagement';
import type { PollTally } from '@/lib/poll-votes';
import { postKey } from '@/lib/post-display';
import type { FeedQuoteSeed } from '@/lib/prepare-feed-paint';
import type { ProtocolDaoMemberships } from '@/lib/protocol-dao-memberships';

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
/**
 * Session restore only — hard refresh paints this many posts. Live load-more
 * keeps the full accumulated list (DOM windowing owns render). Jump-to-newest
 * may trim the far-below tail to `HOME_FEED_WORKING_SET_POSTS`.
 */
export const HOME_FEED_SESSION_PERSISTED_POSTS = 60;
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
  /** Descending Recent / Pulse card keyset — prefer over `nextOffset`. */
  nextBeforeBlockHeight?: number;
  nextBeforeHeat?: number;
  nextBeforeEventKey?: string;
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
   * Viewer amplify epoch at write time. A boost confirmed after the snapshot
   * was written makes Hot order stale — soft-refetch on restore; optional so
   * older copies stay readable.
   */
  amplifyEpoch?: number;
  /**
   * Measured feed block heights (px) keyed by block head post key. Lets a
   * restored session land the windowed feed on the same content instead of
   * estimate placeholders. Optional — older copies stay readable.
   */
  blockHeights?: Record<string, number>;
  /**
   * Quotes, counts, poll totals, and marks for `posts`. Present only after
   * a paint finished — a return then shows that page without a second read.
   * Older copies omit these and still restore the rows.
   */
  quoted?: FeedQuoteSeed;
  tallies?: Record<string, PollTally>;
  memberships?: Record<string, ProtocolDaoMemberships>;
  engagement?: Record<string, PostEngagement>;
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
 * leave the Pulse rows up and drop the amplified post. A boost after the
 * snapshot was written also forces a Hot soft-refetch (amplifyStale).
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
  amplifyStale?: boolean;
}): boolean {
  return (
    input.restoredKey != null &&
    input.restoredCount > 0 &&
    input.paintedCount > 0 &&
    input.restoredKey === input.sessionKey &&
    input.paintedKey === input.sessionKey &&
    input.reloadNonce === input.restoreReloadNonce &&
    !input.standStale &&
    !input.amplifyStale
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
    const posts = [...stored.posts];
    const pagination = clampHomeFeedSessionPagination({
      postCount: posts.length,
      nextOffset: stored.nextOffset,
      offsetShiftApplied: stored.offsetShiftApplied ?? 0,
    });
    return {
      ...stored,
      posts,
      nextOffset: pagination.nextOffset,
      offsetShiftApplied: pagination.offsetShiftApplied,
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

function sameRecordKeys(
  a: Record<string, unknown>,
  b: Record<string, unknown>
): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => Object.prototype.hasOwnProperty.call(b, key));
}

/** Keep quote seeds for live posts (+ one quote hop). Shared with live feed. */
export function quotedForPosts(
  posts: readonly PostRow[],
  quoted: FeedQuoteSeed
): FeedQuoteSeed {
  const keep = new Set<string>();
  for (const post of posts) {
    const path = post.refPath?.trim();
    if (path) keep.add(path);
  }
  for (const path of [...keep]) {
    const next = quoted[path]?.refPath?.trim();
    if (next) keep.add(next);
  }
  const out: FeedQuoteSeed = {};
  for (const path of keep) {
    if (Object.prototype.hasOwnProperty.call(quoted, path)) {
      out[path] = quoted[path] ?? null;
    }
  }
  // Avoid churning React state when load-more did not orphan any keys.
  if (sameRecordKeys(out, quoted)) return quoted;
  return out;
}

/** Keep record entries keyed to live posts. Shared with live feed. */
export function recordForPosts<T>(
  posts: readonly PostRow[],
  record: Record<string, T> | undefined,
  keyOf: (post: PostRow) => string
): Record<string, T> | undefined {
  if (!record) return undefined;
  const out: Record<string, T> = {};
  for (const post of posts) {
    const key = keyOf(post);
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      out[key] = record[key] as T;
    }
  }
  if (sameRecordKeys(out, record)) return record;
  return out;
}

function clearStorage(): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.removeItem(HOME_FEED_SESSION_STORAGE_KEY);
  } catch {
    // Ignore — clearing is best-effort.
  }
}

export type HomeFeedPaginationCursor = {
  nextOffset: number | undefined;
  nextBeforeBlockHeight?: number;
  nextBeforeHeat?: number;
  nextBeforeEventKey?: string;
  offsetShiftApplied: number;
};

/**
 * After a deep-scroll truncate, a stored cursor past the restored head would
 * skip the middle on load-more. Prefer a duplicate page (client dedupes) over
 * a gap. Do **not** clamp ordinary fill-walk offset cursors where
 * `nextOffset > postCount` with a short list — that is valid pagination.
 * Keyset cursors always snap to the retained edge height when truncated.
 */
export function clampHomeFeedSessionPagination(input: {
  postCount: number;
  nextOffset: number | undefined;
  nextBeforeBlockHeight?: number;
  nextBeforeHeat?: number;
  nextBeforeEventKey?: string;
  /** Oldest retained row — keyset edge after a head-keeping trim. */
  edgeBlockHeight?: number;
  offsetShiftApplied: number;
  /** Live list was longer than `postCount` (write path). */
  truncated?: boolean;
}): HomeFeedPaginationCursor {
  const truncatedSnapshot =
    input.truncated === true ||
    input.postCount >= HOME_FEED_SESSION_PERSISTED_POSTS;
  const hadMore =
    input.nextOffset !== undefined ||
    input.nextBeforeBlockHeight !== undefined;

  if (!hadMore) {
    return {
      nextOffset: undefined,
      nextBeforeBlockHeight: undefined,
      nextBeforeHeat: undefined,
      nextBeforeEventKey: undefined,
      offsetShiftApplied: input.offsetShiftApplied,
    };
  }

  let nextOffset = input.nextOffset;
  let offsetShiftApplied = input.offsetShiftApplied;
  let nextBeforeBlockHeight = input.nextBeforeBlockHeight;
  let nextBeforeHeat = input.nextBeforeHeat;
  let nextBeforeEventKey = input.nextBeforeEventKey;

  // Offset: only clamp when the cursor points past the restored head.
  if (
    truncatedSnapshot &&
    nextOffset !== undefined &&
    nextOffset > input.postCount
  ) {
    nextOffset = input.postCount;
    offsetShiftApplied = 0;
  }

  // Keyset: on an explicit trim/persist of a longer list, snap to the
  // retained edge so load-more does not skip the dropped middle.
  if (input.truncated === true && nextBeforeBlockHeight !== undefined) {
    const edge =
      typeof input.edgeBlockHeight === 'number' &&
      Number.isFinite(input.edgeBlockHeight) &&
      input.edgeBlockHeight > 0
        ? input.edgeBlockHeight
        : undefined;
    nextBeforeBlockHeight = edge;
    nextBeforeHeat = undefined;
    nextBeforeEventKey = undefined;
    if (nextOffset === undefined && edge !== undefined) {
      nextOffset = input.postCount;
    } else if (nextOffset !== undefined) {
      nextOffset = Math.min(nextOffset, input.postCount);
    }
    offsetShiftApplied = 0;
  }

  return {
    nextOffset,
    nextBeforeBlockHeight,
    nextBeforeHeat,
    nextBeforeEventKey,
    offsetShiftApplied,
  };
}

/** Live jump/trim — same edge clamp as session persist. */
export function clampHomeFeedCursorAfterTrim(input: {
  posts: readonly PostRow[];
  nextOffset: number | undefined;
  nextBeforeBlockHeight?: number;
  nextBeforeHeat?: number;
  nextBeforeEventKey?: string;
  offsetShiftApplied: number;
}): HomeFeedPaginationCursor {
  const edge = input.posts[input.posts.length - 1]?.blockHeight;
  return clampHomeFeedSessionPagination({
    postCount: input.posts.length,
    nextOffset: input.nextOffset,
    nextBeforeBlockHeight: input.nextBeforeBlockHeight,
    nextBeforeHeat: input.nextBeforeHeat,
    nextBeforeEventKey: input.nextBeforeEventKey,
    edgeBlockHeight: typeof edge === 'number' ? edge : undefined,
    offsetShiftApplied: input.offsetShiftApplied,
    truncated: true,
  });
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
  nextBeforeBlockHeight?: number;
  nextBeforeHeat?: number;
  nextBeforeEventKey?: string;
  standingNetworkIds: readonly string[] | null;
  offsetShiftApplied: number;
  scrollTop: number;
  standEpoch?: number;
  amplifyEpoch?: number;
  blockHeights?: Record<string, number>;
  quoted?: FeedQuoteSeed;
  tallies?: Record<string, PollTally>;
  memberships?: Record<string, ProtocolDaoMemberships>;
  engagement?: Record<string, PostEngagement>;
  now?: number;
  /** False keeps the in-memory copy only. Tab storage stays on leave and pagehide. */
  storage?: boolean;
}): void {
  const sessionKey = input.sessionKey?.trim();
  if (!sessionKey || input.posts.length === 0) return;
  const posts = input.posts.slice(0, HOME_FEED_SESSION_PERSISTED_POSTS);
  const edge = posts[posts.length - 1]?.blockHeight;
  const pagination = clampHomeFeedSessionPagination({
    postCount: posts.length,
    nextOffset: input.nextOffset,
    nextBeforeBlockHeight: input.nextBeforeBlockHeight,
    nextBeforeHeat: input.nextBeforeHeat,
    nextBeforeEventKey: input.nextBeforeEventKey,
    edgeBlockHeight: typeof edge === 'number' ? edge : undefined,
    offsetShiftApplied: input.offsetShiftApplied,
    truncated: input.posts.length > posts.length,
  });
  const previous = snapshot?.sessionKey === sessionKey ? snapshot : null;
  snapshot = {
    sessionKey,
    posts,
    nextOffset: pagination.nextOffset,
    nextBeforeBlockHeight: pagination.nextBeforeBlockHeight,
    nextBeforeHeat: pagination.nextBeforeHeat,
    nextBeforeEventKey: pagination.nextBeforeEventKey,
    standingNetworkIds: input.standingNetworkIds
      ? [...input.standingNetworkIds]
      : null,
    offsetShiftApplied: pagination.offsetShiftApplied,
    scrollTop: Math.max(0, input.scrollTop),
    savedAt: input.now ?? Date.now(),
    standEpoch: input.standEpoch,
    amplifyEpoch: input.amplifyEpoch,
    blockHeights: sanitizeBlockHeights(input.blockHeights),
    quoted:
      input.quoted !== undefined
        ? quotedForPosts(posts, input.quoted)
        : previous?.quoted,
    tallies:
      input.tallies !== undefined
        ? recordForPosts(posts, input.tallies, postKey)
        : previous?.tallies,
    memberships:
      input.memberships !== undefined
        ? recordForPosts(posts, input.memberships, (post) =>
            post.accountId.trim().toLowerCase()
          )
        : previous?.memberships,
    engagement:
      input.engagement !== undefined
        ? recordForPosts(posts, input.engagement, postKey)
        : previous?.engagement,
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
  const edge = snapshot.posts[snapshot.posts.length - 1]?.blockHeight;
  const pagination = clampHomeFeedSessionPagination({
    postCount: snapshot.posts.length,
    nextOffset: snapshot.nextOffset,
    nextBeforeBlockHeight: snapshot.nextBeforeBlockHeight,
    nextBeforeHeat: snapshot.nextBeforeHeat,
    nextBeforeEventKey: snapshot.nextBeforeEventKey,
    edgeBlockHeight: typeof edge === 'number' ? edge : undefined,
    offsetShiftApplied: snapshot.offsetShiftApplied,
  });
  if (
    pagination.nextOffset !== snapshot.nextOffset ||
    pagination.nextBeforeBlockHeight !== snapshot.nextBeforeBlockHeight ||
    pagination.nextBeforeHeat !== snapshot.nextBeforeHeat ||
    pagination.nextBeforeEventKey !== snapshot.nextBeforeEventKey ||
    pagination.offsetShiftApplied !== snapshot.offsetShiftApplied
  ) {
    snapshot = {
      ...snapshot,
      nextOffset: pagination.nextOffset,
      nextBeforeBlockHeight: pagination.nextBeforeBlockHeight,
      nextBeforeHeat: pagination.nextBeforeHeat,
      nextBeforeEventKey: pagination.nextBeforeEventKey,
      offsetShiftApplied: pagination.offsetShiftApplied,
    };
  }
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
