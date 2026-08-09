import { cache } from 'react';
import type { PostRow, ThreadNode } from '@onsocial/sdk';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';
import {
  hydrateScarceEmbedsForPosts,
  loadPostEngagementMap,
  type PostEngagementMap,
  type PostScarceEmbedMap,
} from '@/lib/feed-paint-hydrate';
import {
  THREAD_QUOTE_PAGE_SIZE,
  THREAD_REPLY_PAGE_SIZE,
  THREAD_REPLY_TREE_DEPTH,
  THREAD_REPLY_TREE_MAX_NODES,
} from '@/lib/load-personal-post-page';
import { flattenTreePosts } from '@/lib/thread-display';

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
  engagement: PostEngagementMap;
  scarceEmbeds: PostScarceEmbedMap;
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
      const quotes = quotesResult;
      const shell = shellRows[0] ?? null;
      const paintPosts = [
        rootResult,
        ...quotes,
        ...flattenTreePosts(replyTree),
      ];
      const [engagement, scarceEmbeds] = await Promise.all([
        loadPostEngagementMap(os, paintPosts),
        hydrateScarceEmbedsForPosts(os, paintPosts),
      ]);
      return {
        root: rootResult,
        replies: replyTree.map((node) => node.post),
        quotes,
        replyTree,
        hasMoreReplies: replyTree.length >= THREAD_REPLY_PAGE_SIZE,
        hasMoreQuotes: quotes.length >= THREAD_QUOTE_PAGE_SIZE,
        guildName: shell?.groupName?.trim() || null,
        memberDriven: Boolean(shell?.isMemberDriven),
        accessGated: shell?.isPublic === false,
        engagement,
        scarceEmbeds,
      };
    } catch {
      return null;
    }
  }
);
