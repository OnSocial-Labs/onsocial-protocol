// ---------------------------------------------------------------------------
// Feed queries — recent posts, account-set feeds, hashtag feeds.
// Accessed as `os.query.feed.<method>()`.
// ---------------------------------------------------------------------------

import type { QueryModule } from './index.js';
import type { FeedFilter, Paginated, PostRow } from './types.js';
import {
  FEED_POST_ROW_FIELDS,
  GraphQLValidationError,
  POST_ROW_FIELDS,
  audienceLikeValue,
  feedOrderByClause,
  type FeedSection,
  type FeedSort,
} from './_shared.js';

export type { FeedSection, FeedSort };

/** Set when GraphQL rejects `postsFeed` (view not tracked yet). */
let postsFeedUnavailable = false;

/** Set when GraphQL rejects `amplifyHeat` (column not tracked yet). */
let amplifyHeatUnavailable = false;

const FEED_POST_ROW_FIELDS_NO_HEAT = FEED_POST_ROW_FIELDS.replace(
  /\s*amplifyHeat\s*/,
  ' '
).trim();

function isPostsFeedUnavailableError(err: unknown): boolean {
  if (!(err instanceof GraphQLValidationError)) return false;
  const hay =
    `${err.message} ${err.errors.map((e) => e.message ?? '').join(' ')}`.toLowerCase();
  return (
    hay.includes('postsfeed') ||
    hay.includes('posts_feed') ||
    hay.includes('field "postsfeed"') ||
    hay.includes("field 'postsfeed'")
  );
}

function isAmplifyHeatUnavailableError(err: unknown): boolean {
  if (!(err instanceof GraphQLValidationError)) return false;
  const hay =
    `${err.message} ${err.errors.map((e) => e.message ?? '').join(' ')}`.toLowerCase();
  return hay.includes('amplifyheat') || hay.includes('amplify_heat');
}

export class FeedQuery {
  constructor(private _q: QueryModule) {}

  private async enrichFeedPosts(rows: PostRow[]): Promise<PostRow[]> {
    if (rows.length === 0) return rows;

    const accountIds = Array.from(
      new Set(
        rows
          .flatMap((row) => [row.accountId, row.refAuthor])
          .filter((id): id is string => Boolean(id?.trim()))
      )
    );
    const groupIds = Array.from(
      new Set(
        rows
          .map((row) => row.groupId)
          .filter((id): id is string => Boolean(id?.trim()))
      )
    );

    const [profiles, groups] = await Promise.all([
      accountIds.length > 0
        ? this._q.profiles.statsForAccounts(accountIds)
        : Promise.resolve([]),
      groupIds.length > 0
        ? this._q.groups.byIds(groupIds)
        : Promise.resolve([]),
    ]);

    const profileById = new Map(
      profiles.map((row) => [row.accountId, row] as const)
    );
    const groupById = new Map(groups.map((row) => [row.groupId, row] as const));

    return rows.map((row) => {
      const profile = profileById.get(row.accountId);
      const refProfile = row.refAuthor
        ? profileById.get(row.refAuthor)
        : undefined;
      const group = row.groupId ? groupById.get(row.groupId) : undefined;
      return {
        ...row,
        authorName: profile?.name ?? null,
        authorAvatar: profile?.avatar ?? null,
        groupName: group?.groupName ?? null,
        refAuthorName: refProfile?.name ?? null,
        refAuthorAvatar: refProfile?.avatar ?? null,
      };
    });
  }

