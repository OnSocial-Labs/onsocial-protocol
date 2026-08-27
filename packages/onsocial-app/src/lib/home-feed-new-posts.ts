import type { PostRow } from '@onsocial/sdk';
import { postContentPath } from '@onsocial/sdk';
import { accountIdsEqual } from '@/lib/account-match';
import { postKey } from '@/lib/post-display';
import { isForeignReply } from '@/lib/feed-threads';

/** Head-page probe size for “new posts” detection. */
export const HOME_FEED_NEW_PROBE_SIZE = 8;

/** How often to probe for newer posts while the feed is idle. */
export const HOME_FEED_NEW_POLL_MS = 45_000;

/** Count head-page posts the viewer has not loaded yet. */
export function countUnseenFeedPosts(
  head: readonly PostRow[],
  seenKeys: ReadonlySet<string>,
  options?: { includeForeignReplies?: boolean; viewerAccountId?: string | null }
): number {
  let count = 0;
  for (const post of head) {
    if (seenKeys.has(postKey(post))) continue;
    if (
      options?.viewerAccountId &&
      accountIdsEqual(post.accountId, options.viewerAccountId)
    ) {
      continue;
    }
    if (!options?.includeForeignReplies && isForeignReply(post)) continue;
    count += 1;
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

/**
 * Offset compensation for load-more on chrono-paged feeds.
 *
 * When N new posts land at the head between pages, the row previously at
 * `offset` moves to `offset + N` — appending at the stored offset would skip
 * N rows. Shift by the not-yet-applied part of the unseen count. Hot
 * global/standing pages by heat order, where chrono-new posts do not shift
 * offsets, so those pass `chronoPaged: false`.
 */
export function pendingFeedOffsetShift(opts: {
  newPostCount: number;
  appliedShift: number;
  chronoPaged: boolean;
}): number {
  if (!opts.chronoPaged) return 0;
  return Math.max(0, opts.newPostCount - opts.appliedShift);
}
