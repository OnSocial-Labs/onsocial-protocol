import { postContentPath, type PostRow, type ThreadNode } from '@onsocial/sdk';
import { postKey } from '@/features/home/post-card';
import type { GuildPostPageData } from '@/lib/load-guild-post-page';
import type { PersonalPostPageData } from '@/lib/load-personal-post-page';
import { invalidateThreadFirstPage } from '@/lib/thread-first-page';
import {
  buildReplyRows,
  leafThreadNode,
  type ThreadReplyRow,
  withoutIndexedPosts,
} from '@/lib/thread-display';
import {
  readGuildThreadSession,
  readThreadSession,
  writeGuildThreadSession,
  writeThreadSession,
} from '@/lib/thread-session-cache';
/**
 * Graft a chain-confirmed reply under its parent in the painted tree.
 * Root-targeted replies become a new top-level node.
 */
export function graftConfirmedReply(
  nodes: ThreadNode[],
  reply: PostRow,
  rootPath: string
): ThreadNode[] {
  const replyPath = postContentPath(reply).trim();
  if (!replyPath) return nodes;
  if (treeHasPost(nodes, reply)) return nodes;

  const parent = reply.parentPath?.trim() ?? '';
  if (!parent || parent === rootPath.trim()) {
    return [leafThreadNode(reply, replyPath), ...nodes];
  }

  let grafted = false;
  const next = mapTree(nodes, (node) => {
    if (grafted || node.path !== parent) return node;
    grafted = true;
    return {
      ...node,
      replies: [...node.replies, leafThreadNode(reply, replyPath)],
    };
  });
  // Parent not in the painted tree (folded / not loaded) — keep as top-level
  // so the just-landed row still has a seat until reconcile.
  return grafted ? next : [leafThreadNode(reply, replyPath), ...nodes];
}

function mapTree(
  nodes: ThreadNode[],
  map: (node: ThreadNode) => ThreadNode
): ThreadNode[] {
  return nodes.map((node) => {
    const mapped = map(node);
    if (mapped.replies.length === 0) return mapped;
    return { ...mapped, replies: mapTree(mapped.replies, map) };
  });
}

function treeHasPost(nodes: ThreadNode[], reply: PostRow): boolean {
  const key = postKey(reply);
  for (const node of nodes) {
    if (postKey(node.post) === key) return true;
    if (treeHasPost(node.replies, reply)) return true;
  }
  return false;
}

/**
 * Place chain-confirmed locals into display rows. Nested replies splice under
 * a painted parent; root children append (same as today's localReplies tail).
 * Fold rules stay unchanged — only just-landed locals are forced visible.
 */
export function withConfirmedLocalReplyRows(
  rows: ThreadReplyRow[],
  locals: readonly PostRow[],
  indexed: readonly PostRow[],
  rootPath: string
): ThreadReplyRow[] {
  const pending = withoutIndexedPosts([...locals], [...indexed]);
  if (pending.length === 0) return rows;

  const out: ThreadReplyRow[] = [...rows];
  const painted = new Set(
    out.flatMap((row) => (row.kind === 'post' ? [postKey(row.post)] : []))
  );
  const root = rootPath.trim();

  for (const local of pending) {
    const key = postKey(local);
    if (painted.has(key)) continue;

    const parent = local.parentPath?.trim() ?? '';
    const parentIndex =
      parent && parent !== root
        ? out.findIndex(
            (row) =>
              row.kind === 'post' && postContentPath(row.post).trim() === parent
          )
        : -1;

    if (parentIndex >= 0) {
      out.splice(parentIndex + 1, 0, {
        kind: 'post',
        post: local,
        connectedToPrevious: true,
      });
    } else {
      const lastPost = [...out]
        .reverse()
        .find(
          (row): row is Extract<ThreadReplyRow, { kind: 'post' }> =>
            row.kind === 'post'
        );
      out.push({
        kind: 'post',
        post: local,
        connectedToPrevious:
          lastPost != null && lastPost.post.accountId === local.accountId,
      });
    }
    painted.add(key);
  }

  return out;
}

/** Posts already painted as reply rows — used so nested locals are not dropped early. */
export function paintedReplyPosts(rows: readonly ThreadReplyRow[]): PostRow[] {
  return rows.flatMap((row) => (row.kind === 'post' ? [row.post] : []));
}

/**
 * Locals drop only when the fold model would paint them — not merely because
 * they exist somewhere in the walked tree (nested third-party children).
 */
export function indexedPostsVisibleInThread(
  tree: ThreadNode[],
  rootAuthor: string | undefined
): PostRow[] {
  return paintedReplyPosts(buildReplyRows(tree, rootAuthor));
}

/**
 * After a confirmed reply: drop the first-page settled fetch (stale without
 * the new row) but patch session trees so reopen still paints the land.
 * Quotes stay valid — do not wipe them.
 */
export function patchThreadCachesAfterConfirmedReply(input: {
  rootPath: string;
  reply: PostRow;
  kind?: 'personal' | 'guild';
}): void {
  const rootPath = input.rootPath.trim();
  if (!rootPath) return;
  invalidateThreadFirstPage(rootPath);

  if (input.kind === 'guild') {
    const hit = readGuildThreadSession(rootPath);
    if (hit) {
      const replyTree = graftConfirmedReply(hit.replyTree, input.reply, rootPath);
      const replies = mergeDirectReply(hit.replies, input.reply, rootPath);
      const next: GuildPostPageData = {
        root: hit.root,
        replies,
        quotes: hit.quotes,
        replyTree,
        hasMoreReplies: hit.hasMoreReplies,
        guildName: hit.guildName,
        memberDriven: hit.memberDriven,
        accessGated: hit.accessGated,
        engagement: hit.engagement,
        scarceEmbeds: hit.scarceEmbeds,
      };
      if (hit.directRepliesResolved != null) {
        next.directRepliesResolved = hit.directRepliesResolved;
      }
      writeGuildThreadSession(rootPath, next);
    }
    return;
  }

  const hit = readThreadSession(rootPath);
  if (hit) {
    const replyTree = graftConfirmedReply(hit.replyTree, input.reply, rootPath);
    const replies = mergeDirectReply(hit.replies, input.reply, rootPath);
    writeThreadSession(rootPath, {
      root: hit.root,
      replies,
      quotes: hit.quotes,
      replyTree,
      hasMoreReplies: hit.hasMoreReplies,
      engagement: hit.engagement,
      scarceEmbeds: hit.scarceEmbeds,
      ...(hit.directRepliesResolved != null
        ? { directRepliesResolved: hit.directRepliesResolved }
        : {}),
    } satisfies PersonalPostPageData);
  }
}

function mergeDirectReply(
  replies: PostRow[],
  reply: PostRow,
  rootPath: string
): PostRow[] {
  const parent = reply.parentPath?.trim() ?? '';
  if (parent && parent !== rootPath.trim()) return replies;
  if (replies.some((row) => postKey(row) === postKey(reply))) return replies;
  return [reply, ...replies];
}
