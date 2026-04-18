// ---------------------------------------------------------------------------
// OnSocial SDK — query module (GraphQL over indexed views)
// ---------------------------------------------------------------------------

import type { HttpClient } from './http.js';
import type { GraphQLRequest, GraphQLResponse, QueryLimits } from './types.js';

// ── Row shapes (match Hasura GraphQL camelCase schema) ───────────────────

/** Row from `postsCurrent` view. */
export interface PostRow {
  accountId: string;
  postId: string;
  value: string;
  blockHeight: number;
  blockTimestamp: number;
  receiptId?: string;
  parentPath?: string;
  parentAuthor?: string;
  parentType?: string;
  refPath?: string;
  refAuthor?: string;
  refType?: string;
  groupId?: string;
  isGroupContent?: boolean;
}

/** Row from `reactionsCurrent` view. */
export interface ReactionRow {
  accountId: string;
  postOwner: string;
  path: string;
  value: string;
  blockHeight: number;
  blockTimestamp: number;
  operation: string;
}

/** Paginated result set. */
export interface Paginated<T> {
  items: T[];
  /** Offset for the next page, or `undefined` if this was the last page. */
  nextOffset?: number;
}

/** Row from `hashtag_counts` view. */
export interface HashtagCount {
  hashtag: string;
  postCount: number;
  lastBlock: number;
}

export class QueryModule {
  constructor(private _http: HttpClient) {}

  /**
   * Execute a raw GraphQL query against the indexed data.
   *
   * ```ts
   * const { data } = await os.query.graphql({
   *   query: `{ postsCurrent(limit: 10, orderBy: {blockHeight: DESC}) { accountId postId value } }`,
   * });
   * ```
   */
  async graphql<T = unknown>(req: GraphQLRequest): Promise<GraphQLResponse<T>> {
    return this._http.post<GraphQLResponse<T>>('/graph/query', req);
  }

  /** Get query limits for the current tier. */
  async getLimits(): Promise<QueryLimits> {
    return this._http.get<QueryLimits>('/graph/limits');
  }

  // ── Convenience helpers over materialized views ─────────────────────────

  /** Fetch a profile by account ID (raw rows — one per field). */
  async profile(accountId: string) {
    return this.graphql<{ profilesCurrent: Array<{
      accountId: string; field: string; value: string;
      blockHeight: number; blockTimestamp: number; operation: string;
    }> }>({
      query: `query Profile($id: String!) {
        profilesCurrent(where: {accountId: {_eq: $id}}) {
          accountId field value blockHeight blockTimestamp operation
        }
      }`,
      variables: { id: accountId },
    });
  }

  /** Fetch recent posts, optionally filtered by author. */
  async posts(opts: { author?: string; limit?: number; offset?: number } = {}) {
    const limit = opts.limit ?? 20;
    const offset = opts.offset ?? 0;
    const hasAuthor = !!opts.author;
    return this.graphql<{ postsCurrent: PostRow[] }>({
      query: hasAuthor
        ? `query Posts($author: String!, $limit: Int!, $offset: Int!) {
            postsCurrent(where: {accountId: {_eq: $author}}, limit: $limit, offset: $offset, orderBy: [{blockHeight: DESC}]) {
              accountId postId value blockHeight blockTimestamp receiptId
              parentPath parentAuthor parentType refPath refAuthor refType
              groupId isGroupContent
            }
          }`
        : `query Posts($limit: Int!, $offset: Int!) {
            postsCurrent(limit: $limit, offset: $offset, orderBy: [{blockHeight: DESC}]) {
              accountId postId value blockHeight blockTimestamp receiptId
              parentPath parentAuthor parentType refPath refAuthor refType
              groupId isGroupContent
            }
          }`,
      variables: { ...(hasAuthor ? { author: opts.author } : {}), limit, offset },
    });
  }

