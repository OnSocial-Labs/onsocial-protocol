// ---------------------------------------------------------------------------
// Feed queries — recent posts, account-set feeds, hashtag feeds.
// Accessed as `os.query.feed.<method>()`.
// ---------------------------------------------------------------------------

import type { QueryModule } from './index.js';
import type { FeedFilter, Paginated, PostRow } from './types.js';
import { POST_ROW_FIELDS, audienceLikeValue } from './_shared.js';

export class FeedQuery {
  constructor(private _q: QueryModule) {}

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
    const res = await this._q.graphql<{ postsCurrent: PostRow[] }>({
      query: hasAuthor
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
      variables: {
        ...(hasAuthor ? { author: opts.author } : {}),
        limit,
        offset,
      },
    });
    const rows = res.data?.postsCurrent ?? [];
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
    const res = await this._q.graphql<{ postsCurrent: PostRow[] }>({
      query: `query Feed($accounts: [String!]!, $limit: Int!, $offset: Int!) {
        postsCurrent(
          where: {accountId: {_in: $accounts}},
          limit: $limit, offset: $offset,
          orderBy: [{blockHeight: DESC}]
        ) {
          ${POST_ROW_FIELDS}
        }
      }`,
      variables: { accounts: opts.accounts, limit, offset },
    });
    const rows = res.data?.postsCurrent ?? [];
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

    const res = await this._q.graphql<{ postsCurrent: PostRow[] }>({
      query: `query FilteredFeed($accounts: [String!]!, $limit: Int!, $offset: Int!${opts.channel !== undefined ? ', $channel: String!' : ''}${opts.kind !== undefined ? ', $kind: String!' : ''}${opts.audience !== undefined ? ', $audienceLike: String!' : ''}) {
        postsCurrent(
          where: {_and: [
            {accountId: {_in: $accounts}}${opts.channel !== undefined ? ', {channel: {_eq: $channel}}' : ''}${opts.kind !== undefined ? ', {kind: {_eq: $kind}}' : ''}${opts.audience !== undefined ? ', {audiences: {_like: $audienceLike}}' : ''}
          ]},
          limit: $limit,
          offset: $offset,
          orderBy: [{blockHeight: DESC}]
        ) {
          ${POST_ROW_FIELDS}
        }
      }`,
      variables: {
        accounts: opts.accounts,
        limit,
        offset,
        ...(opts.channel !== undefined ? { channel: opts.channel } : {}),
        ...(opts.kind !== undefined ? { kind: opts.kind } : {}),
        ...(opts.audience !== undefined
          ? { audienceLike: audienceLikeValue(opts.audience) }
          : {}),
      },
    });

    const rows = res.data?.postsCurrent ?? [];
    return {
      items: rows,
      nextOffset: rows.length >= limit ? offset + limit : undefined,
    };
  }

  /**
   * Posts tagged with a hashtag (paginated, newest first).
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
    const rows = res.data?.postHashtags ?? [];
    return {
      items: rows.map((r) => ({
        accountId: r.accountId,
        postId: r.postId,
        value: '', // join with posts_current for full content
        blockHeight: r.blockHeight,
        blockTimestamp: r.blockTimestamp,
        groupId: r.groupId ?? undefined,
      })),
      nextOffset: rows.length >= limit ? offset + limit : undefined,
    };
  }
}
