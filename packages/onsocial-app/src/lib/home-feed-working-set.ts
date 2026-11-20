import type { PostRow } from '@onsocial/sdk';
import { feedBlockEstimatePx } from '@/features/home/feed-block-estimate';
import type { FeedWindowSizeCache } from '@/features/home/feed-window';
import { coalesceFeedThreads } from '@/lib/feed-threads';
import { HOME_FEED_SESSION_PERSISTED_POSTS } from '@/lib/home-feed-session';
import { postKey } from '@/lib/post-display';

/**
 * Bound for an explicit jump-to-newest / refresh trim. Live load-more does
 * **not** drop the head — that orphaned the prefix on scroll-up. DOM
 * windowing already bounds render; side-paint maps project to live posts.
 */
export const HOME_FEED_WORKING_SET_POSTS = Math.max(
  120,
  HOME_FEED_SESSION_PERSISTED_POSTS * 2
);

export type TrimHomeFeedWorkingSetResult = {
  posts: PostRow[];
  /** Rows removed; 0 when under the cap. */
  dropped: PostRow[];
};

/**
 * Drop far-below (tail) rows once the list exceeds the working set.
 * Used after the reader jumps to newest — the head they landed on stays.
 */
export function trimHomeFeedWorkingSetKeepingHead(
  posts: readonly PostRow[],
  max: number = HOME_FEED_WORKING_SET_POSTS
): TrimHomeFeedWorkingSetResult {
  if (max <= 0 || posts.length <= max) {
    return { posts: posts as PostRow[], dropped: [] };
  }
  return {
    posts: posts.slice(0, max) as PostRow[],
    dropped: posts.slice(max) as PostRow[],
  };
}

/**
 * @deprecated Prefer {@link trimHomeFeedWorkingSetKeepingHead} for jump paths.
 * Dropping the head on load-more breaks scroll-up order — do not call from
 * append. Kept for height helpers / tests that still name the old shape.
 */
export function trimHomeFeedWorkingSet(
  posts: readonly PostRow[],
  max: number = HOME_FEED_WORKING_SET_POSTS
): TrimHomeFeedWorkingSetResult {
  if (max <= 0 || posts.length <= max) {
    return { posts: posts as PostRow[], dropped: [] };
  }
  const dropCount = posts.length - max;
  return {
    posts: posts.slice(dropCount) as PostRow[],
    dropped: posts.slice(0, dropCount) as PostRow[],
  };
}

/**
 * Spacer px for head rows about to leave the model — used to shift scroll so
 * the visible card stays put when a head trim runs (legacy / tests).
 */
export function homeFeedDroppedHeightPx(
  dropped: readonly PostRow[],
  sizeCache: FeedWindowSizeCache | null | undefined,
  quotedPosts: Record<string, PostRow | null | undefined> = {}
): number {
  if (dropped.length === 0) return 0;
  const quotes: Record<string, PostRow> = {};
  for (const [path, post] of Object.entries(quotedPosts)) {
    if (post) quotes[path] = post;
  }
  const blocks = coalesceFeedThreads([...dropped]);
  let total = 0;
  for (const block of blocks) {
    const head = block.posts[0];
    if (!head) continue;
    const key = postKey(head);
    total += sizeCache?.get(key) ?? feedBlockEstimatePx(block, quotes);
  }
  return total;
}
