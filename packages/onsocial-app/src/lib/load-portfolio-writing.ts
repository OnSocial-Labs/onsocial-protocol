import { cache } from 'react';
import { notFound } from 'next/navigation';
import type { PostRow } from '@onsocial/sdk';
import { isArticlePost } from '@/lib/article-post-payload';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';
import { fetchPersonalPost } from '@/lib/fetch-personal-post';
import { fetchPublicPageData } from '@/lib/page-data';
import { resolvePortfolioMood } from '@/lib/moods/resolve';
import type { ResolvedMood } from '@/lib/moods/types';
import { displayName } from '@/lib/profile-display';
import { loadProfileShell } from '@/lib/profile-shell';
import { resolveAccountId } from '@/lib/resolve-account';

export const WRITING_SHELF_FETCH_LIMIT = 48;

export type PortfolioWritingPageData = {
  accountId: string;
  titleLabel: string;
  avatarUrl: string | null;
  mood: ResolvedMood;
  articles: PostRow[];
};

export type PortfolioWritingArticlePageData = PortfolioWritingPageData & {
  post: PostRow;
};

export const fetchAccountArticles = cache(
  async (accountId: string, limit = WRITING_SHELF_FETCH_LIMIT): Promise<PostRow[]> => {
    try {
      const os = createServerOnSocialClient();
      const page = await os.query.feed.recent({
        author: accountId,
        limit,
        section: 'posts',
      });
      return page.items.filter(isArticlePost);
    } catch {
      return [];
    }
  }
);

export const loadPortfolioWritingForAccount = cache(
  async (accountId: string): Promise<PortfolioWritingPageData> => {
    const data = await fetchPublicPageData(accountId);
    if (!data) {
      notFound();
    }

    const [shell, articles] = await Promise.all([
      loadProfileShell(accountId),
      fetchAccountArticles(accountId),
    ]);
    const titleLabel = displayName(accountId, shell?.name ?? undefined);

    return {
      accountId,
      titleLabel,
      avatarUrl: shell?.avatarUrl ?? null,
      mood: resolvePortfolioMood(data.config),
      articles,
    };
  }
);

export async function loadPortfolioWritingPage(
  params: Promise<{ accountId: string }>
): Promise<PortfolioWritingPageData> {
  const accountId = await resolveAccountId(params);
  return loadPortfolioWritingForAccount(accountId);
}

export async function loadPortfolioWritingArticlePage(
  params: Promise<{ accountId: string; postId: string }>
): Promise<PortfolioWritingArticlePageData> {
  const resolved = await params;
  const accountId = await resolveAccountId(
    Promise.resolve({ accountId: resolved.accountId })
  );
  const postId = decodeURIComponent(resolved.postId ?? '').trim();
  if (!postId) {
    notFound();
  }

  const [page, post] = await Promise.all([
    loadPortfolioWritingForAccount(accountId),
    (async () => {
      try {
        const os = createServerOnSocialClient();
        return await fetchPersonalPost({ author: accountId, postId }, os);
      } catch {
        return null;
      }
    })(),
  ]);

  if (!post || !isArticlePost(post)) {
    notFound();
  }

  return { ...page, post };
}
