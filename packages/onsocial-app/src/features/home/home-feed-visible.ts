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

/**
 * Turn a save list into a page of posts. Unresolved bookmarks are skipped
 * and the next saves fill the page. `nextOffset` is the save-list cursor.
 */
export async function collectResolvedSavePage(opts: {
  offset: number;
  limit: number;
  maxPages?: number;
  loadRefs: (
    offset: number,
    limit: number
  ) => Promise<ReadonlyArray<SaveFeedRef | null>>;
  hydrate: (
    refs: readonly SaveFeedRef[]
  ) => Promise<ReadonlyMap<string, PostRow>>;
  refKey: (ref: SaveFeedRef) => string;
}): Promise<Paginated<PostRow>> {
  const maxPages = opts.maxPages ?? HOME_FEED_VISIBLE_PAGE_WALK;
  const items: PostRow[] = [];
  const seen = new Set<string>();
  let cursor = opts.offset;

  for (let page = 0; page < maxPages && items.length < opts.limit; page++) {
    const refs = await opts.loadRefs(cursor, opts.limit);
    if (refs.length === 0) return { items };

    const present = refs.filter((ref): ref is SaveFeedRef => ref != null);
    const hydrated =
      present.length > 0
        ? await opts.hydrate(present)
        : new Map<string, PostRow>();

    for (let index = 0; index < refs.length; index++) {
      cursor += 1;
      const ref = refs[index];
      if (ref == null) continue;
      const row = hydrated.get(opts.refKey(ref));
      if (!row) continue;
      const key = postKey(row);
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(row);
      if (items.length >= opts.limit) {
        const moreInPage = index + 1 < refs.length;
        const pageFull = refs.length >= opts.limit;
        return {
          items,
          nextOffset: moreInPage || pageFull ? cursor : undefined,
        };
      }
    }

    if (refs.length < opts.limit) return { items };
  }

  return { items, nextOffset: cursor };
}
