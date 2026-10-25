import type { PostRow } from '@onsocial/sdk';
import { postKey, resolvePostDate } from '@/lib/post-display';

/**
 * Soft reconciliation for rows the head probe cannot see: the probe only
 * compares the newest page for *new* posts, so an edit or deletion of an
 * already-listed row would linger until a full reload. Each pass re-validates
 * a small head window against `feed.statesByIds` — one batched query — and
 * patches the list in place.
 */
export const HOME_FEED_RECONCILE_HEAD_ROWS = 12;

/**
 * Rows younger than this sit out a pass: a just-confirmed own post can lag
 * the indexer by a beat, and reconciling it would read as a false deletion.
 */
export const HOME_FEED_RECONCILE_MIN_AGE_MS = 2 * 60 * 1000;

export type FeedReconcileTarget = {
  key: string;
  accountId: string;
  postId: string;
};

export function selectFeedReconcileTargets(
  posts: readonly PostRow[],
  now: number = Date.now(),
  limit: number = HOME_FEED_RECONCILE_HEAD_ROWS
): FeedReconcileTarget[] {
  const targets: FeedReconcileTarget[] = [];
  for (const post of posts) {
    if (targets.length >= limit) break;
    const postedAt = resolvePostDate(post.blockTimestamp)?.getTime();
    if (postedAt != null && now - postedAt < HOME_FEED_RECONCILE_MIN_AGE_MS) {
      continue;
    }
    targets.push({
      key: postKey(post),
      accountId: post.accountId,
      postId: post.postId,
    });
  }
  return targets;
}

/**
 * Patch `current` against freshly fetched rows: targets missing upstream are
 * deletions, targets with a changed value or block height are edits. Rows
 * outside the target window pass through untouched. Only call this with a
 * successful fetch — a failed query must never remove rows.
 */
export function reconcileFeedRows(
  current: readonly PostRow[],
  fresh: readonly PostRow[],
  targets: readonly FeedReconcileTarget[]
): { next: PostRow[]; removedKeys: string[]; updatedKeys: string[] } {
  const freshByKey = new Map(fresh.map((row) => [postKey(row), row]));
  const targetKeys = new Set(targets.map((target) => target.key));
  const removedKeys: string[] = [];
  const updatedKeys: string[] = [];
  const next: PostRow[] = [];

  for (const row of current) {
    const key = postKey(row);
    if (!targetKeys.has(key)) {
      next.push(row);
      continue;
    }
    const freshRow = freshByKey.get(key);
    if (!freshRow) {
      removedKeys.push(key);
      continue;
    }
    if (
      freshRow.value !== row.value ||
      freshRow.blockHeight !== row.blockHeight
    ) {
      updatedKeys.push(key);
      next.push(freshRow);
      continue;
    }
    next.push(row);
  }

  return { next, removedKeys, updatedKeys };
}
