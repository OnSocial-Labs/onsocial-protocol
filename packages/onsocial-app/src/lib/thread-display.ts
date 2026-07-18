import type { PostRow, ThreadNode } from '@onsocial/sdk';
import { postKey } from '@/features/home/post-card';
import { revokeOptimisticMediaPreviewUrls } from '@/lib/post-media';

/** Display row on a thread page: a post, or a per-branch fold control. */
export type ThreadReplyRow =
  | {
      kind: 'post';
      post: PostRow;
      /** Drawn with the rail into the previous row (conversation run). */
      connectedToPrevious: boolean;
    }
  | { kind: 'more'; branchKey: string; hiddenCount: number };

/**
 * Flatten the reply tree into display rows for the thread page:
 *
 * - The root author's own thread leads: their self-reply run, connected by
 *   the rail. Replies from others to mid-thread posts are not inlined —
 *   each post's own page shows them.
 * - Then each branch (someone else's reply), divider-separated: the branch
 *   post plus at most ONE reply from its conversation line (the root
 *   author's response when present). Longer exchanges fold behind a spring
 *   coil `Show N more` row that expands in place.
 */
export function buildReplyRows(
  nodes: ThreadNode[],
  rootAuthor: string | undefined,
  expandedBranches: ReadonlySet<string>
): ThreadReplyRow[] {
  const rows: ThreadReplyRow[] = [];

  const pushPost = (post: PostRow, connected: boolean) =>
    rows.push({ kind: 'post', post, connectedToPrevious: connected });

  const emitAuthorRun = (node: ThreadNode) => {
    pushPost(node.post, false);
    let cursor = node;
    for (;;) {
      const next = cursor.replies.find(
        (reply) => reply.post.accountId === rootAuthor
      );
      if (!next) break;
      pushPost(next.post, true);
      cursor = next;
    }
  };

  const conversationLine = (branch: ThreadNode): ThreadNode[] => {
    const branchAuthor = branch.post.accountId;
    const line: ThreadNode[] = [];
    let cursor = branch;
    for (;;) {
      const next =
        cursor.replies.find(
          (reply) => rootAuthor && reply.post.accountId === rootAuthor
        ) ??
        cursor.replies.find(
          (reply) => reply.post.accountId === branchAuthor
        );
      if (!next) break;
      line.push(next);
      cursor = next;
    }
    return line;
  };

  const emitBranch = (branch: ThreadNode) => {
    pushPost(branch.post, false);
    const line = conversationLine(branch);
    if (line.length === 0) return;

    const branchKey = postKey(branch.post);
    if (expandedBranches.has(branchKey)) {
      for (const node of line) pushPost(node.post, true);
      return;
    }

    pushPost(line[0]!.post, true);
    const hiddenCount = line.length - 1;
    if (hiddenCount > 0) rows.push({ kind: 'more', branchKey, hiddenCount });
  };

  const authorNodes = rootAuthor
    ? nodes.filter((node) => node.post.accountId === rootAuthor)
    : [];
  const branchNodes = nodes.filter((node) => !authorNodes.includes(node));

  for (const node of authorNodes) emitAuthorRun(node);
  for (const node of branchNodes) emitBranch(node);

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i]!;
    const previous = rows[i - 1]!;
    if (
      row.kind === 'post' &&
      previous.kind === 'post' &&
      !row.connectedToPrevious &&
      previous.post.accountId === row.post.accountId
    ) {
      row.connectedToPrevious = true;
    }
  }

  return rows;
}

/** Depth-first posts of the reply tree (for reconcile and engagement). */
export function flattenTreePosts(nodes: ThreadNode[]): PostRow[] {
  return nodes.flatMap((node) => [
    node.post,
    ...flattenTreePosts(node.replies),
  ]);
}

export function leafThreadNode(post: PostRow, path: string): ThreadNode {
  return { post, path, edge: 'reply', depth: 1, replies: [], quotes: [] };
}

/** Drop locally-confirmed rows once the indexed list contains them. */
export function withoutIndexedPosts(
  local: PostRow[],
  indexed: PostRow[]
): PostRow[] {
  const indexedKeys = new Set(indexed.map(postKey));
  const kept: PostRow[] = [];
  for (const row of local) {
    if (indexedKeys.has(postKey(row))) {
      revokeOptimisticMediaPreviewUrls(row.value);
    } else {
      kept.push(row);
    }
  }
  return kept;
}
