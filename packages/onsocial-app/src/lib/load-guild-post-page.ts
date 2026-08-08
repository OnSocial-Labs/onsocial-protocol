import { cache } from 'react';
import type { PostRow, ThreadNode } from '@onsocial/sdk';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';
import {
  THREAD_QUOTE_PAGE_SIZE,
  THREAD_REPLY_PAGE_SIZE,
  THREAD_REPLY_TREE_DEPTH,
  THREAD_REPLY_TREE_MAX_NODES,
} from '@/lib/load-personal-post-page';

export type GuildPostPageData = {
  root: PostRow;
  replies: PostRow[];
  quotes: PostRow[];
  replyTree: ThreadNode[];
  hasMoreReplies: boolean;
  hasMoreQuotes: boolean;
  guildName: string | null;
  memberDriven: boolean;
  accessGated: boolean;
};

/** SSR guild thread shell from indexer (structure/ACL still client). */
export const loadGuildPostPageData = cache(
  async (
    groupId: string,
    author: string,
    postId: string
  ): Promise<GuildPostPageData | null> => {
    const gid = groupId.trim();
    const accountId = author.trim();
    const id = postId.trim();
    if (!gid || !accountId || !id) return null;

    try {
      const os = createServerOnSocialClient();
      const postRef = { author: accountId, groupId: gid, postId: id };
      const [rootResult, quotesResult, treeResult, shellRows] =
        await Promise.all([
          os.query.groups.post(postRef),
          os.query.groups
            .quotes(postRef, {
              limit: THREAD_QUOTE_PAGE_SIZE,
              order: 'desc',
            })
            .catch(() => [] as PostRow[]),
          os.query.groups
            .threadTree(postRef, {
              depth: THREAD_REPLY_TREE_DEPTH,
              includeQuotes: false,
              replyLimit: THREAD_REPLY_PAGE_SIZE,
              maxNodes: THREAD_REPLY_TREE_MAX_NODES,
            })
            .catch(() => ({ replies: [] as ThreadNode[] })),
          os.query.groups.byIds([gid]).catch(() => []),
        ]);

      if (!rootResult) return null;
      const replyTree = treeResult.replies ?? [];
      const shell = shellRows[0] ?? null;
      return {
        root: rootResult,
        replies: replyTree.map((node) => node.post),
        quotes: quotesResult,
        replyTree,
        hasMoreReplies: replyTree.length >= THREAD_REPLY_PAGE_SIZE,
        hasMoreQuotes: quotesResult.length >= THREAD_QUOTE_PAGE_SIZE,
        guildName: shell?.groupName?.trim() || null,
        memberDriven: Boolean(shell?.isMemberDriven),
        accessGated: shell?.isPublic === false,
      };
    } catch {
      return null;
    }
  }
);
