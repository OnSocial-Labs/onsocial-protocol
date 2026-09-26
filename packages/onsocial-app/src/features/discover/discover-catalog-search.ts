import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { fetchDiscoverProfiles } from '@/lib/discover-profiles';
import {
  isArticlePost,
  parseArticleSnapshot,
} from '@/lib/article-post-payload';
import {
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
};

function ilikeContains(query: string): string {
  const cleaned = query.trim().replace(/[%_\\]/g, '');
  return `%${cleaned}%`;
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
  const client = createReadOnlyOnSocialClient();
  const res = await client.query.graphql<{
    postsCurrent: Array<{ accountId: string; postId: string; value: string }>;
  }>({
    query: `
      query DiscoverArticles($search: String!, $article: String!, $limit: Int!) {
        postsCurrent(
          where: {
            isGroupContent: { _eq: false }
            _and: [
              { value: { _ilike: $search } }
              { value: { _ilike: $article } }
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
      search: ilikeContains(query),
      article: '%"article":%',
      limit: ARTICLE_SCAN_LIMIT,
    },
  });
  const articles: DiscoverCatalogArticle[] = [];
  for (const row of res.data?.postsCurrent ?? []) {
    if (!isArticlePost(row)) continue;
    const article = parseArticleSnapshot(row.value);
    if (!article) continue;
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
  const client = createReadOnlyOnSocialClient();
  const facetId = catalogFacetIdForQuery(query, medium);
  const or = [
    '{ title: { _ilike: $search } }',
    '{ creatorId: { _ilike: $search } }',
  ];
  if (facetId) or.push('{ extraJson: { _ilike: $facet } }');
  const res = await client.query.graphql<{
    scarcesCollectionsCurrent: Array<
      CatalogDropMatchRow & { collectionId: string }
    >;
  }>({
    query: `
      query DiscoverDrops($search: String!, $medium: String!, $limit: Int!${
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
        }
      }
    `,
    variables: {
      search: ilikeContains(query),
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
  const failed = [people, articles, books, music, events].every(
    (entry) => !entry.ok
  );
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
  };
}
