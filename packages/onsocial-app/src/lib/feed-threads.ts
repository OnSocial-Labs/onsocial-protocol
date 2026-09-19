import { postContentPath, type PostRow } from '@onsocial/sdk';

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

export type CoalescedFeedBlock = {
  /** Author's own connected chain — collapse uses first + last two of this only. */
  posts: PostRow[];
  /** Standing lens: one peek reply chained after `posts` (not part of fold math). */
  standingPeek?: PostRow;
  /** Standing lens: zigzag coil after the peek reply — rest lives on thread page. */
  standingCoilTail?: boolean;
};

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
    block.standingCoilTail = true;
  }
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
 *   several stood-with accounts reply, the newest reply wins; longer
 *   self-threads show only the newest reply plus a coil link-out.
 * - A self-reply whose parent isn't on this page stays a single-post block
 *   with its `Replying to @x` context line.
 *
 * Blocks are anchored where the newest member sits, and a parent joins only
 * its newest on-page child.
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
    // [reply, original]. If the parent was already listed alone, tuck this
    // self-reply under it — same block as the Global walk.
    if (root.parentPath && parentAuthorOf(root) === root.accountId) {
      const already = parentOnPage(root.parentPath, byPath, byRef);
      if (already && consumed.has(already)) {
        const parentKey = postRefKey(already.accountId, already.postId);
        const listed = blocks.find(
          (block) =>
            block.posts.length === 1 &&
            postRefKey(block.posts[0]!.accountId, block.posts[0]!.postId) ===
              parentKey
        );
        if (listed) {
          listed.posts.push(...chain);
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