  /** Fetch standings (who an account stands with). */
  async standings(accountId: string, opts: { limit?: number } = {}) {
    return this.graphql<{ standingsCurrent: Array<{
      accountId: string; targetAccount: string; value: string;
      blockHeight: number; blockTimestamp: number;
    }> }>({
      query: `query Standings($id: String!, $limit: Int!) {
        standingsCurrent(where: {accountId: {_eq: $id}}, limit: $limit) {
          accountId targetAccount value blockHeight blockTimestamp
        }
      }`,
      variables: { id: accountId, limit: opts.limit ?? 100 },
    });
  }

  /** Fetch standing counts for an account. */
  async standingCounts(accountId: string) {
    return this.graphql<{
      standingCounts: Array<{ accountId: string; standingWithCount: number; lastStandingBlock: number }>;
      standingOutCounts: Array<{ accountId: string; standingWithOthersCount: number; lastStandingBlock: number }>;
    }>({
      query: `query StandingCounts($id: String!) {
        standingCounts(where: {accountId: {_eq: $id}}) {
          accountId standingWithCount lastStandingBlock
        }
        standingOutCounts(where: {accountId: {_eq: $id}}) {
          accountId standingWithOthersCount lastStandingBlock
        }
      }`,
      variables: { id: accountId },
    });
  }

  /** Fetch reactions on a piece of content. */
  async reactions(ownerAccount: string, contentPath: string) {
    const fullPath = `reaction/${ownerAccount}/${contentPath}`;
    return this.graphql<{ reactionsCurrent: ReactionRow[] }>({
      query: `query Reactions($path: String!) {
        reactionsCurrent(where: {path: {_like: $path}}) {
          accountId postOwner path value blockHeight blockTimestamp operation
        }
      }`,
      variables: { path: `${fullPath}%` },
    });
  }

  /** Fetch universal edge counts (any relationship type). */
  async edgeCounts(accountId: string) {
    return this.graphql<{ edgeCounts: Array<{
      accountId: string; edgeType: string; inboundCount: number; lastBlock: number;
    }> }>({
      query: `query EdgeCounts($id: String!) {
        edgeCounts(where: {accountId: {_eq: $id}}) {
          accountId edgeType inboundCount lastBlock
        }
      }`,
      variables: { id: accountId },
    });
  }

  /** Fetch the reward leaderboard. */
  async leaderboard(opts: { limit?: number } = {}) {
    return this.graphql<{ leaderboardRewards: unknown[] }>({
      query: `query Leaderboard($limit: Int!) {
        leaderboardRewards(limit: $limit) {
          accountId totalEarned totalClaimed rank
        }
      }`,
      variables: { limit: opts.limit ?? 50 },
    });
  }

  /** Fetch SOCIAL token stats. */
  async tokenStats() {
    return this._http.get<{
      contract: string;
      holders: number;
      source: string;
    }>('/graph/token-stats');
  }

  // ── Custom data queries (raw data_updates table) ────────────────────────

  /**
   * Query indexed data by custom data type.
   *
   * Every `social.set()` call is indexed with a `data_type` derived from
   * the first path segment. This lets dApps query their own schemas.
   *
   * ```ts
   * // Write custom data
   * await os.social.set('vegancert/cert-001', JSON.stringify({ status: 'verified' }));
   *
   * // Read it back via indexed data
   * const { data } = await os.query.dataByType('vegancert', { accountId: 'alice.near' });
   * // data.dataUpdates → [{ path, value, blockHeight, ... }]
   * ```
   */
  async dataByType(
    dataType: string,
    opts: { accountId?: string; limit?: number; offset?: number } = {},
  ) {
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;
    const conditions = [`{dataType: {_eq: $dataType}}`];
    if (opts.accountId) conditions.push(`{accountId: {_eq: $accountId}}`);
    const where = conditions.length === 1
      ? conditions[0]
      : `{_and: [${conditions.join(', ')}]}`;

    return this.graphql<{ dataUpdates: Array<{
      path: string;
      value: string;
      accountId: string;
      dataId: string;
      blockHeight: number;
      blockTimestamp: number;
      operation: string;
    }> }>({
      query: `query DataByType($dataType: String!${opts.accountId ? ', $accountId: String!' : ''}) {
        dataUpdates(where: ${where}, limit: ${limit}, offset: ${offset}, orderBy: [{blockHeight: DESC}]) {
          path value accountId dataId blockHeight blockTimestamp operation
        }
      }`,
      variables: {
        dataType,
        ...(opts.accountId ? { accountId: opts.accountId } : {}),
      },
    });
  }