  private async queryFeedRows(args: {
    postsFeedQuery: string;
    postsCurrentQuery: string;
    variables: Record<string, unknown>;
    /** Chrono-only postsFeed query when amplifyHeat is not tracked yet. */
    postsFeedQueryNoHeat?: string;
  }): Promise<PostRow[]> {
    if (!postsFeedUnavailable) {
      const feedQuery =
        amplifyHeatUnavailable && args.postsFeedQueryNoHeat
          ? args.postsFeedQueryNoHeat
          : args.postsFeedQuery;
      try {
        const res = await this._q.graphql<{ postsFeed: PostRow[] }>({
          query: feedQuery,
          variables: args.variables,
        });
        return res.data?.postsFeed ?? [];
      } catch (err) {
        if (
          !amplifyHeatUnavailable &&
          args.postsFeedQueryNoHeat &&
          isAmplifyHeatUnavailableError(err)
        ) {
          amplifyHeatUnavailable = true;
          const res = await this._q.graphql<{ postsFeed: PostRow[] }>({
            query: args.postsFeedQueryNoHeat,
            variables: args.variables,
          });
          return res.data?.postsFeed ?? [];
        }
        if (!isPostsFeedUnavailableError(err)) throw err;
        postsFeedUnavailable = true;
      }
    }

    const res = await this._q.graphql<{ postsCurrent: PostRow[] }>({
      query: args.postsCurrentQuery,
      variables: args.variables,
    });
    return this.enrichFeedPosts(res.data?.postsCurrent ?? []);
  }

  /**
   * Recent / hot posts, optionally filtered by author and section.
   *
   * `sort: 'hot'` orders by decaying amplify heat then block height
   * (`posts_feed.amplify_heat`). Falls back to chronological when the
   * enriched feed view is unavailable.
   *
   * `section` narrows server-side (indexer stores empty strings, not NULLs):
   * - `'posts'` — roots that are not repost shells
   * - `'replies'` — has a `parentPath`
   * - `'reposts'` — `refType === 'repost'`
   *
   * ```ts
   * const { items, nextOffset } = await os.query.feed.recent({ limit: 20, sort: 'hot' });
   * const replies = await os.query.feed.recent({ author: 'alice.near', section: 'replies' });
   * ```
   */
  async recent(
    opts: {
      author?: string;
      limit?: number;
      offset?: number;
      sort?: FeedSort;
      section?: FeedSection;
    } = {}
  ): Promise<Paginated<PostRow>> {
    const limit = opts.limit ?? 20;
    const offset = opts.offset ?? 0;
    const sort = opts.sort ?? 'recent';
    const orderBy = feedOrderByClause(sort);
    const hasAuthor = !!opts.author;
    const variables = {
      ...(hasAuthor ? { author: opts.author } : {}),
      limit,
      offset,
    };

    const conditions: string[] = [];
    if (hasAuthor) conditions.push('accountId: {_eq: $author}');
    if (opts.section === 'posts') {
      conditions.push('parentPath: {_eq: ""}', 'refType: {_neq: "repost"}');
    } else if (opts.section === 'replies') {
      conditions.push('parentPath: {_neq: ""}');
    } else if (opts.section === 'reposts') {
      conditions.push('refType: {_eq: "repost"}');
    }
    const whereClause =
      conditions.length > 0 ? `where: {${conditions.join(', ')}}, ` : '';
    const params = hasAuthor
      ? '$author: String!, $limit: Int!, $offset: Int!'
      : '$limit: Int!, $offset: Int!';

    const chronoOrder = feedOrderByClause('recent');
    const rows = await this.queryFeedRows({
      variables,
      postsFeedQuery: `query Posts(${params}) {
        postsFeed(${whereClause}limit: $limit, offset: $offset, orderBy: ${orderBy}) {
          ${FEED_POST_ROW_FIELDS}
        }
      }`,
      postsFeedQueryNoHeat: `query Posts(${params}) {
        postsFeed(${whereClause}limit: $limit, offset: $offset, orderBy: ${chronoOrder}) {
          ${FEED_POST_ROW_FIELDS_NO_HEAT}
        }
      }`,
      postsCurrentQuery: `query Posts(${params}) {
        postsCurrent(${whereClause}limit: $limit, offset: $offset, orderBy: [{blockHeight: DESC}]) {
          ${POST_ROW_FIELDS}
        }
      }`,
    });

    return {
      items: rows,
      nextOffset: rows.length >= limit ? offset + limit : undefined,
    };
  }

