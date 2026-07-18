import type { PostRow } from '@onsocial/sdk';
import { postKey } from '@/lib/post-display';

/** Head-page probe size for “new posts” detection. */
export const HOME_FEED_NEW_PROBE_SIZE = 8;

/** How often to probe for newer posts while the feed is idle. */
export const HOME_FEED_NEW_POLL_MS = 45_000;

/** Count head-page posts the viewer has not loaded yet. */
export function countUnseenFeedPosts(
  head: readonly PostRow[],
  seenKeys: ReadonlySet<string>
): number {
  let count = 0;
  for (const post of head) {
    if (!seenKeys.has(postKey(post))) count += 1;
  }
  return count;
}

export function feedPostKeySet(posts: readonly PostRow[]): Set<string> {
  return new Set(posts.map(postKey));
}

/** Label for the floating pill (`8+ new posts` when the probe is saturated). */
export function homeFeedNewPostsLabel(
  count: number,
  probeSize: number = HOME_FEED_NEW_PROBE_SIZE
): string {
  if (count <= 0) return '';
  if (count === 1) return '1 new post';
  if (count >= probeSize) return `${probeSize}+ new posts`;
  return `${count} new posts`;
}