  /**
   * Query a single data entry by its full path from the index.
   *
   * ```ts
   * const { data } = await os.query.dataByPath('alice.near/vegancert/cert-001');
   * ```
   */
  async dataByPath(path: string) {
    return this.graphql<{ dataUpdates: Array<{
      path: string;
      value: string;
      accountId: string;
      dataType: string;
      dataId: string;
      blockHeight: number;
      blockTimestamp: number;
      operation: string;
    }> }>({
      query: `query DataByPath($path: String!) {
        dataUpdates(where: {path: {_eq: $path}}, limit: 1, orderBy: [{blockHeight: DESC}]) {
          path value accountId dataType dataId blockHeight blockTimestamp operation
        }
      }`,
      variables: { path },
    });
  }

  // ── Typed read helpers ──────────────────────────────────────────────────

  /**
   * Get a profile as a merged field→value map.
   *
   * ```ts
   * const profile = await os.query.getProfile('alice.near');
   * // profile → { name: '{"v":1,"displayName":"Alice",...}', bio: '...', avatar: '...' }
   * ```
   */
  async getProfile(accountId: string): Promise<Record<string, string> | null> {
    const res = await this.profile(accountId);
    const rows = res.data?.profilesCurrent;
    if (!rows || rows.length === 0) return null;
    const out: Record<string, string> = {};
    for (const row of rows) out[row.field] = row.value;
    return out;
  }

  /**
   * Get recent posts with pagination.
   *
   * ```ts
   * const { items, nextOffset } = await os.query.getPosts({ limit: 20 });
   * const page2 = await os.query.getPosts({ limit: 20, offset: nextOffset });
   * ```
   */
  async getPosts(
    opts: { author?: string; limit?: number; offset?: number } = {},
  ): Promise<Paginated<PostRow>> {
    const limit = opts.limit ?? 20;
    const res = await this.posts({ ...opts, limit });
    const rows = res.data?.postsCurrent ?? [];
    return {
      items: rows,
      nextOffset: rows.length >= limit ? (opts.offset ?? 0) + limit : undefined,
    };
  }

  /**
   * Get a feed from accounts you stand with.
   *
   * ```ts
   * const standingWith = await os.query.getStandingWith('alice.near');
   * const { items } = await os.query.getFeed({ standingWith, limit: 20 });
   * ```
   */
  async getFeed(
    opts: { standingWith: string[]; limit?: number; offset?: number },
  ): Promise<Paginated<PostRow>> {
    if (opts.standingWith.length === 0) return { items: [] };
    const limit = opts.limit ?? 20;
    const offset = opts.offset ?? 0;
    const res = await this.graphql<{ postsCurrent: PostRow[] }>({
      query: `query Feed($accounts: [String!]!, $limit: Int!, $offset: Int!) {
        postsCurrent(
          where: {accountId: {_in: $accounts}},
          limit: $limit, offset: $offset,
          orderBy: [{blockHeight: DESC}]
        ) {
          accountId postId value blockHeight blockTimestamp receiptId
          parentPath parentAuthor parentType refPath refAuthor refType
          groupId isGroupContent
        }
      }`,
      variables: { accounts: opts.standingWith, limit, offset },
    });
    const rows = res.data?.postsCurrent ?? [];
    return {
      items: rows,
      nextOffset: rows.length >= limit ? offset + limit : undefined,
    };
  }

