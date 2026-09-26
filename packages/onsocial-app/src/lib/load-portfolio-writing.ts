import { cache } from 'react';
import type { OnSocial, PostRow } from '@onsocial/sdk';
import { isArticlePost } from '@/lib/article-post-payload';
import { createServerOnSocialClient } from '@/lib/create-server-onsocial-client';
import {
  E2E_GRAPH_COOKIE,
  e2eGraphStubsAllowed,
  isE2eWritingShelfCookie,
} from '@/lib/e2e-graph-stubs';
import { fetchPersonalPost } from '@/lib/fetch-personal-post';
import {
  hydrateWritingArticleCovers,
  type WritingArticleCoverHint,
} from '@/lib/hydrate-writing-article-covers';
import { resolvePortfolioMood } from '@/lib/moods/resolve';
import type { ResolvedMood } from '@/lib/moods/types';
import type { PublicPageConfig } from '@/lib/page-data';
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
  coverHints: Record<string, WritingArticleCoverHint>;
  /** Next `feed.recent` offset. Null when this page was the last. */
  articleNextOffset: number | null;
};

/**
 * One shelf window. Skips post pages that contain no articles so a scroll
 * still reveals the next piece.
 */
export async function fetchAuthorArticleWindow(
  os: OnSocial,
  accountId: string,
  offset: number,
  limit = WRITING_SHELF_FETCH_LIMIT
): Promise<{ articles: PostRow[]; nextOffset: number | null }> {
  const found: PostRow[] = [];
  let cursor: number | null = offset;
  let rounds = 0;
  while (cursor != null && found.length === 0 && rounds < 6) {
    const page = await os.query.feed.recent({
      author: accountId,
      limit,
      offset: cursor,
      section: 'posts',
    });
    found.push(...page.items.filter(isArticlePost));
    cursor = page.nextOffset ?? null;
    rounds += 1;
  }
  return { articles: found, nextOffset: cursor };
}

export type PortfolioWritingArticlePageData = PortfolioWritingPageData & {
  post: PostRow | null;
};

export const fetchAccountArticles = cache(
  async (
    accountId: string,
    limit = WRITING_SHELF_FETCH_LIMIT
  ): Promise<{ articles: PostRow[]; nextOffset: number | null }> => {
    try {
      const os = createServerOnSocialClient();
      return await fetchAuthorArticleWindow(os, accountId, 0, limit);
    } catch {
      return { articles: [], nextOffset: null };
    }
  }
);

async function e2eWritingShelfChrome(
  accountId: string
): Promise<PortfolioWritingPageData | null> {
  if (!e2eGraphStubsAllowed()) return null;
  try {
    const { cookies } = await import('next/headers');
    const value = (await cookies()).get(E2E_GRAPH_COOKIE)?.value;
    if (!isE2eWritingShelfCookie(value)) return null;
  } catch {
    return null;
  }
  return {
    accountId,
    titleLabel: displayName(accountId, 'Alice'),
    avatarUrl: null,
    mood: resolvePortfolioMood({}),
    articles: [],
    coverHints: {},
    articleNextOffset: null,
  };
}

async function loadWritingPageConfig(
  accountId: string
): Promise<PublicPageConfig> {
  try {
    const os = createServerOnSocialClient();
    const config = await os.query.pages.getConfig(accountId);
    return (config ?? {}) as PublicPageConfig;
  } catch {
    return {};
  }
}

const loadPortfolioWritingChrome = cache(
  async (accountId: string): Promise<PortfolioWritingPageData> => {
    const stubChrome = await e2eWritingShelfChrome(accountId);
    if (stubChrome) return stubChrome;

    const [shell, config] = await Promise.all([
      loadProfileShell(accountId),
      loadWritingPageConfig(accountId),
    ]);
    return {
      accountId,
      titleLabel: displayName(accountId, shell?.name ?? undefined),
      avatarUrl: shell?.avatarUrl ?? null,
      mood: resolvePortfolioMood(config),
      articles: [],
      coverHints: {},
      articleNextOffset: null,
    };
  }
);

export const loadPortfolioWritingForAccount = cache(
  async (accountId: string): Promise<PortfolioWritingPageData> => {
    const [chrome, feed] = await Promise.all([
      loadPortfolioWritingChrome(accountId),
      fetchAccountArticles(accountId),
    ]);
    const articles = feed.articles;

    let coverHints: Record<string, WritingArticleCoverHint> = {};
    try {
      const os = createServerOnSocialClient();
      coverHints = await hydrateWritingArticleCovers(articles, os);
    } catch {
      coverHints = {};
    }

    return {
      ...chrome,
      articles,
      coverHints,
      articleNextOffset: feed.nextOffset,
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
  const [chrome, post] = await Promise.all([
    loadPortfolioWritingChrome(accountId),
    (async () => {
      if (!postId) return null;
      try {
        const os = createServerOnSocialClient();
        return await fetchPersonalPost({ author: accountId, postId }, os);
      } catch {
        return null;
      }
    })(),
  ]);

  const article = post && isArticlePost(post) ? post : null;
  if (!article) {
    return {
      ...(await loadPortfolioWritingForAccount(accountId)),
      post: null,
    };
  }

  let coverHints: Record<string, WritingArticleCoverHint> = {};
  try {
    const os = createServerOnSocialClient();
    coverHints = await hydrateWritingArticleCovers([article], os);
  } catch {
    coverHints = {};
  }

  return {
    ...chrome,
    coverHints,
    post: article,
  };
}
