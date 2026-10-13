import { resolveScarceMediaUrl } from '@/features/market/market-listings';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { fetchDiscoverProfiles } from '@/lib/discover-profiles';
import {
  isArticlePost,
  parseArticleSnapshot,
} from '@/lib/article-post-payload';
import {
  articleRowsPage,
  catalogArticleMatches,
  catalogCreatorIlike,
  catalogDropMatches,
  catalogDropMeta,
  catalogFacetContainsPattern,
  catalogFacetIdForQuery,
  isArticlesSearchUnavailable,
  type ArticleSearchCursor,
  type CatalogDropMatchRow,
  DISCOVER_CATALOG_PREVIEW,
} from '@/features/discover/discover-catalog';

/** Slack so a facet match still fills the preview after title hits. */
const DROP_FETCH_LIMIT = 16;
const ARTICLE_SCAN_LIMIT = 40;
/** One page of the article list opened from More. */
export const DISCOVER_ARTICLE_PAGE = 24;

export type DiscoverCatalogPerson = {
  accountId: string;
  name: string;
  avatarUrl: string | null;
};

export type DiscoverCatalogArticle = {
  accountId: string;
  postId: string;
  title: string;
  blockHeight: number;
};

export type DiscoverCatalogDrop = {
  collectionId: string;
  title: string;
  meta: string;
  imageUrl: string | null;
};

export type DiscoverCatalogResults = {
  people: DiscoverCatalogPerson[];
  articles: DiscoverCatalogArticle[];
  books: DiscoverCatalogDrop[];
  music: DiscoverCatalogDrop[];
  events: DiscoverCatalogDrop[];
  peopleHasMore: boolean;
  articlesHasMore: boolean;
  booksHasMore: boolean;
  musicHasMore: boolean;
  eventsHasMore: boolean;
  failed: boolean;
  /** At least one section failed and at least one succeeded. */
  partial: boolean;
};

function ilikeContains(query: string): string {
  const cleaned = query.trim().replace(/[%_\\]/g, '');
  return `%${cleaned}%`;
}

