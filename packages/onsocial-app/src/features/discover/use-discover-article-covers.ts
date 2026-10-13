'use client';

import { useEffect, useState } from 'react';
import {
  fetchIndexedPostsByRefs,
  indexedPostRefKey,
} from '@/lib/fetch-personal-post';
import {
  resolveArticleCover,
  type ResolvedArticleCover,
} from '@/lib/article-post-payload';

export type DiscoverArticleCover = ResolvedArticleCover & {
  issuedAt: number;
};

export function discoverArticleCoverFromPost(post: {
  value: string;
  blockTimestamp?: number | string | null;
}): DiscoverArticleCover {
  const cover = resolveArticleCover({ value: post.value });
  const issued = Number(post.blockTimestamp);
  return {
    ...cover,
    issuedAt: Number.isFinite(issued) ? issued : 0,
  };
}

function articleCoverKey(accountId: string, postId: string): string {
  return `${accountId}/${postId}`;
}

/** Covers for the essays already listed. One batch, same rule as the shelf. */
export function useDiscoverArticleCovers(
  articles: Array<{ accountId: string; postId: string }>
): Record<string, DiscoverArticleCover> {
  const key = articles
    .map((article) => indexedPostRefKey(article.accountId, article.postId))
    .join('\n');
  const [covers, setCovers] = useState<Record<string, DiscoverArticleCover>>(
    {}
  );

  useEffect(() => {
    const refs = key
      .split('\n')
      .filter(Boolean)
      .map((entry) => {
        const splitAt = entry.indexOf('\0');
        return {
          author: splitAt >= 0 ? entry.slice(0, splitAt) : '',
          postId: splitAt >= 0 ? entry.slice(splitAt + 1) : '',
        };
      })
      .filter((ref) => ref.author && ref.postId);
    if (refs.length === 0) return;
    let cancelled = false;
    const handle = window.setTimeout(() => {
      void fetchIndexedPostsByRefs(refs)
        .then((posts) => {
          if (cancelled) return;
          const next: Record<string, DiscoverArticleCover> = {};
          for (const ref of refs) {
            const post = posts.get(indexedPostRefKey(ref.author, ref.postId));
            if (!post) continue;
            next[articleCoverKey(ref.author, ref.postId)] =
              discoverArticleCoverFromPost(post);
          }
          setCovers(next);
        })
        .catch(() => {
          if (!cancelled) setCovers({});
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [key]);

  return covers;
}

export function discoverArticleCoverKey(
  accountId: string,
  postId: string
): string {
  return articleCoverKey(accountId, postId);
}
