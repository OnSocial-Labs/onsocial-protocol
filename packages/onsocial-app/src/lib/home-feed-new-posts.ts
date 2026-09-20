import type { PostRow } from '@onsocial/sdk';
import { accountIdsEqual } from '@/lib/account-match';
import { postKey } from '@/lib/post-display';
import { coalesceFeedThreads, isForeignReply } from '@/lib/feed-threads';

/** Head-page probe size for “new posts” detection. */
export const HOME_FEED_NEW_PROBE_SIZE = 8;

/** Max facepile slots on the catch-up chip. */
export const HOME_FEED_NEW_AVATAR_SLOTS = 3;

/** How often to probe for newer posts while the feed is idle. */
export const HOME_FEED_NEW_POLL_MS = 45_000;

export type UnseenFeedSummary = {
  count: number;
  authorIds: string[];
};

export const EMPTY_UNSEEN_FEED_SUMMARY: UnseenFeedSummary = {
  count: 0,
  authorIds: [],
};

export type SummarizeUnseenFeedOptions = {
  includeForeignReplies?: boolean;
  viewerAccountId?: string | null;
  maxAuthors?: number;
  /** Pulse — a new stood-with reply is one card, same as a new original. */
  stoodWithAccountIds?: ReadonlySet<string>;
};

/** Count head-page posts the viewer has not loaded yet + unique authors. */
export function summarizeUnseenFeedPosts(
  head: readonly PostRow[],
  seenKeys: ReadonlySet<string>,
  options?: SummarizeUnseenFeedOptions
): UnseenFeedSummary {
  const maxAuthors = Math.max(
    0,
    options?.maxAuthors ?? HOME_FEED_NEW_AVATAR_SLOTS
  );
  const includeForeignReplies = Boolean(options?.includeForeignReplies);
  const stoodWithAccountIds = options?.stoodWithAccountIds;
  const viewerAccountId = options?.viewerAccountId;
  const isViewer = (post: PostRow) =>
    Boolean(
      viewerAccountId && accountIdsEqual(post.accountId, viewerAccountId)
    );

  let count = 0;
  const authorIds: string[] = [];
  const seenAuthors = new Set<string>();
  const countedKeys = new Set<string>();

  const add = (post: PostRow) => {
    const key = postKey(post);
    if (countedKeys.has(key)) return;
    countedKeys.add(key);
    count += 1;
    if (
      maxAuthors > 0 &&
      authorIds.length < maxAuthors &&
      !seenAuthors.has(post.accountId)
    ) {
      seenAuthors.add(post.accountId);
      authorIds.push(post.accountId);
    }
  };

  const blocks = coalesceFeedThreads([...head], {
    includeForeignReplies,
    stoodWithAccountIds,
  });

  for (const block of blocks) {
    const peek = block.standingPeek;
    if (peek && !seenKeys.has(postKey(peek))) {
      // One Pulse card: the reply is the activity. Skip the stranger parent
      // so a new bridge is "1 posted" (replier), not parent + reply.
      if (!isViewer(peek)) add(peek);
      continue;
    }

    for (const post of block.posts) {
      if (seenKeys.has(postKey(post))) continue;
      if (isViewer(post)) continue;
      if (!includeForeignReplies && isForeignReply(post)) continue;
      add(post);
    }
  }

  // Peek whose parent is not on this head still counts — Pulse hydrates the
  // parent, but a short probe should not drop the reply if it didn't.
  if (stoodWithAccountIds) {
    for (const post of head) {
      if (seenKeys.has(postKey(post))) continue;
      if (isViewer(post)) continue;
      if (!isForeignReply(post)) continue;
      if (!stoodWithAccountIds.has(post.accountId)) continue;
      add(post);
    }
  }

  return { count, authorIds };
}

/** Count head-page posts the viewer has not loaded yet. */
export function countUnseenFeedPosts(
  head: readonly PostRow[],
  seenKeys: ReadonlySet<string>,
  options?: SummarizeUnseenFeedOptions
): number {
  return summarizeUnseenFeedPosts(head, seenKeys, options).count;
}

export function feedPostKeySet(posts: readonly PostRow[]): Set<string> {
  return new Set(posts.map(postKey));
}

function parentPostKey(post: PostRow): string | null {
  if (!post.parentPath) return null;
  const accountId = post.parentAuthor ?? post.parentPath.split('/')[0];
  const postId = post.parentPath.split('/').pop();
  if (!accountId || !postId) return null;
  return `${accountId}:${postId}`;
}

export type MergeHomeFeedHeadResult = {
  posts: PostRow[];
  /** New head cards — bump `nextOffset` by this, not by raw row count. */
  insertedCount: number;
};

/**
 * Fold a refreshed page-0 into the already-loaded list.
 *
 * New keys prepend in incoming order. Already-seen rows keep their
 * positions so loaded pages below the fold are not thrown away.
 * Overlapping keys take the incoming row's fields (heat, body, …).
 *
 * `insertedCount` is cards, not rows: a new `[root, reply]` pair is one
 * card, matching Pulse / SQL page offsets.
 */
export function mergeHomeFeedHead(
  current: readonly PostRow[],
  incoming: readonly PostRow[]
): MergeHomeFeedHeadResult {
  if (current.length === 0) {
    return { posts: [...incoming], insertedCount: incoming.length };
  }
  if (incoming.length === 0) {
    return { posts: [...current], insertedCount: 0 };
  }

  const currentKeys = new Set(current.map(postKey));
  const incomingByKey = new Map(incoming.map((row) => [postKey(row), row]));

  const newHead: PostRow[] = [];
  const newHeadKeys = new Set<string>();
  for (const row of incoming) {
    const key = postKey(row);
    if (currentKeys.has(key) || newHeadKeys.has(key)) continue;
    newHeadKeys.add(key);
    newHead.push(row);
  }

  let insertedCount = 0;
  for (const row of newHead) {
    const parentKey = parentPostKey(row);
    if (parentKey && newHeadKeys.has(parentKey)) continue;
    insertedCount += 1;
  }

  const rest = current.map((row) => incomingByKey.get(postKey(row)) ?? row);
  if (newHead.length === 0) {
    return { posts: rest, insertedCount: 0 };
  }
  return { posts: [...newHead, ...rest], insertedCount };
}

/**
 * Compact chip count — `1` / `2` / `3` / `3+`.
 * Probe saturation still drives the unseen count; display caps at three-plus.
 */
export function homeFeedNewPostsCountLabel(count: number): string {
  if (count <= 0) return '';
  if (count <= HOME_FEED_NEW_AVATAR_SLOTS) return String(count);
  return `${HOME_FEED_NEW_AVATAR_SLOTS}+`;
}

/** Accessible long form (`8+ posted` when the probe is saturated). */
export function homeFeedNewPostsLabel(
  count: number,
  probeSize: number = HOME_FEED_NEW_PROBE_SIZE
): string {
  if (count <= 0) return '';
  if (count === 1) return '1 posted';
  if (count >= probeSize) return `${probeSize}+ posted`;
  return `${count} posted`;
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