/** JSON key as stored by `JSON.stringify` (`"title":"…"`). */
function fieldIlike(field: 'title' | 'excerpt', query: string): string {
  const cleaned = query.trim().replace(/[%_\\"]/g, '');
  return `%"${field}":"%${cleaned}%`;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** One quiet retry — Discover’s first paint can already be at the gateway limit. */
async function withRetry<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch {
    await wait(450);
    return run();
  }
}

function takePreview<T>(rows: T[]): { items: T[]; hasMore: boolean } {
  return {
    items: rows.slice(0, DISCOVER_CATALOG_PREVIEW),
    hasMore: rows.length > DISCOVER_CATALOG_PREVIEW,
  };
}

async function searchPeople(query: string): Promise<{
  items: DiscoverCatalogPerson[];
  hasMore: boolean;
}> {
  const page = await fetchDiscoverProfiles(query, null);
  const people = page.profiles.map((profile) => ({
    accountId: profile.accountId,
    name: profile.name?.trim() || profile.accountId,
    avatarUrl: profile.avatarUrl,
  }));
  const preview = takePreview(people);
  return {
    items: preview.items,
    hasMore: preview.hasMore || page.hasMore,
  };
}

function articleBlockHeight(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function emptyArticlePage(): {
  items: DiscoverCatalogArticle[];
  hasMore: boolean;
} {
  return { items: [], hasMore: false };
}

async function searchArticlesIndexed(
  query: string,
  limit: number,
  before: ArticleSearchCursor | null
): Promise<{ items: DiscoverCatalogArticle[]; hasMore: boolean }> {
  const creator = catalogCreatorIlike(query);
  if (!creator) return emptyArticlePage();
  const client = createReadOnlyOnSocialClient();
  const decls = [
    '$pattern: String!',
    '$prefix: String!',
    '$label: String!',
    '$limit: Int!',
  ];
  const variables: Record<string, unknown> = {
    pattern: ilikeContains(query),
    prefix: creator.prefix,
    label: creator.label,
    limit: limit + 1,
  };
  const cursor =
    before == null
      ? ''
      : `, { _or: [
          { blockHeight: { _lt: $before } },
          { blockHeight: { _eq: $before }, postId: { _lt: $beforeId } }
        ] }`;
  if (before) {
    decls.push('$before: bigint!', '$beforeId: String!');
    variables.before = before.blockHeight;
    variables.beforeId = before.postId;
  }
  const res = await client.query.graphql<{
    articlesSearch: Array<{
      accountId: string;
      postId: string;
      title: string;
      blockHeight: number | string;
    }>;
  }>({
    query: `
      query DiscoverArticles(${decls.join(', ')}) {
        articlesSearch(
          where: {
            _and: [
              { _or: [
                { title: { _ilike: $pattern } },
                { excerpt: { _ilike: $pattern } },
                { accountId: { _ilike: $prefix } },
                { accountId: { _ilike: $label } }
              ] }
              ${cursor}
            ]
          }
          orderBy: [{ blockHeight: DESC }, { postId: DESC }]
          limit: $limit
        ) {
          accountId
          postId
          title
          blockHeight
        }
      }
    `,
    variables,
  });
  const rows = (res.data?.articlesSearch ?? []).map((row) => ({
    accountId: row.accountId,
    postId: row.postId,
    title: row.title?.trim() || 'Article',
    blockHeight: articleBlockHeight(row.blockHeight),
  }));
  return {
    items: rows.slice(0, limit),
    hasMore: rows.length > limit,
  };
}

async function searchArticlesFallback(
  query: string,
  limit: number,
  before: ArticleSearchCursor | null
): Promise<{ items: DiscoverCatalogArticle[]; hasMore: boolean }> {
  const creator = catalogCreatorIlike(query);
  if (!creator) return emptyArticlePage();
  const client = createReadOnlyOnSocialClient();
  const res = await client.query.graphql<{
    postsCurrent: Array<{
      accountId: string;
      postId: string;
      value: string;
      blockHeight?: number | string | null;
    }>;
  }>({
    query: `
      query DiscoverArticlesFallback($title: String!, $excerpt: String!, $article: String!, $creatorPrefix: String!, $creatorLabel: String!, $limit: Int!) {
        postsCurrent(
          where: {
            isGroupContent: { _eq: false }
            value: { _ilike: $article }
            _or: [
              { value: { _ilike: $title } }
              { value: { _ilike: $excerpt } }
              { accountId: { _ilike: $creatorPrefix } }
              { accountId: { _ilike: $creatorLabel } }
            ]
          }
          orderBy: [{ blockHeight: DESC }]
          limit: $limit
        ) {
          accountId
          postId
          value
          blockHeight
        }
      }
    `,
    variables: {
      title: fieldIlike('title', query),
      excerpt: fieldIlike('excerpt', query),
      article: '%"article":%',
      creatorPrefix: creator.prefix,
      creatorLabel: creator.label,
      limit: ARTICLE_SCAN_LIMIT,
    },
  });
  const articles: DiscoverCatalogArticle[] = [];
  for (const row of res.data?.postsCurrent ?? []) {
    if (!isArticlePost(row)) continue;
    const article = parseArticleSnapshot(row.value);
    if (!article || !catalogArticleMatches(article, row.accountId, query)) {
      continue;
    }
    articles.push({
      accountId: row.accountId,
      postId: row.postId,
      title: article.title,
      blockHeight: articleBlockHeight(row.blockHeight),
    });
  }
  return articleRowsPage(articles, limit, before);
}

/** Title, excerpt, or author. Uses the essay index, then the post-body scan. */
export async function searchDiscoverArticles(
  query: string,
  opts?: { limit?: number; before?: ArticleSearchCursor | null }
): Promise<{ items: DiscoverCatalogArticle[]; hasMore: boolean }> {
  const limit = opts?.limit ?? DISCOVER_CATALOG_PREVIEW;
  const before = opts?.before ?? null;
  try {
    return await searchArticlesIndexed(query, limit, before);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!isArticlesSearchUnavailable(message)) throw error;
    return searchArticlesFallback(query, limit, before);
  }
}

async function searchDrops(
  medium: 'writing' | 'audio' | 'ticket',
  query: string
): Promise<{ items: DiscoverCatalogDrop[]; hasMore: boolean }> {
  const creator = catalogCreatorIlike(query);
  if (!creator) return { items: [], hasMore: false };
  const client = createReadOnlyOnSocialClient();
  const facetId = catalogFacetIdForQuery(query, medium);
  const or = [
    '{ title: { _ilike: $search } }',
    '{ creatorId: { _ilike: $creatorPrefix } }',
    '{ creatorId: { _ilike: $creatorLabel } }',
  ];
  if (facetId) or.push('{ extraJson: { _ilike: $facet } }');
  const res = await client.query.graphql<{
    scarcesCollectionsCurrent: Array<
      CatalogDropMatchRow & { collectionId: string; media: string | null }
    >;
  }>({
    query: `
      query DiscoverDrops($search: String!, $creatorPrefix: String!, $creatorLabel: String!, $medium: String!, $limit: Int!${
        facetId ? ', $facet: String!' : ''
      }) {
        scarcesCollectionsCurrent(
          where: {
            mediumKind: { _eq: $medium }
            banned: { _eq: false }
            cancelled: { _eq: false }
            _or: [${or.join(', ')}]
          }
          orderBy: [{ createdAt: DESC_NULLS_LAST }]
          limit: $limit
        ) {
          collectionId
          title
          creatorId
          mediumKind
          kind
          extraJson
          media
        }
      }
    `,
    variables: {
      search: ilikeContains(query),
      creatorPrefix: creator.prefix,
      creatorLabel: creator.label,
      medium,
      limit: DROP_FETCH_LIMIT,
      ...(facetId ? { facet: catalogFacetContainsPattern(facetId) } : {}),
    },
  });
  const drops = (res.data?.scarcesCollectionsCurrent ?? [])
    .filter((row) => catalogDropMatches(row, query, facetId))
    .map((row) => ({
      collectionId: row.collectionId,
      title: row.title?.trim() || row.collectionId,
      meta: catalogDropMeta(row),
      imageUrl: resolveScarceMediaUrl(row.media),
    }));
  return takePreview(drops);
}

export async function loadDiscoverCatalog(
  query: string
): Promise<DiscoverCatalogResults> {
  const [people, articles, books, music, events] = await Promise.all([
    withRetry(() => searchPeople(query)).then(
      (result) => ({ ok: true as const, result }),
      () => ({ ok: false as const })
    ),
    withRetry(() => searchDiscoverArticles(query)).then(
      (result) => ({ ok: true as const, result }),
      () => ({ ok: false as const })
    ),
    withRetry(() => searchDrops('writing', query)).then(
      (result) => ({ ok: true as const, result }),
      () => ({ ok: false as const })
    ),
    withRetry(() => searchDrops('audio', query)).then(
      (result) => ({ ok: true as const, result }),
      () => ({ ok: false as const })
    ),
    withRetry(() => searchDrops('ticket', query)).then(
      (result) => ({ ok: true as const, result }),
      () => ({ ok: false as const })
    ),
  ]);
  const statuses = [people, articles, books, music, events];
  const failed = statuses.every((entry) => !entry.ok);
  const partial = !failed && statuses.some((entry) => !entry.ok);
  return {
    people: people.ok ? people.result.items : [],
    articles: articles.ok ? articles.result.items : [],
    books: books.ok ? books.result.items : [],
    music: music.ok ? music.result.items : [],
    events: events.ok ? events.result.items : [],
    peopleHasMore: people.ok ? people.result.hasMore : false,
    articlesHasMore: articles.ok ? articles.result.hasMore : false,
    booksHasMore: books.ok ? books.result.hasMore : false,
    musicHasMore: music.ok ? music.result.hasMore : false,
    eventsHasMore: events.ok ? events.result.hasMore : false,
    failed,
    partial,
  };
}
