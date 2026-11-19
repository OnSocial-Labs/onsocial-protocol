import type { PostRow } from '@onsocial/sdk';

/**
 * What a background refetch of a feed-row open may say about the painted
 * root. The row itself stays on screen either way.
 */
export type ThreadRootRevision = 'edited' | 'deleted';

type SeedPage = {
  /**
   * Set by the SSR loaders, including when the reply page failed.
   * A feed-row seed (`seedEmbeddedThread` / `seedGuildThread`) omits it.
   */
  directRepliesResolved?: boolean;
  root?: Pick<PostRow, 'accountId' | 'postId' | 'groupId'> | null;
};

/**
 * A sheet opened from a tapped row. Permalink / SSR pages always set
 * `directRepliesResolved`, so they keep today's root swap.
 */
export function isFeedRowSeed(
  initial: { directRepliesResolved?: boolean } | null | undefined
): boolean {
  return initial != null && typeof initial.directRepliesResolved !== 'boolean';
}

/** The seed is the post this sheet is showing, not a stale open. */
export function feedRowSeedMatches(
  initial: SeedPage | null | undefined,
  ref: { author: string; postId: string; groupId?: string | null }
): boolean {
  if (!isFeedRowSeed(initial) || !initial.root) return false;
  if (initial.root.accountId !== ref.author) return false;
  if (initial.root.postId !== ref.postId) return false;
  if (
    ref.groupId != null &&
    ref.groupId !== '' &&
    (initial.root.groupId ?? '') !== ref.groupId
  ) {
    return false;
  }
  return true;
}

function heightOf(value: number | string | null | undefined): number {
  const height = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(height) ? height : 0;
}

/**
 * Compare a painted feed row with a resolved `postsCurrent` read.
 *
 * A tombstone deletes the `posts_current` row (`operation: "remove"`), so
 * the query comes back empty. That is Deleted only for a row the indexer
 * already wrote (`blockHeight > 0`). An optimistic composer row uses
 * `blockHeight: 0`; an empty read there is "not indexed yet", not a delete.
 * A thrown fetch must not be passed in — callers leave the label alone.
 *
 * A later block, or the same block with a different receipt, is Edited.
 * The painted row's text stays; the label is the only change.
 */
export function rowSeedRevision(
  painted: { blockHeight: number | string; receiptId?: string | null },
  fetched: {
    blockHeight: number | string;
    receiptId?: string | null;
  } | null
): ThreadRootRevision | null {
  if (heightOf(painted.blockHeight) <= 0) return null;
  if (!fetched) return 'deleted';
  const paintedHeight = heightOf(painted.blockHeight);
  const fetchedHeight = heightOf(fetched.blockHeight);
  if (fetchedHeight > paintedHeight) return 'edited';
  const paintedReceipt = painted.receiptId?.trim() ?? '';
  const fetchedReceipt = fetched.receiptId?.trim() ?? '';
  if (
    paintedReceipt &&
    fetchedReceipt &&
    paintedReceipt !== fetchedReceipt &&
    fetchedHeight >= paintedHeight
  ) {
    return 'edited';
  }
  return null;
}

export function threadRootRevisionLabel(
  revision: ThreadRootRevision | null | undefined
): 'Edited' | 'Deleted' | null {
  if (revision === 'edited') return 'Edited';
  if (revision === 'deleted') return 'Deleted';
  return null;
}