  /**
   * Get replies to a post.
   *
   * ```ts
   * const replies = await os.query.getReplies('alice.near', 'my-post-id');
   * ```
   */
  async getReplies(
    parentAuthor: string,
    postId: string,
    opts: { limit?: number } = {},
  ): Promise<PostRow[]> {
    const parentPath = `post/${postId}`;
    const res = await this.graphql<{ threadReplies: Array<{
      replyAuthor: string; replyId: string; value: string;
      blockHeight: number; blockTimestamp: number; groupId?: string;
      parentAuthor: string; parentPath: string; parentType?: string;
    }> }>({
      query: `query Replies($parentAuthor: String!, $parentPath: String!, $limit: Int!) {
        threadReplies(
          where: {parentAuthor: {_eq: $parentAuthor}, parentPath: {_eq: $parentPath}},
          limit: $limit,
          orderBy: [{blockHeight: ASC}]
        ) {
          replyAuthor replyId value blockHeight blockTimestamp groupId
          parentAuthor parentPath parentType
        }
      }`,
      variables: { parentAuthor, parentPath, limit: opts.limit ?? 100 },
    });
    return (res.data?.threadReplies ?? []).map(r => ({
      accountId: r.replyAuthor,
      postId: r.replyId,
      value: r.value,
      blockHeight: r.blockHeight,
      blockTimestamp: r.blockTimestamp,
      parentAuthor: r.parentAuthor,
      parentPath: r.parentPath,
      parentType: r.parentType,
      groupId: r.groupId,
    }));
  }

  /**
   * Get quotes of a post.
   *
   * ```ts
   * const quotes = await os.query.getQuotes('alice.near', 'my-post-id');
   * ```
   */
  async getQuotes(
    refAuthor: string,
    postId: string,
    opts: { limit?: number } = {},
  ): Promise<PostRow[]> {
    const refPath = `post/${postId}`;
    const res = await this.graphql<{ quotes: Array<{
      quoteAuthor: string; quoteId: string; value: string;
      blockHeight: number; blockTimestamp: number; groupId?: string;
      refAuthor: string; refPath: string; refType?: string;
    }> }>({
      query: `query Quotes($refAuthor: String!, $refPath: String!, $limit: Int!) {
        quotes(
          where: {refAuthor: {_eq: $refAuthor}, refPath: {_eq: $refPath}},
          limit: $limit,
          orderBy: [{blockHeight: ASC}]
        ) {
          quoteAuthor quoteId value blockHeight blockTimestamp groupId
          refAuthor refPath refType
        }
      }`,
      variables: { refAuthor, refPath, limit: opts.limit ?? 100 },
    });
    return (res.data?.quotes ?? []).map(q => ({
      accountId: q.quoteAuthor,
      postId: q.quoteId,
      value: q.value,
      blockHeight: q.blockHeight,
      blockTimestamp: q.blockTimestamp,
      refAuthor: q.refAuthor,
      refPath: q.refPath,
      refType: q.refType,
      groupId: q.groupId,
    }));
  }

  /**
   * Get reaction counts grouped by kind for a post.
   *
   * ```ts
   * const counts = await os.query.getReactionCounts('alice.near', 'post/my-post-id');
   * // counts → { like: 5, fire: 2 }
   * ```
   */
  async getReactionCounts(
    postOwner: string,
    postPath: string,
  ): Promise<Record<string, number>> {
    const res = await this.graphql<{ reactionCounts: Array<{
      reactionCount: number;
    }> }>({
      query: `query ReactionCounts($owner: String!, $path: String!) {
        reactionCounts(where: {postOwner: {_eq: $owner}, postPath: {_eq: $path}}) {
          reactionCount
        }
      }`,
      variables: { owner: postOwner, path: postPath },
    });
    const out: Record<string, number> = {};
    for (const r of res.data?.reactionCounts ?? []) {
      out['total'] = r.reactionCount;
    }
    return out;
  }

  /**
   * Get accounts this account stands with (outbound graph).
   *
   * ```ts
   * const standingWith = await os.query.getStandingWith('alice.near');
   * // standingWith → ['bob.near', 'carol.near']
   * ```
   */
  async getStandingWith(
    accountId: string,
    opts: { limit?: number } = {},
  ): Promise<string[]> {
    const res = await this.standings(accountId, opts);
    return (res.data?.standingsCurrent ?? []).map(r => r.targetAccount);
  }

