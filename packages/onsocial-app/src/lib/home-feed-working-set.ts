import type { PostRow } from '@onsocial/sdk';
import { HOME_FEED_SESSION_PERSISTED_POSTS } from '@/lib/home-feed-session';

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
