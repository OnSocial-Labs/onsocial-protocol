import { cache } from 'react';
import type { PostRow, ThreadNode } from '@onsocial/sdk';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';
import { fetchPersonalPost } from '@/lib/fetch-personal-post';
import { personalPostContentPath } from '@/lib/post-routes';

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
  hasMoreQuotes: boolean;
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
      const [root, quotesResult, treeResult] = await Promise.all([
        fetchPersonalPost({ author: accountId, postId: id }),
        os.query.threads
          .quotes(accountId, id, {
            limit: THREAD_QUOTE_PAGE_SIZE,
            order: 'desc',
          })
          .catch(() => [] as PostRow[]),
        os.query.threads
          .treeByPath(rootPath, {
            depth: THREAD_REPLY_TREE_DEPTH,
            includeQuotes: false,
            replyLimit: THREAD_REPLY_PAGE_SIZE,
            maxNodes: THREAD_REPLY_TREE_MAX_NODES,
          })
          .catch(() => ({ replies: [] as ThreadNode[] })),
      ]);

      if (!root) return null;
      const replyTree = treeResult.replies ?? [];
      return {
        root,
        replies: replyTree.map((node) => node.post),
        quotes: quotesResult,
        replyTree,
        hasMoreReplies: replyTree.length >= THREAD_REPLY_PAGE_SIZE,
        hasMoreQuotes: quotesResult.length >= THREAD_QUOTE_PAGE_SIZE,
      };
    } catch {
      return null;
    }
  }
);
