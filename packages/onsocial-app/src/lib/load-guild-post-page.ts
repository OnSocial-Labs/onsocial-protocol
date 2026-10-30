import { cache } from 'react';
import type { PostRow, ThreadNode } from '@onsocial/sdk';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';
import {
  hydrateScarceEmbedsForPosts,
  loadPostEngagementMap,
  type PostEngagementMap,
  type PostScarceEmbedMap,
} from '@/lib/feed-paint-hydrate';
import { THREAD_QUOTE_PAGE_SIZE } from '@/lib/load-personal-post-page';
import {
  THREAD_REPLY_FIRST_PAGE,
  directRepliesToTree,
  directReplyPageHasMore,
} from '@/lib/thread-first-page';

export type GuildPostPageData = {
  root: PostRow;
  replies: PostRow[];
  quotes: PostRow[];
  replyTree: ThreadNode[];
  hasMoreReplies: boolean;
  /** The server already fetched the direct-reply page, including an empty one. */
  directRepliesResolved?: boolean;
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
      const replyFetch = os.query.groups
        .thread(postRef, { limit: THREAD_REPLY_FIRST_PAGE })
        .then(
          (rows) => ({ ok: true as const, rows }),
          () => ({ ok: false as const, rows: [] as PostRow[] })
        );
      const [rootResult, quotesResult, replyResult, shellRows] =
        await Promise.all([
          os.query.groups.post(postRef),
          os.query.groups
            .quotes(postRef, {
              limit: THREAD_QUOTE_PAGE_SIZE,
              order: 'desc',
            })
            .catch(() => [] as PostRow[]),
          replyFetch,
          os.query.groups.byIds([gid]).catch(() => []),
        ]);

      if (!rootResult) return null;
      const replyPage = replyResult.rows;
      const replyTree = directRepliesToTree(replyPage);
      const quotes = quotesResult;
      const shell = shellRows[0] ?? null;
      const paintPosts = [rootResult, ...quotes, ...replyPage];
      const [engagement, scarceEmbeds] = await Promise.all([
        loadPostEngagementMap(os, paintPosts),
        hydrateScarceEmbedsForPosts(os, paintPosts),
      ]);
      return {
        root: rootResult,
        replies: replyPage,
        quotes,
        replyTree,
        hasMoreReplies: directReplyPageHasMore(replyPage.length),
        directRepliesResolved: replyResult.ok,
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
