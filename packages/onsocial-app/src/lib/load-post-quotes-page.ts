import { cache } from 'react';
import type { PostRow, ReposterRow } from '@onsocial/sdk';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';
import {
  hydrateScarceEmbedsForPosts,
  loadPostEngagementMap,
  type PostEngagementMap,
  type PostScarceEmbedMap,
} from '@/lib/feed-paint-hydrate';
import { fetchIndexedPost } from '@/lib/fetch-personal-post';
import { THREAD_QUOTE_PAGE_SIZE } from '@/lib/load-personal-post-page';

export const POST_QUOTES_PAGE_SIZE = THREAD_QUOTE_PAGE_SIZE;
export const POST_REPOSTERS_PAGE_SIZE = 50;

export type PostQuotesPageData = {
  root: PostRow;
  quotes: PostRow[];
  reposters: ReposterRow[];
  hasMoreQuotes: boolean;
  hasMoreReposters: boolean;
  engagement: PostEngagementMap;
  scarceEmbeds: PostScarceEmbedMap;
};

/**
 * SSR quotes/reposts screen shell from the indexer. Works for personal and
 * guild posts — `fetchIndexedPost` resolves either by author + id.
 */
export const loadPostQuotesPageData = cache(
  async (
    author: string,
    postId: string
  ): Promise<PostQuotesPageData | null> => {
    const accountId = author.trim();
    const id = postId.trim();
    if (!accountId || !id) return null;

    try {
      const os = createServerOnSocialClient();
      const root = await fetchIndexedPost({ author: accountId, postId: id });
      if (!root) return null;

      const path = root.groupId
        ? `${accountId}/groups/${root.groupId}/content/post/${id}`
        : `${accountId}/post/${id}`;

      const [quotes, reposters] = await Promise.all([
        os.query.threads
          .quotesByPath(path, { limit: POST_QUOTES_PAGE_SIZE, order: 'desc' })
          .catch(() => [] as PostRow[]),
        os.query.threads
          .repostersByPath(path, { limit: POST_REPOSTERS_PAGE_SIZE })
          .catch(() => [] as ReposterRow[]),
      ]);

      const paintPosts = [root, ...quotes];
      const [engagement, scarceEmbeds] = await Promise.all([
        loadPostEngagementMap(os, paintPosts),
        hydrateScarceEmbedsForPosts(os, paintPosts),
      ]);

      return {
        root,
        quotes,
        reposters,
        hasMoreQuotes: quotes.length >= POST_QUOTES_PAGE_SIZE,
        hasMoreReposters: reposters.length >= POST_REPOSTERS_PAGE_SIZE,
        engagement,
        scarceEmbeds,
      };
    } catch {
      return null;
    }
  }
);
