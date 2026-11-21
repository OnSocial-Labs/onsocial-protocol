import type { PostRow } from '@onsocial/sdk';
import {
  EMPTY_POST_ENGAGEMENT,
  type EngagementMap,
} from '@/lib/post-engagement-model';
import { postKey } from '@/lib/post-display';
import { publicCountsOnFeedRow } from '@/lib/prepare-feed-paint';

export type { EngagementMap as PostEngagementMap };

/** Public counts from feed rows — same frame as list mount. */
export function engagementSeedFromFeedRows(
  posts: readonly PostRow[]
): EngagementMap {
  const next: EngagementMap = {};
  const put = (row: PostRow | null | undefined) => {
    if (!row) return;
    const counts = publicCountsOnFeedRow(row);
    if (!counts) return;
    next[postKey(row)] = {
      ...EMPTY_POST_ENGAGEMENT,
      replyCount: counts.replyCount,
      quoteCount: counts.quoteCount,
      repostCount: counts.repostCount,
      reactionCount: counts.reactionCount,
      threadCountsReady: true,
      reactionCountReady: true,
      // Missing feed amplify stays unset (ready false) — do not invent 0.
      ...(counts.amplifyCount != null
        ? {
            amplifyCount: counts.amplifyCount,
            amplifyCountReady: true,
          }
        : {}),
      // Colour comes from the signed-in overlay / soft-fill — not the row.
      viewerFlagsReady: false,
    };
  };
  for (const post of posts) {
    put(post);
    const quoted =
      post.quotedPost && typeof post.quotedPost === 'object'
        ? (post.quotedPost as PostRow)
        : null;
    put(quoted);
  }
  return next;
}

/** Prefer live/seed rows; fill only keys still missing from public feed fields. */
export function fillEngagementSeedFromFeedRows(
  current: EngagementMap | null | undefined,
  posts: readonly PostRow[]
): EngagementMap {
  const fromRows = engagementSeedFromFeedRows(posts);
  if (!current || Object.keys(current).length === 0) return fromRows;
  const next = { ...current };
  let changed = false;
  for (const [key, row] of Object.entries(fromRows)) {
    if (key in next) continue;
    next[key] = row;
    changed = true;
  }
  return changed ? next : current;
}