  /**
   * Get accounts that stand with this account (inbound graph).
   *
   * ```ts
   * const standers = await os.query.getStanders('alice.near');
   * // standers → ['dave.near', 'eve.near']
   * ```
   */
  async getStanders(
    accountId: string,
    opts: { limit?: number } = {},
  ): Promise<string[]> {
    const res = await this.graphql<{ standingsCurrent: Array<{
      accountId: string; targetAccount: string;
    }> }>({
      query: `query Standers($id: String!, $limit: Int!) {
        standingsCurrent(where: {targetAccount: {_eq: $id}}, limit: $limit) {
          accountId targetAccount
        }
      }`,
      variables: { id: accountId, limit: opts.limit ?? 100 },
    });
    return (res.data?.standingsCurrent ?? []).map(r => r.accountId);
  }

  /**
   * Get standing counts for an account.
   *
   * ```ts
   * const { standers, standingWith } = await os.query.getStandingCounts('alice.near');
   * ```
   */
  async getStandingCounts(
    accountId: string,
  ): Promise<{ standers: number; standingWith: number }> {
    const res = await this.standingCounts(accountId);
    const inbound = res.data?.standingCounts?.[0];
    const outbound = res.data?.standingOutCounts?.[0];
    return {
      standers: inbound ? Number(inbound.standingWithCount) : 0,
      standingWith: outbound ? Number(outbound.standingWithOthersCount) : 0,
    };
  }

  // ── Hashtags ──────────────────────────────────────────────────────────

  /**
   * Get posts by hashtag (paginated, newest first).
   *
   * ```ts
   * const page = await os.query.getPostsByHashtag('onchain', { limit: 20 });
   * ```
   */
  async getPostsByHashtag(
    hashtag: string,
    opts: { limit?: number; offset?: number } = {},
  ): Promise<Paginated<PostRow>> {
    const limit = opts.limit ?? 20;
    const offset = opts.offset ?? 0;
    const res = await this.graphql<{ postHashtags: Array<{
      accountId: string; postId: string; hashtag: string;
      blockHeight: number; blockTimestamp: number; groupId: string | null;
    }> }>({
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
      variables: { tag: hashtag.toLowerCase().replace(/^#/, ''), limit, offset },
    });
    const rows = res.data?.postHashtags ?? [];
    return {
      items: rows.map(r => ({
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

  /**
   * Get trending hashtags (most used, descending).
   *
   * ```ts
   * const tags = await os.query.getTrendingHashtags({ limit: 10 });
   * // [{ hashtag: 'onchain', postCount: 42, lastBlock: 99 }, ...]
   * ```
   */
  async getTrendingHashtags(
    opts: { limit?: number } = {},
  ): Promise<HashtagCount[]> {
    const res = await this.graphql<{ hashtagCounts: HashtagCount[] }>({
      query: `query TrendingHashtags($limit: Int!) {
        hashtagCounts(
          orderBy: [{postCount: DESC}],
          limit: $limit
        ) {
          hashtag postCount lastBlock
        }
      }`,
      variables: { limit: opts.limit ?? 20 },
    });
    return res.data?.hashtagCounts ?? [];
  }

  /**
   * Search hashtags by prefix (for autocomplete).
   *
   * ```ts
   * const matches = await os.query.searchHashtags('on', { limit: 5 });
   * // [{ hashtag: 'onchain', postCount: 42, lastBlock: 99 }, ...]
   * ```
   */
  async searchHashtags(
    prefix: string,
    opts: { limit?: number } = {},
  ): Promise<HashtagCount[]> {
    const res = await this.graphql<{ hashtagCounts: HashtagCount[] }>({
      query: `query SearchHashtags($prefix: String!, $limit: Int!) {
        hashtagCounts(
          where: {hashtag: {_like: $prefix}},
          orderBy: [{postCount: DESC}],
          limit: $limit
        ) {
          hashtag postCount lastBlock
        }
      }`,
      variables: { prefix: `${prefix.toLowerCase().replace(/^#/, '')}%`, limit: opts.limit ?? 10 },
    });
    return res.data?.hashtagCounts ?? [];
  }
}
