import { cache } from 'react';
import type { PostRow, ThreadNode } from '@onsocial/sdk';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';
import {
  hydrateScarceEmbedsForPosts,
  loadPostEngagementMap,
  type PostEngagementMap,
  type PostScarceEmbedMap,
} from '@/lib/feed-paint-hydrate';
import { fetchPersonalPost } from '@/lib/fetch-personal-post';
import { personalPostContentPath } from '@/lib/post-routes';
import {
  THREAD_REPLY_FIRST_PAGE,
  directRepliesToTree,
  directReplyPageHasMore,
  graftVisibleReplies,
  visibleReplyPaths,
} from '@/lib/thread-first-page';

export const THREAD_REPLY_PAGE_SIZE = 50;
export const THREAD_QUOTE_PAGE_SIZE = 12;
export const THREAD_REPLY_TREE_DEPTH = 6;
export const THREAD_REPLY_TREE_MAX_NODES = 300;

export type PersonalPostPageData = {
  root: PostRow;
  replies: PostRow[];
  quotes: PostRow[];
  replyTree: ThreadNode[];
  hasMoreReplies: boolean;
  /**
   * The server already fetched the direct-reply page. An empty list is a
   * real empty thread, not a feed seed still waiting on the indexer.
   */
  directRepliesResolved?: boolean;
  engagement: PostEngagementMap;
  scarceEmbeds: PostScarceEmbedMap;
};

/** SSR personal thread shell from indexer (wallet/ACL still client). */
export const loadPersonalPostPageData = cache(
  async (
    author: string,
    postId: string
  ): Promise<PersonalPostPageData | null> => {
    const accountId = author.trim();
    const id = postId.trim();
    if (!accountId || !id) return null;

    try {
      const os = createServerOnSocialClient();
      const rootPath = personalPostContentPath(accountId, id);
      const replyFetch = os.query.threads
        .repliesByPath(rootPath, { limit: THREAD_REPLY_FIRST_PAGE })
        .then(
          (rows) => ({ ok: true as const, rows }),
          () => ({ ok: false as const, rows: [] as PostRow[] })
        );
      const [root, quotesResult, replyResult] = await Promise.all([
        fetchPersonalPost({ author: accountId, postId: id }, os),
        os.query.threads
          .quotes(accountId, id, {
            limit: THREAD_QUOTE_PAGE_SIZE,
            order: 'desc',
          })
          .catch(() => [] as PostRow[]),
        replyFetch,
      ]);

      if (!root) return null;
      const replyPage = replyResult.rows;
      const visibleChildren = replyResult.ok
        ? await os.query.threads
            .visibleReplies(visibleReplyPaths(replyPage))
            .catch(() => [] as PostRow[])
        : [];
      const replyTree = graftVisibleReplies(
        directRepliesToTree(replyPage),
        visibleChildren
      );
      const quotes = quotesResult;
      const paintPosts = [root, ...quotes, ...replyPage, ...visibleChildren];
      const [engagement, scarceEmbeds] = await Promise.all([
        loadPostEngagementMap(os, paintPosts),
        hydrateScarceEmbedsForPosts(os, paintPosts),
      ]);
      return {
        root,
        replies: replyPage,
        quotes,
        replyTree,
        hasMoreReplies: directReplyPageHasMore(replyPage.length),
        directRepliesResolved: replyResult.ok,
        engagement,
        scarceEmbeds,
      };
    } catch {
      return null;
    }
  }
);