  /**
   * Feed from a list of accounts (e.g. accounts you stand with).
   *
   * ```ts
   * const accounts = await os.query.standings.outgoing('alice.near');
   * const { items } = await os.query.feed.fromAccounts({ accounts, limit: 20, sort: 'hot' });
   * ```
   */
  async fromAccounts(opts: {
    accounts: string[];
    limit?: number;
    offset?: number;
    sort?: FeedSort;
  }): Promise<Paginated<PostRow>> {
    if (opts.accounts.length === 0) return { items: [] };
    const limit = opts.limit ?? 20;
    const offset = opts.offset ?? 0;
    const sort = opts.sort ?? 'recent';
    const orderBy = feedOrderByClause(sort);
    const chronoOrder = feedOrderByClause('recent');
    const variables = { accounts: opts.accounts, limit, offset };

    const rows = await this.queryFeedRows({
      variables,
      postsFeedQuery: `query Feed($accounts: [String!]!, $limit: Int!, $offset: Int!) {
        postsFeed(
          where: {accountId: {_in: $accounts}},
          limit: $limit, offset: $offset,
          orderBy: ${orderBy}
        ) {
          ${FEED_POST_ROW_FIELDS}
        }
      }`,
      postsFeedQueryNoHeat: `query Feed($accounts: [String!]!, $limit: Int!, $offset: Int!) {
        postsFeed(
          where: {accountId: {_in: $accounts}},
          limit: $limit, offset: $offset,
          orderBy: ${chronoOrder}
        ) {
          ${FEED_POST_ROW_FIELDS_NO_HEAT}
        }
      }`,
      postsCurrentQuery: `query Feed($accounts: [String!]!, $limit: Int!, $offset: Int!) {
        postsCurrent(
          where: {accountId: {_in: $accounts}},
          limit: $limit, offset: $offset,
          orderBy: [{blockHeight: DESC}]
        ) {
          ${POST_ROW_FIELDS}
        }
      }`,
    });

    return {
      items: rows,
      nextOffset: rows.length >= limit ? offset + limit : undefined,
    };
  }

  /** Feed from a list of accounts, filtered by indexed post metadata. */
  async fromAccountsFiltered(opts: FeedFilter): Promise<Paginated<PostRow>> {
    if (opts.accounts.length === 0) return { items: [] };

    const limit = opts.limit ?? 20;
    const offset = opts.offset ?? 0;
    const filterExtras = `${opts.channel !== undefined ? ', $channel: String!' : ''}${opts.kind !== undefined ? ', $kind: String!' : ''}${opts.audience !== undefined ? ', $audienceLike: String!' : ''}`;
    const whereExtras = `${opts.channel !== undefined ? ', {channel: {_eq: $channel}}' : ''}${opts.kind !== undefined ? ', {kind: {_eq: $kind}}' : ''}${opts.audience !== undefined ? ', {audiences: {_like: $audienceLike}}' : ''}`;
    const variables = {
      accounts: opts.accounts,
      limit,
      offset,
      ...(opts.channel !== undefined ? { channel: opts.channel } : {}),
      ...(opts.kind !== undefined ? { kind: opts.kind } : {}),
      ...(opts.audience !== undefined
        ? { audienceLike: audienceLikeValue(opts.audience) }
        : {}),
    };

    const rows = await this.queryFeedRows({
      variables,
      postsFeedQuery: `query FilteredFeed($accounts: [String!]!, $limit: Int!, $offset: Int!${filterExtras}) {
        postsFeed(
          where: {_and: [
            {accountId: {_in: $accounts}}${whereExtras}
          ]},
          limit: $limit,
          offset: $offset,
          orderBy: [{blockHeight: DESC}]
        ) {
          ${FEED_POST_ROW_FIELDS}
        }
      }`,
      postsCurrentQuery: `query FilteredFeed($accounts: [String!]!, $limit: Int!, $offset: Int!${filterExtras}) {
        postsCurrent(
          where: {_and: [
            {accountId: {_in: $accounts}}${whereExtras}
          ]},
          limit: $limit,
          offset: $offset,
          orderBy: [{blockHeight: DESC}]
        ) {
          ${POST_ROW_FIELDS}
        }
      }`,
    });

    return {
      items: rows,
      nextOffset: rows.length >= limit ? offset + limit : undefined,
    };
  }

