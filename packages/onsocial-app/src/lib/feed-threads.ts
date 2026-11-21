import { postContentPath, type PostRow } from '@onsocial/sdk';
import { postKey } from '@/lib/post-display';

function postRefKey(accountId: string, postId: string): string {
  return `${accountId}\0${postId}`;
}

/** Personal or group content path → account + post id. */
function parseContentPathRef(
  path: string
): { accountId: string; postId: string } | null {
  const trimmed = path.trim();
  const group = /^([^/]+)\/groups\/[^/]+\/content\/post\/(.+)$/.exec(trimmed);
  if (group) return { accountId: group[1]!, postId: group[2]! };
  const personal = /^([^/]+)\/post\/(.+)$/.exec(trimmed);
  if (!personal) return null;
  return { accountId: personal[1]!, postId: personal[2]! };
}

function indexFeedPosts(posts: readonly PostRow[]): {
  byPath: Map<string, PostRow>;
  byRef: Map<string, PostRow>;
} {
  const byPath = new Map<string, PostRow>();
  const byRef = new Map<string, PostRow>();
  for (const post of posts) {
    byPath.set(postContentPath(post), post);
    byRef.set(postRefKey(post.accountId, post.postId), post);
  }
  return { byPath, byRef };
}

function parentOnPage(
  parentPath: string | undefined,
  byPath: Map<string, PostRow>,
  byRef: Map<string, PostRow>
): PostRow | undefined {
  if (!parentPath) return undefined;
  const direct = byPath.get(parentPath);
  if (direct) return direct;
  const ref = parseContentPathRef(parentPath);
  return ref ? byRef.get(postRefKey(ref.accountId, ref.postId)) : undefined;
}

/** Author who owns the post this row replies to, if any. */
export function parentAuthorOf(post: PostRow): string | null {
  if (!post.parentPath) return null;
  return post.parentAuthor ?? post.parentPath.split('/')[0] ?? null;
}

/** Reply to someone else's post — hidden from the default home feed. */
export function isForeignReply(post: PostRow): boolean {
  const parentAuthor = parentAuthorOf(post);
  return parentAuthor !== null && parentAuthor !== post.accountId;
}

export type CoalesceFeedThreadsOptions = {
  /**
   * Keep replies to other people as feed items (hashtag search).
   * Standing/global feeds still hide them — they live on the thread page.
   */
  includeForeignReplies?: boolean;
  /**
   * Standing lens: tuck one newest reply from these authors under the parent
   * post they replied to; coil tail when their on-page chain is longer.
   */
  stoodWithAccountIds?: ReadonlySet<string>;
};

/** Chains up to this long render in full; longer ones collapse the middle. */
export const FEED_THREAD_MAX_UNCOLLAPSED = 3;

/** Latest posts kept visible below the fold when a chain collapses. */
export const FEED_THREAD_TAIL_VISIBLE = 2;

export type CoalescedFeedBlock = {
  /** Author's own connected chain — collapse uses first + last two of this only. */
  posts: PostRow[];
  /** Standing lens: one peek reply chained after `posts` (not part of fold math). */
  standingPeek?: PostRow;
  /** Replies skipped between `posts` and `standingPeek`. */
  standingHidden?: PostRow[];
};

/** Prior block key + member post keys — input to {@link assignStableFeedBlockKeys}. */
export type FeedBlockKeyState = {
  key: string;
  members: ReadonlySet<string>;
};

/** Every post identity in a coalesced block (native chain + standing peek). */
export function feedBlockMemberKeys(block: CoalescedFeedBlock): Set<string> {
  const members = new Set<string>();
  for (const post of block.posts) members.add(postKey(post));
  if (block.standingPeek) members.add(postKey(block.standingPeek));
  if (block.standingHidden) {
    for (const post of block.standingHidden) members.add(postKey(post));
  }
  return members;
}

/**
 * Newest native chain post — where the block sits in newest-first order.
 * Used only for brand-new blocks; overlaps reuse the prior key.
 */
export function feedBlockTipKey(block: CoalescedFeedBlock): string {
  return postKey(block.posts[block.posts.length - 1]!);
}

/**
 * Stable React / window / size-cache keys across coalesce reshapes.
 * Reuses the previous key when post membership overlaps so orphan→parent
 * and parent→continuation keep the same DOM identity.
 */
export function assignStableFeedBlockKeys(
  blocks: readonly CoalescedFeedBlock[],
  previous: readonly FeedBlockKeyState[] = []
): { keys: string[]; state: FeedBlockKeyState[] } {
  const usedPrev = new Set<number>();
  const keys: string[] = [];
  const state: FeedBlockKeyState[] = [];

  for (const block of blocks) {
    const members = feedBlockMemberKeys(block);
    let bestIndex = -1;
    let bestOverlap = 0;
    for (let i = 0; i < previous.length; i += 1) {
      if (usedPrev.has(i)) continue;
      let overlap = 0;
      for (const member of previous[i]!.members) {
        if (members.has(member)) overlap += 1;
      }
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestIndex = i;
      }
    }
    const key =
      bestIndex >= 0 && bestOverlap > 0
        ? previous[bestIndex]!.key
        : feedBlockTipKey(block);
    if (bestIndex >= 0 && bestOverlap > 0) usedPrev.add(bestIndex);
    keys.push(key);
    state.push({ key, members });
  }
  return { keys, state };
}

function standingChainNewestTimestamp(chain: PostRow[]): number {
  return chain[chain.length - 1]?.blockTimestamp ?? 0;
}

function upsertPendingStandingChain(
  pending: Map<string, PostRow[]>,
  parentPath: string,
  chain: PostRow[]
): void {
  const existing = pending.get(parentPath);
  if (
    !existing ||
    standingChainNewestTimestamp(chain) > standingChainNewestTimestamp(existing)
  ) {
    pending.set(parentPath, chain);
  }
}

