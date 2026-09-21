import { cache } from 'react';
import type { PostRow } from '@onsocial/sdk';
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
};

export type PortfolioWritingArticlePageData = PortfolioWritingPageData & {
  post: PostRow | null;
};

export const fetchAccountArticles = cache(
  async (
    accountId: string,
    limit = WRITING_SHELF_FETCH_LIMIT
  ): Promise<PostRow[]> => {
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
    };
  }
);

export const loadPortfolioWritingForAccount = cache(
  async (accountId: string): Promise<PortfolioWritingPageData> => {
    const [chrome, articles] = await Promise.all([
      loadPortfolioWritingChrome(accountId),
      fetchAccountArticles(accountId),
    ]);

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
