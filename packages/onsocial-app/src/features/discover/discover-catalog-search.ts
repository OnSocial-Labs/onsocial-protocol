import { resolveScarceMediaUrl } from '@/features/market/market-listings';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { fetchDiscoverProfiles } from '@/lib/discover-profiles';
import {
  isArticlePost,
  parseArticleSnapshot,
} from '@/lib/article-post-payload';
import {
  catalogArticleMatches,
  catalogCreatorIlike,
  catalogDropMatches,
  catalogDropMeta,
  catalogFacetContainsPattern,
  catalogFacetIdForQuery,
  type CatalogDropMatchRow,
  DISCOVER_CATALOG_PREVIEW,
} from '@/features/discover/discover-catalog';

/** Slack so a facet match still fills the preview after title hits. */
const DROP_FETCH_LIMIT = 16;
const ARTICLE_SCAN_LIMIT = 40;

export type DiscoverCatalogPerson = {
  accountId: string;
  name: string;
  avatarUrl: string | null;
};

export type DiscoverCatalogArticle = {
  accountId: string;
  postId: string;
  title: string;
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

async function searchArticles(
  query: string
): Promise<DiscoverCatalogArticle[]> {
  const creator = catalogCreatorIlike(query);
  if (!creator) return [];
  const client = createReadOnlyOnSocialClient();
  const res = await client.query.graphql<{
    postsCurrent: Array<{ accountId: string; postId: string; value: string }>;
  }>({
    query: `
      query DiscoverArticles($title: String!, $excerpt: String!, $article: String!, $creatorPrefix: String!, $creatorLabel: String!, $limit: Int!) {
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
    });
    if (articles.length >= DISCOVER_CATALOG_PREVIEW) break;
  }
  return articles;
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
    withRetry(() => searchArticles(query)).then(
      (items) => ({ ok: true as const, items }),
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
    articles: articles.ok ? articles.items : [],
    books: books.ok ? books.result.items : [],
    music: music.ok ? music.result.items : [],
    events: events.ok ? events.result.items : [],
    peopleHasMore: people.ok ? people.result.hasMore : false,
    booksHasMore: books.ok ? books.result.hasMore : false,
    musicHasMore: music.ok ? music.result.hasMore : false,
    eventsHasMore: events.ok ? events.result.hasMore : false,
    failed,
    partial,
  };
}
