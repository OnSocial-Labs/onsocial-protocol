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
import { moreWritingByAuthor } from '@/lib/more-writing-by-author';
import { resolveAccountId } from '@/lib/resolve-account';

export const WRITING_SHELF_FETCH_LIMIT = 48;

export type WritingShelfPageCursor = {
  offset?: number;
  beforeBlockHeight?: number;
  beforePostKey?: string;
};

export type WritingShelfWindow = {
  articles: PostRow[];
  hasMore: boolean;
  nextBeforeBlockHeight?: number;
  nextBeforeEventKey?: string;
};

export type PortfolioWritingPageData = {
  accountId: string;
  titleLabel: string;
  avatarUrl: string | null;
  mood: ResolvedMood;
  articles: PostRow[];
  /** False when the article read failed. Do not treat that as zero articles. */
  articlesKnown: boolean;
  coverHints: Record<string, WritingArticleCoverHint>;
  /** True when another shelf window may exist after this one. */
  articleHasMore: boolean;
  /** Chrono keyset height — pair with `articleNextBeforeEventKey`. */
  articleNextBeforeBlockHeight?: number;
  /** Content-path tie-break — pair with `articleNextBeforeBlockHeight`. */
  articleNextBeforeEventKey?: string;
};

/**
 * One shelf window. Articles have carried `kind: 'longform'` since the
 * shelf launched, so the server filters — one query instead of walking
 * raw feed pages. `isArticlePost` stays the exact gate: a longform row
 * whose payload lost its title is not an article.
 */
export async function fetchAuthorArticleWindow(
  os: OnSocial,
  accountId: string,
  cursor: WritingShelfPageCursor = {},
  limit = WRITING_SHELF_FETCH_LIMIT
): Promise<WritingShelfWindow> {
  const before =
    cursor.beforeBlockHeight != null && cursor.beforePostKey
      ? {
          beforeBlockHeight: cursor.beforeBlockHeight,
          beforePostKey: cursor.beforePostKey,
        }
      : {};
  const page = await os.query.feed.recent({
    author: accountId,
    limit,
    ...(before.beforeBlockHeight != null
      ? before
      : { offset: cursor.offset ?? 0 }),
    section: 'posts',
    kind: 'longform',
  });
  const nextBeforeBlockHeight = page.nextBeforeBlockHeight;
  const nextBeforeEventKey = page.nextBeforeEventKey?.trim() || undefined;
  // Shelf load-more is keyset-only — do not treat bare nextOffset as has-more.
  const hasMore =
    nextBeforeBlockHeight !== undefined && Boolean(nextBeforeEventKey);
  return {
    articles: page.items.filter(isArticlePost),
    hasMore,
    nextBeforeBlockHeight,
    nextBeforeEventKey,
  };
}

export type PortfolioWritingArticlePageData = PortfolioWritingPageData & {
  post: PostRow | null;
};

export const fetchAccountArticles = cache(
  async (
    accountId: string,
    limit = WRITING_SHELF_FETCH_LIMIT
  ): Promise<WritingShelfWindow & { known: boolean }> => {
    try {
      const os = createServerOnSocialClient();
      const page = await fetchAuthorArticleWindow(os, accountId, {}, limit);
      return { ...page, known: true };
    } catch {
      return {
        articles: [],
        hasMore: false,
        known: false,
      };
    }
  }
);

/**
 * Whether this author's first shelf window has an article.
 * Null when the read failed or a later page might still hold one.
 * Same window as the shelf (`fetchAuthorArticleWindow`).
 */
export const fetchAuthorArticlePresence = cache(
  async (accountId: string): Promise<boolean | null> => {
    const page = await fetchAccountArticles(accountId);
    if (!page.known) return null;
    if (page.articles.length > 0) return true;
    if (page.hasMore) return null;
    return false;
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
    articlesKnown: true,
    coverHints: {},
    articleHasMore: false,
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

function writingShelfCursors(feed: WritingShelfWindow): Pick<
  PortfolioWritingPageData,
  | 'articleHasMore'
  | 'articleNextBeforeBlockHeight'
  | 'articleNextBeforeEventKey'
> {
  return {
    articleHasMore: feed.hasMore,
    articleNextBeforeBlockHeight: feed.nextBeforeBlockHeight,
    articleNextBeforeEventKey: feed.nextBeforeEventKey,
  };
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
      articlesKnown: false,
      coverHints: {},
      articleHasMore: false,
    };
  }
);

export const loadPortfolioWritingForAccount = cache(
  async (accountId: string): Promise<PortfolioWritingPageData> => {
    const [chrome, feed] = await Promise.all([
      loadPortfolioWritingChrome(accountId),
      fetchAccountArticles(accountId),
    ]);

    // Titles paint with the post payload. Scarce covers fill in on the client.
    return {
      ...chrome,
      articles: feed.articles,
      articlesKnown: feed.known,
      coverHints: {},
      ...writingShelfCursors(feed),
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
  const [chrome, post, feed] = await Promise.all([
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
    fetchAccountArticles(accountId),
  ]);

  const articles = feed.articles;
  const article = post && isArticlePost(post) ? post : null;
  const toHydrate = article
    ? [
        article,
        ...moreWritingByAuthor(articles, {
          accountId: article.accountId,
          postId: article.postId,
        }).items,
      ]
    : articles;

  let coverHints: Record<string, WritingArticleCoverHint> = {};
  try {
    const os = createServerOnSocialClient();
    coverHints = await hydrateWritingArticleCovers(toHydrate, os);
  } catch {
    coverHints = {};
  }

  if (!article) {
    return {
      ...chrome,
      articles,
      articlesKnown: feed.known,
      coverHints,
      ...writingShelfCursors(feed),
      post: null,
    };
  }

  return {
    ...chrome,
    articles,
    articlesKnown: feed.known,
    coverHints,
    ...writingShelfCursors(feed),
    post: article,
  };
}