  /**
   * Posts tagged with a hashtag (paginated, newest first).
   * Hydrates full `postsFeed` / `postsCurrent` rows so list UIs get text/media.
   *
   * ```ts
   * const page = await os.query.feed.byHashtag('onchain', { limit: 20 });
   * ```
   */
  async byHashtag(
    hashtag: string,
    opts: { limit?: number; offset?: number } = {}
  ): Promise<Paginated<PostRow>> {
    const limit = opts.limit ?? 20;
    const offset = opts.offset ?? 0;
    const res = await this._q.graphql<{
      postHashtags: Array<{
        accountId: string;
        postId: string;
        hashtag: string;
        blockHeight: number;
        blockTimestamp: number;
        groupId: string | null;
      }>;
    }>({
      query: `query PostsByHashtag($tag: String!, $limit: Int!, $offset: Int!) {
        postHashtags(
          where: {hashtag: {_eq: $tag}},
          orderBy: [{blockHeight: DESC}],
          limit: $limit,
          offset: $offset
        ) {
          accountId postId hashtag blockHeight blockTimestamp groupId
        }
      }`,
      variables: {
        tag: hashtag.toLowerCase().replace(/^#/, ''),
        limit,
        offset,
      },
    });
    const stubs = res.data?.postHashtags ?? [];
    const nextOffset = stubs.length >= limit ? offset + limit : undefined;

    if (stubs.length === 0) {
      return { items: [], nextOffset };
    }

    const accountIds = Array.from(new Set(stubs.map((row) => row.accountId)));
    const postIds = Array.from(new Set(stubs.map((row) => row.postId)));
    const hydrateVariables = {
      accounts: accountIds,
      postIds,
      limit: Math.max(stubs.length * 2, limit),
    };

    const hydratedRows = await this.queryFeedRows({
      variables: hydrateVariables,
      postsFeedQuery: `query PostsByHashtagHydrate($accounts: [String!]!, $postIds: [String!]!, $limit: Int!) {
        postsFeed(
          where: {
            _and: [
              { accountId: { _in: $accounts } },
              { postId: { _in: $postIds } }
            ]
          },
          limit: $limit
        ) {
          ${FEED_POST_ROW_FIELDS}
        }
      }`,
      postsCurrentQuery: `query PostsByHashtagHydrate($accounts: [String!]!, $postIds: [String!]!, $limit: Int!) {
        postsCurrent(
          where: {
            _and: [
              { accountId: { _in: $accounts } },
              { postId: { _in: $postIds } }
            ]
          },
          limit: $limit
        ) {
          ${POST_ROW_FIELDS}
        }
      }`,
    });

    const byKey = new Map(
      hydratedRows.map(
        (row) => [`${row.accountId}\0${row.postId}`, row] as const
      )
    );

    const items = stubs
      .map((stub) => byKey.get(`${stub.accountId}\0${stub.postId}`))
      .filter((row): row is PostRow => row != null);

    return { items, nextOffset };
  }

  /**
   * Posts tagged with a ticker / cashtag (paginated, newest first).
   * Hydrates full `postsFeed` / `postsCurrent` rows so list UIs get text/media.
   *
   * ```ts
   * const page = await os.query.feed.byTicker('social', { limit: 20 });
   * ```
   */
  async byTicker(
    ticker: string,
    opts: { limit?: number; offset?: number } = {}
  ): Promise<Paginated<PostRow>> {
    const limit = opts.limit ?? 20;
    const offset = opts.offset ?? 0;
    const res = await this._q.graphql<{
      postTickers: Array<{
        accountId: string;
        postId: string;
        ticker: string;
        blockHeight: number;
        blockTimestamp: number;
        groupId: string | null;
      }>;
    }>({
      query: `query PostsByTicker($ticker: String!, $limit: Int!, $offset: Int!) {
        postTickers(
          where: {ticker: {_eq: $ticker}},
          orderBy: [{blockHeight: DESC}],
          limit: $limit,
          offset: $offset
        ) {
          accountId postId ticker blockHeight blockTimestamp groupId
        }
      }`,
      variables: {
        ticker: ticker.toLowerCase().replace(/^\$/, ''),
        limit,
        offset,
      },
    });
    const stubs = res.data?.postTickers ?? [];
    const nextOffset = stubs.length >= limit ? offset + limit : undefined;

    if (stubs.length === 0) {
      return { items: [], nextOffset };
    }

    const accountIds = Array.from(new Set(stubs.map((row) => row.accountId)));
    const postIds = Array.from(new Set(stubs.map((row) => row.postId)));
    const hydrateVariables = {
      accounts: accountIds,
      postIds,
      limit: Math.max(stubs.length * 2, limit),
    };

    const hydratedRows = await this.queryFeedRows({
      variables: hydrateVariables,
      postsFeedQuery: `query PostsByTickerHydrate($accounts: [String!]!, $postIds: [String!]!, $limit: Int!) {
        postsFeed(
          where: {
            _and: [
              { accountId: { _in: $accounts } },
              { postId: { _in: $postIds } }
            ]
          },
          limit: $limit
        ) {
          ${FEED_POST_ROW_FIELDS}
        }
      }`,
      postsCurrentQuery: `query PostsByTickerHydrate($accounts: [String!]!, $postIds: [String!]!, $limit: Int!) {
        postsCurrent(
          where: {
            _and: [
              { accountId: { _in: $accounts } },
              { postId: { _in: $postIds } }
            ]
          },
          limit: $limit
        ) {
          ${POST_ROW_FIELDS}
        }
      }`,
    });

    const byKey = new Map(
      hydratedRows.map(
        (row) => [`${row.accountId}\0${row.postId}`, row] as const
      )
    );

    const items = stubs
      .map((stub) => byKey.get(`${stub.accountId}\0${stub.postId}`))
      .filter((row): row is PostRow => row != null);

    return { items, nextOffset };
  }

  /**
   * Posts tagged with a place (paginated, newest first).
   * Hydrates full `postsFeed` / `postsCurrent` rows so list UIs get text/media.
   *
   * ```ts
   * const page = await os.query.feed.byPlace('lisbon', { limit: 20 });
   * ```
   */
  async byPlace(
    place: string,
    opts: { limit?: number; offset?: number } = {}
  ): Promise<Paginated<PostRow>> {
    const limit = opts.limit ?? 20;
    const offset = opts.offset ?? 0;
    const res = await this._q.graphql<{
      postPlaces: Array<{
        accountId: string;
        postId: string;
        place: string;
        blockHeight: number;
        blockTimestamp: number;
        groupId: string | null;
      }>;
    }>({
      query: `query PostsByPlace($place: String!, $limit: Int!, $offset: Int!) {
        postPlaces(
          where: {place: {_eq: $place}},
          orderBy: [{blockHeight: DESC}],
          limit: $limit,
          offset: $offset
        ) {
          accountId postId place blockHeight blockTimestamp groupId
        }
      }`,
      variables: {
        place: place.toLowerCase().replace(/^#+/, ''),
        limit,
        offset,
      },
    });
    const stubs = res.data?.postPlaces ?? [];
    const nextOffset = stubs.length >= limit ? offset + limit : undefined;

    if (stubs.length === 0) {
      return { items: [], nextOffset };
    }

    const accountIds = Array.from(new Set(stubs.map((row) => row.accountId)));
    const postIds = Array.from(new Set(stubs.map((row) => row.postId)));
    const hydrateVariables = {
      accounts: accountIds,
      postIds,
      limit: Math.max(stubs.length * 2, limit),
    };

    const hydratedRows = await this.queryFeedRows({
      variables: hydrateVariables,
      postsFeedQuery: `query PostsByPlaceHydrate($accounts: [String!]!, $postIds: [String!]!, $limit: Int!) {
        postsFeed(
          where: {
            _and: [
              { accountId: { _in: $accounts } },
              { postId: { _in: $postIds } }
            ]
          },
          limit: $limit
        ) {
          ${FEED_POST_ROW_FIELDS}
        }
      }`,
      postsCurrentQuery: `query PostsByPlaceHydrate($accounts: [String!]!, $postIds: [String!]!, $limit: Int!) {
        postsCurrent(
          where: {
            _and: [
              { accountId: { _in: $accounts } },
              { postId: { _in: $postIds } }
            ]
          },
          limit: $limit
        ) {
          ${POST_ROW_FIELDS}
        }
      }`,
    });

    const byKey = new Map(
      hydratedRows.map(
        (row) => [`${row.accountId}\0${row.postId}`, row] as const
      )
    );

    const items = stubs
      .map((stub) => byKey.get(`${stub.accountId}\0${stub.postId}`))
      .filter((row): row is PostRow => row != null);

    return { items, nextOffset };
  }
}
