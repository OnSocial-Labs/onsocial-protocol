import { postContentPath, type PostRow } from '@onsocial/sdk';

/** Author who owns the post this row replies to, if any. */
function parentAuthorOf(post: PostRow): string | null {
  if (!post.parentPath) return null;
  return post.parentAuthor ?? post.parentPath.split('/')[0] ?? null;
}

/**
 * Shape a newest-first feed into connected thread blocks:
 *
 * - Consecutive posts where an author continues their own post (self-reply)
 *   join into one block — parent above, reply below, joined by a chain line.
 * - Replies to OTHER accounts never render as feed items. They surface as
 *   the parent's reply count and live on the thread page, so conversations
 *   don't flood the feed.
 * - A self-reply whose parent isn't on this page stays a single-post block
 *   with its `Replying to @x` context line.
 *
 * Blocks are anchored where the newest member sits, and a parent joins only
 * its newest on-page child.
 */
export function coalesceFeedThreads(posts: PostRow[]): PostRow[][] {
  const byPath = new Map<string, PostRow>();
  for (const post of posts) {
    byPath.set(postContentPath(post), post);
  }

  const consumed = new Set<PostRow>();
  const blocks: PostRow[][] = [];

  for (const post of posts) {
    if (consumed.has(post)) continue;

    // Walk self-reply edges upward while parents are on this page.
    const chain: PostRow[] = [post];
    consumed.add(post);
    let cursor = post;
    while (cursor.parentPath && parentAuthorOf(cursor) === cursor.accountId) {
      const parent = byPath.get(cursor.parentPath);
      if (!parent || consumed.has(parent)) break;
      chain.unshift(parent);
      consumed.add(parent);
      cursor = parent;
    }

    // A chain rooted in a reply to someone else belongs to that conversation,
    // not the feed — the parent's reply count is its entry point.
    const root = chain[0]!;
    const rootParentAuthor = parentAuthorOf(root);
    if (rootParentAuthor !== null && rootParentAuthor !== root.accountId) {
      continue;
    }

    blocks.push(chain);
  }

  return blocks;
}