function mergeStandingAttachment(
  block: CoalescedFeedBlock,
  chain: PostRow[]
): void {
  const newest = chain[chain.length - 1]!;
  const newestTimestamp = newest.blockTimestamp ?? 0;
  const existing = block.standingPeek;
  if (existing && (existing.blockTimestamp ?? 0) >= newestTimestamp) return;

  block.standingPeek = newest;
  if (chain.length > 1) {
    block.standingHidden = chain.slice(0, -1);
  } else {
    delete block.standingHidden;
  }
}

function postRecency(post: PostRow): number {
  const timestamp = post.blockTimestamp ?? 0;
  const height = post.blockHeight ?? 0;
  return timestamp * 1_000_000_000 + height;
}

/** Keep one continuation under a parent. A later, older sibling is dropped. */
function attachNewestSelfChain(
  block: CoalescedFeedBlock,
  parent: PostRow,
  chain: PostRow[]
): void {
  const parentKey = postRefKey(parent.accountId, parent.postId);
  const parentIndex = block.posts.findIndex(
    (post) => postRefKey(post.accountId, post.postId) === parentKey
  );
  if (parentIndex < 0 || chain.length === 0) return;
  const tail = block.posts[block.posts.length - 1]!;
  const incoming = chain[chain.length - 1]!;
  const hasContinuation = block.posts.length > parentIndex + 1;
  if (hasContinuation && postRecency(tail) >= postRecency(incoming)) return;
  block.posts = [...block.posts.slice(0, parentIndex + 1), ...chain];
}

function tryMergeStandingIntoBlock(
  blocks: CoalescedFeedBlock[],
  parent: PostRow,
  chain: PostRow[]
): boolean {
  const parentKey = postRefKey(parent.accountId, parent.postId);
  for (const block of blocks) {
    if (
      block.posts.some(
        (post) => postRefKey(post.accountId, post.postId) === parentKey
      )
    ) {
      mergeStandingAttachment(block, chain);
      return true;
    }
  }
  return false;
}

/**
 * Shape a newest-first feed into connected thread blocks:
 *
 * - Consecutive posts where an author continues their own post (self-reply)
 *   join into one block — parent above, reply below, joined by a chain line.
 * - Replies to OTHER accounts never render as feed items (unless
 *   `includeForeignReplies` or the replier is in `stoodWithAccountIds`).
 *   They surface as the parent's reply count and live on the thread page,
 *   so conversations don't flood the feed.
 * - Standing lens: one stood-with reply chains after the native block; when
 *   several stood-with accounts reply, the newest reply wins; a longer
 *   self-thread keeps the skipped replies for the fold between them.
 * - A self-reply whose parent isn't on this page stays a single-post block
 *   with its `Replying to @x` context line.
 * - A self-reply whose parent is already in a block stays there. The newest
 *   continuation replaces an older one. It does not paint again lower down.
 *
 * Blocks are anchored where the newest member sits.
 */
export function coalesceFeedThreads(
  posts: PostRow[],
  options: CoalesceFeedThreadsOptions = {}
): CoalescedFeedBlock[] {
  const includeForeignReplies = Boolean(options.includeForeignReplies);
  const stoodWithAccountIds = options.stoodWithAccountIds;
  const { byPath, byRef } = indexFeedPosts(posts);

  const consumed = new Set<PostRow>();
  const blocks: CoalescedFeedBlock[] = [];
  const pendingStandingByParentPath = new Map<string, PostRow[]>();

  for (const post of posts) {
    if (consumed.has(post)) continue;

    // Walk self-reply edges upward while parents are on this page.
    const chain: PostRow[] = [post];
    consumed.add(post);
    let cursor = post;
    while (cursor.parentPath && parentAuthorOf(cursor) === cursor.accountId) {
      const parent = parentOnPage(cursor.parentPath, byPath, byRef);
      if (!parent || consumed.has(parent)) break;
      chain.unshift(parent);
      consumed.add(parent);
      cursor = parent;
    }

    const root = chain[0]!;

    // Pulse flattens a card as [original, reply]. Global is newest-first
    // [reply, original]. A self-reply whose parent is already in a block
    // stays on that block — the newest continuation wins. An older sibling
    // must not become a second card further down the feed.
    if (root.parentPath && parentAuthorOf(root) === root.accountId) {
      const already = parentOnPage(root.parentPath, byPath, byRef);
      if (already && consumed.has(already)) {
        const parentKey = postRefKey(already.accountId, already.postId);
        const listed = blocks.find((block) =>
          block.posts.some(
            (post) => postRefKey(post.accountId, post.postId) === parentKey
          )
        );
        if (listed) {
          attachNewestSelfChain(listed, already, chain);
          continue;
        }
      }
    }

    const rootIsForeignReply = isForeignReply(root);

    if (!includeForeignReplies && rootIsForeignReply) {
      const standingParent = parentOnPage(root.parentPath, byPath, byRef);
      if (stoodWithAccountIds?.has(root.accountId) && standingParent) {
        if (!tryMergeStandingIntoBlock(blocks, standingParent, chain)) {
          upsertPendingStandingChain(
            pendingStandingByParentPath,
            postRefKey(standingParent.accountId, standingParent.postId),
            chain
          );
        }
        continue;
      }
      continue;
    }

    const block: CoalescedFeedBlock = { posts: chain };
    const pendingKey = postRefKey(root.accountId, root.postId);
    const pending = pendingStandingByParentPath.get(pendingKey);
    if (pending) {
      mergeStandingAttachment(block, pending);
      pendingStandingByParentPath.delete(pendingKey);
    }
    blocks.push(block);
  }

  return blocks;
}
