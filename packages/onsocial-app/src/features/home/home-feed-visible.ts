import type { Paginated, PostRow } from '@onsocial/sdk';
import type { HomeFeedLens } from '@/features/home/home-feed-lens';
import type { HomeFeedPageCursor } from '@/features/home/home-feed-pulse';
import { coalesceFeedThreads } from '@/lib/feed-threads';
import { postKey } from '@/lib/post-display';

/** Pages of raw rows to scan while looking for a card the feed will paint. */
export const HOME_FEED_VISIBLE_PAGE_WALK = 8;

/**
 * Bookmarks and topic slices paint the saved or matching post, including a
 * reply. Pulse, Circle, and Global keep foreign replies on the thread page.
 */
export function homeFeedIncludeForeignReplies(
  lens: HomeFeedLens,
  hasFocus: boolean
): boolean {
  return hasFocus || lens === 'saved';
}

/**
 * Hot/Recent and the catch-up chip follow the feed on screen.
 * Saved bookmarks are "recently saved" and do not use timeline chrome.
 * A topic chip opened from Saved is a public slice, so the chrome stays.
 */
export function homeFeedShowsTimelineChrome(
  lens: HomeFeedLens,
  hasFocus: boolean
): boolean {
  return hasFocus || lens !== 'saved';
}

export function countVisibleHomeFeedCards(
  posts: readonly PostRow[],
  options: {
    includeForeignReplies?: boolean;
    stoodWithAccountIds?: ReadonlySet<string>;
  } = {}
): number {
  if (posts.length === 0) return 0;
  return coalesceFeedThreads([...posts], options).length;
}

function mergeUniquePosts(
  current: readonly PostRow[],
  incoming: readonly PostRow[]
): PostRow[] {
  if (incoming.length === 0) return [...current];
  const seen = new Set(current.map(postKey));
  const merged = [...current];
  for (const post of incoming) {
    const key = postKey(post);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(post);
  }
  return merged;
}

function nextWalkCursor(
  result: Paginated<PostRow>
): HomeFeedPageCursor | undefined {
  if (result.nextBeforeBlockHeight !== undefined) {
    return {
      beforeBlockHeight: result.nextBeforeBlockHeight,
      beforeEventHeight: result.nextBeforeBlockHeight,
      beforeEventHeat: result.nextBeforeHeat,
      beforeEventKey: result.nextBeforeEventKey,
    };
  }
  if (result.nextOffset !== undefined) {
    return { offset: result.nextOffset };
  }
  return undefined;
}

/**
 * Page global (and any raw recent walk) by cards the list will paint.
 * A window of only foreign replies is consumed quietly until a card
 * appears, the page is full, or the walk cap is hit.
 */
export async function fillVisibleFeedPage(opts: {
  cursor?: HomeFeedPageCursor;
  /** @deprecated Prefer `cursor.offset`. */
  offset?: number;
  limit: number;
  maxPages?: number;
  fetchPage: (
    cursor: HomeFeedPageCursor,
    limit: number
  ) => Promise<Paginated<PostRow>>;
  visibleCount: (posts: readonly PostRow[]) => number;
}): Promise<Paginated<PostRow>> {
  const maxPages = opts.maxPages ?? HOME_FEED_VISIBLE_PAGE_WALK;
  let cursor: HomeFeedPageCursor = opts.cursor ?? {
    offset: opts.offset ?? 0,
  };
  let items: PostRow[] = [];
  let last: Paginated<PostRow> | undefined;

  for (let page = 0; page < maxPages; page++) {
    const result = await opts.fetchPage(cursor, opts.limit);
    last = result;
    items = mergeUniquePosts(items, result.items);
    const next = nextWalkCursor(result);
    if (
      opts.visibleCount(items) >= opts.limit ||
      next === undefined ||
      result.items.length === 0
    ) {
      if (result.items.length === 0) {
        return { items };
      }
      return {
        items,
        nextOffset: result.nextOffset,
        nextBeforeBlockHeight: result.nextBeforeBlockHeight,
        nextBeforeHeat: result.nextBeforeHeat,
        nextBeforeEventKey: result.nextBeforeEventKey,
      };
    }
    cursor = next;
  }

  return {
    items,
    nextOffset: last?.nextOffset,
    nextBeforeBlockHeight: last?.nextBeforeBlockHeight,
    nextBeforeHeat: last?.nextBeforeHeat,
    nextBeforeEventKey: last?.nextBeforeEventKey,
  };
}

export type SaveFeedRef = { author: string; postId: string };

export type SaveListCursor = {
  offset?: number;
  beforeBlockHeight?: number;
  beforeContentPath?: string;
};

export type SaveListRow = {
  ref: SaveFeedRef | null;
  blockHeight: number;
  contentPath: string;
};

/**
 * Turn a save list into a page of posts. Unresolved bookmarks are skipped
 * and the next saves fill the page. Load-more uses the last consumed save's
 * (blockHeight, contentPath) keyset when available.
 */
export async function collectResolvedSavePage(opts: {
  limit: number;
  maxPages?: number;
  cursor?: SaveListCursor;
  /** @deprecated Prefer `cursor.offset`. */
  offset?: number;
  loadRefs: (
    cursor: SaveListCursor,
    limit: number
  ) => Promise<ReadonlyArray<SaveListRow>>;
  hydrate: (
    refs: readonly SaveFeedRef[]
  ) => Promise<ReadonlyMap<string, PostRow>>;
  refKey: (ref: SaveFeedRef) => string;
}): Promise<Paginated<PostRow>> {
  const maxPages = opts.maxPages ?? HOME_FEED_VISIBLE_PAGE_WALK;
  const items: PostRow[] = [];
  const seen = new Set<string>();
  let cursor: SaveListCursor = opts.cursor ?? {
    offset: opts.offset ?? 0,
  };
  let lastConsumed: SaveListRow | undefined;

  for (let page = 0; page < maxPages && items.length < opts.limit; page++) {
    const refs = await opts.loadRefs(cursor, opts.limit);
    if (refs.length === 0) return { items };

    const present = refs
      .map((row) => row.ref)
      .filter((ref): ref is SaveFeedRef => ref != null);
    const hydrated =
      present.length > 0
        ? await opts.hydrate(present)
        : new Map<string, PostRow>();

    for (let index = 0; index < refs.length; index++) {
      const row = refs[index]!;
      lastConsumed = row;
      const ref = row.ref;
      if (ref == null) continue;
      const hydratedRow = hydrated.get(opts.refKey(ref));
      if (!hydratedRow) continue;
      const key = postKey(hydratedRow);
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(hydratedRow);
      if (items.length >= opts.limit) {
        const moreInPage = index + 1 < refs.length;
        const pageFull = refs.length >= opts.limit;
        if (!moreInPage && !pageFull) return { items };
        return {
          items,
          nextBeforeBlockHeight: row.blockHeight,
          nextBeforeEventKey: row.contentPath,
        };
      }
    }

    // Short save page = end of the bookmark list.
    if (refs.length < opts.limit) return { items };

    cursor = {
      beforeBlockHeight: lastConsumed?.blockHeight,
      beforeContentPath: lastConsumed?.contentPath,
    };
  }

  // Walk budget exhausted on full unresolved pages — keep keyset so load-more
  // can continue past the gap.
  return lastConsumed
    ? {
        items,
        nextBeforeBlockHeight: lastConsumed.blockHeight,
        nextBeforeEventKey: lastConsumed.contentPath,
      }
    : { items };
}