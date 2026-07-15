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
} from './_shared.js';

/** Set when GraphQL rejects `postsFeed` (view not tracked yet). */
let postsFeedUnavailable = false;

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
  }): Promise<PostRow[]> {
    if (!postsFeedUnavailable) {
      try {
        const res = await this._q.graphql<{ postsFeed: PostRow[] }>({
          query: args.postsFeedQuery,
          variables: args.variables,
        });
        return res.data?.postsFeed ?? [];
      } catch (err) {
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
   * Recent posts, optionally filtered by author.
   *
   * ```ts
   * const { items, nextOffset } = await os.query.feed.recent({ limit: 20 });
   * ```
   */
  async recent(
    opts: { author?: string; limit?: number; offset?: number } = {}
  ): Promise<Paginated<PostRow>> {
    const limit = opts.limit ?? 20;
    const offset = opts.offset ?? 0;
    const hasAuthor = !!opts.author;
    const variables = {
      ...(hasAuthor ? { author: opts.author } : {}),
      limit,
      offset,
    };

    const rows = await this.queryFeedRows({
      variables,
      postsFeedQuery: hasAuthor
        ? `query Posts($author: String!, $limit: Int!, $offset: Int!) {
            postsFeed(where: {accountId: {_eq: $author}}, limit: $limit, offset: $offset, orderBy: [{blockHeight: DESC}]) {
              ${FEED_POST_ROW_FIELDS}
            }
          }`
        : `query Posts($limit: Int!, $offset: Int!) {
            postsFeed(limit: $limit, offset: $offset, orderBy: [{blockHeight: DESC}]) {
              ${FEED_POST_ROW_FIELDS}
            }
          }`,
      postsCurrentQuery: hasAuthor
        ? `query Posts($author: String!, $limit: Int!, $offset: Int!) {
            postsCurrent(where: {accountId: {_eq: $author}}, limit: $limit, offset: $offset, orderBy: [{blockHeight: DESC}]) {
              ${POST_ROW_FIELDS}
            }
          }`
        : `query Posts($limit: Int!, $offset: Int!) {
            postsCurrent(limit: $limit, offset: $offset, orderBy: [{blockHeight: DESC}]) {
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
   * const { items } = await os.query.feed.fromAccounts({ accounts, limit: 20 });
   * ```
   */
  async fromAccounts(opts: {
    accounts: string[];
    limit?: number;
    offset?: number;
  }): Promise<Paginated<PostRow>> {
    if (opts.accounts.length === 0) return { items: [] };
    const limit = opts.limit ?? 20;
    const offset = opts.offset ?? 0;
    const variables = { accounts: opts.accounts, limit, offset };

    const rows = await this.queryFeedRows({
      variables,
      postsFeedQuery: `query Feed($accounts: [String!]!, $limit: Int!, $offset: Int!) {
        postsFeed(
          where: {accountId: {_in: $accounts}},
          limit: $limit, offset: $offset,
          orderBy: [{blockHeight: DESC}]
        ) {
          ${FEED_POST_ROW_FIELDS}
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
}
