// ---------------------------------------------------------------------------
// Feed queries — recent posts, account-set feeds, hashtag feeds.
// Accessed as `os.query.feed.<method>()`.
// ---------------------------------------------------------------------------

import type { QueryModule } from './index.js';
import type { FeedFilter, Paginated, PostRow } from './types.js';
import {
  FEED_POST_ROW_FIELDS,
  FEED_POST_ROW_PAINT_FIELDS,
  GraphQLValidationError,
  POST_ROW_FIELDS,
  audienceLikeValue,
  chronoContentPathKeysetAnd,
  chronoDescPage,
  feedOrderByClause,
  normalizeBeforeBlockHeight,
  postContentPath,
  requireChronoKeyset,
  requireHotKeyset,
  requirePulseKeyset,
  stripFeedPaintFields,
  type FeedSection,
  type FeedSort,
} from './_shared.js';
import {
  paginatePulseFunctionRows,
  pulseAccountsTextArray,
} from './feed-pulse.js';

export type { FeedSection, FeedSort };

/**
 * Downgrade window after a schema miss before retrying the full query.
 * Keeps one transient Hasura metadata gap from degrading a long-lived
 * client (or SSR process) forever.
 */
const SCHEMA_FALLBACK_TTL_MS = 5 * 60 * 1000;

/** Per-client "schema feature missing" latch with expiry. */
class SchemaFallback {
  private until = 0;

  get active(): boolean {
    return Date.now() < this.until;
  }

  trip(): void {
    this.until = Date.now() + SCHEMA_FALLBACK_TTL_MS;
  }

  clear(): void {
    this.until = 0;
  }
}

const FEED_POST_ROW_FIELDS_NO_HEAT = FEED_POST_ROW_FIELDS.replace(
  /\s*amplifyHeat\s*/,
  ' '
).trim();

const FEED_POST_ROW_FIELDS_WITH_ROOT = `${FEED_POST_ROW_FIELDS}
  rootPath rootAuthor`;
const FEED_POST_ROW_FIELDS_NO_HEAT_WITH_ROOT = `${FEED_POST_ROW_FIELDS_NO_HEAT}
  rootPath rootAuthor`;

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

function isFeedPaintUnavailableError(err: unknown): boolean {
  if (!(err instanceof GraphQLValidationError)) return false;
  const hay =
    `${err.message} ${err.errors.map((e) => e.message ?? '').join(' ')}`.toLowerCase();
  return (
    hay.includes('replycount') ||
    hay.includes('quotecount') ||
    hay.includes('repostcount') ||
    hay.includes('reactioncount') ||
    hay.includes('quotedpost') ||
    hay.includes('quotedrefpost') ||
    hay.includes('reply_count') ||
    hay.includes('quoted_post')
  );
}

/** `feed_hot` is not tracked yet (deploy lag). */
function isFeedHotUnavailableError(err: unknown): boolean {
  if (!(err instanceof GraphQLValidationError)) return false;
  const hay =
    `${err.message} ${err.errors.map((e) => e.message ?? '').join(' ')}`.toLowerCase();
  return hay.includes('feedhot') || hay.includes('feed_hot');
}

/**
 * Hot page via `feed_hot`. The alias keeps the payload on `postsFeed` so
 * callers and stubs that already read that field stay on one shape.
 * Unfiltered chronological reads can limit on `block_height` before counts.
 * An author or account list cannot, so those pages use `feed_recent`.
 */
function feedHotQuery(
  fields: string,
  opts: {
    author?: boolean;
    kind?: boolean;
    section?: boolean;
    accounts?: boolean;
    nativeOnly?: boolean;
    beforeKeyset?: boolean;
  }
): string {
  const params = ['$limit: Int!', '$offset: Int!'];
  const args = ['row_limit: $limit', 'row_offset: $offset'];
  if (opts.author) {
    params.push('$author: String');
    args.push('author: $author');
  }
  if (opts.kind) {
    params.push('$kind: String');
    args.push('kind: $kind');
  }
  if (opts.section) {
    params.push('$section: String');
    args.push('section: $section');
  }
  if (opts.accounts) {
    params.push('$accounts: _text');
    args.push('accounts: $accounts');
  }
  if (opts.nativeOnly) {
    params.push('$native_only: Boolean');
    args.push('native_only: $native_only');
  }
  if (opts.beforeKeyset) {
    params.push(
      '$before_amplify_heat: float8',
      '$before_block_height: bigint',
      '$before_post_key: String'
    );
    args.push(
      'before_amplify_heat: $before_amplify_heat',
      'before_block_height: $before_block_height',
      'before_post_key: $before_post_key'
    );
  }
  return `query PostsFeedHot(${params.join(', ')}) {
        postsFeed: feedHot(args: { ${args.join(', ')} }) {
          ${fields}
        }
      }`;
}

/**
 * Hot page cursor — heat + height + content path (matches `feed_hot` ROW).
 * Reuses Paginated heat/key fields shared with Pulse card cursors.
 */
function hotDescPage(
  items: PostRow[],
  limit: number,
  opts: { offset: number; usedKeyset: boolean }
): Paginated<PostRow> {
  if (items.length < limit) return { items };
  const edge = items[items.length - 1];
  if (!edge) return { items };
  const nextBeforeBlockHeight = normalizeBeforeBlockHeight(edge.blockHeight);
  if (nextBeforeBlockHeight === undefined) {
    return opts.usedKeyset
      ? { items }
      : { items, nextOffset: opts.offset + limit };
  }
  const keyset = {
    nextBeforeBlockHeight,
    nextBeforeHeat: edge.amplifyHeat ?? 0,
    nextBeforeEventKey: postContentPath(edge),
  };
  if (opts.usedKeyset) return { items, ...keyset };
  return { items, nextOffset: opts.offset + limit, ...keyset };
}

function isFeedHotBeforeKeyUnavailableError(err: unknown): boolean {
  if (!(err instanceof GraphQLValidationError)) return false;
  const hay =
    `${err.message} ${err.errors.map((e) => e.message ?? '').join(' ')}`.toLowerCase();
  return (
    hay.includes('before_amplify_heat') ||
    hay.includes('beforeamplifyheat') ||
    hay.includes('before_post_key') ||
    hay.includes('beforepostkey') ||
    (hay.includes('before_block_height') && hay.includes('feedhot'))
  );
}

function feedRecentQuery(
  fields: string,
  opts: {
    author?: boolean;
    kind?: boolean;
    section?: boolean;
    accounts?: boolean;
    nativeOnly?: boolean;
    channel?: boolean;
    audience?: boolean;
    /** Chrono keyset — height + content path (`feed_recent`). */
    beforeKeyset?: boolean;
  }
): string {
  const params = ['$limit: Int!', '$offset: Int!'];
  const args = ['row_limit: $limit', 'row_offset: $offset'];
  if (opts.author) {
    params.push('$author: String');
    args.push('author: $author');
  }
  if (opts.kind) {
    params.push('$kind: String');
    args.push('kind: $kind');
  }
  if (opts.section) {
    params.push('$section: String');
    args.push('section: $section');
  }
  if (opts.accounts) {
    params.push('$accounts: _text');
    args.push('accounts: $accounts');
  }
  if (opts.nativeOnly) {
    params.push('$native_only: Boolean');
    args.push('native_only: $native_only');
  }
  if (opts.channel) {
    params.push('$channel: String');
    args.push('channel: $channel');
  }
  if (opts.audience) {
    params.push('$audience_like: String');
    args.push('audience_like: $audience_like');
  }
  if (opts.beforeKeyset) {
    params.push('$before_block_height: bigint', '$before_post_key: String');
    args.push(
      'before_block_height: $before_block_height',
      'before_post_key: $before_post_key'
    );
  }
  // Operation name stays `Posts`. Thread discover-peek stubs match `query Posts(`.
  return `query Posts(${params.join(', ')}) {
        postsFeed: feedRecent(args: { ${args.join(', ')} }) {
          ${fields}
        }
      }`;
}

function isFeedRecentBeforeKeyUnavailableError(err: unknown): boolean {
  if (!(err instanceof GraphQLValidationError)) return false;
  const hay =
    `${err.message} ${err.errors.map((e) => e.message ?? '').join(' ')}`.toLowerCase();
  return (
    hay.includes('before_block_height') ||
    hay.includes('beforeblockheight') ||
    hay.includes('before_post_key') ||
    hay.includes('beforepostkey')
  );
}

function isFeedRecentUnavailableError(err: unknown): boolean {
  if (!(err instanceof GraphQLValidationError)) return false;
  const hay =
    `${err.message} ${err.errors.map((e) => e.message ?? '').join(' ')}`.toLowerCase();
  return hay.includes('feedrecent') || hay.includes('feed_recent');
}

/** Topic index `heat` column not tracked yet (deploy lag). */
function isTopicHeatUnavailableError(err: unknown): boolean {
  if (!(err instanceof GraphQLValidationError)) return false;
  const hay =
    `${err.message} ${err.errors.map((e) => e.message ?? '').join(' ')}`.toLowerCase();
  return hay.includes('heat');
}

const TOPIC_ORDER_HOT = '[{heat: DESC}, {blockHeight: DESC}]';
const TOPIC_ORDER_RECENT = '[{blockHeight: DESC}]';

function accountsFeedWhere(nativeOnly: boolean): string {
  if (!nativeOnly) return 'where: {accountId: {_in: $accounts}}';
  return `where: {_and: [
            {accountId: {_in: $accounts}},
            {_or: [
              {parentPath: {_eq: ""}},
              {parentAuthor: {_in: $accounts}}
            ]}
          ]}`;
}

export class FeedQuery {
  /** Set when GraphQL rejects `postsFeed` (view not tracked yet). */
  private postsFeedFallback = new SchemaFallback();

  /** Set when GraphQL rejects `amplifyHeat` (column not tracked yet). */
  private amplifyHeatFallback = new SchemaFallback();

  /** Set when the public-count / quoted-post columns are not tracked yet. */
  private feedPaintFallback = new SchemaFallback();

  /** Set when GraphQL rejects `feedHot` (function not tracked yet). */
  private feedHotFallback = new SchemaFallback();
  /** Set when GraphQL rejects `feedRecent` (function not tracked yet). */
  private feedRecentFallback = new SchemaFallback();

  /** Set when topic index views reject `heat` ordering (column not tracked yet). */
  private topicHeatFallback = new SchemaFallback();

  constructor(private _q: QueryModule) {}

  /**
   * Fetch topic index stubs, hot-ordered when requested. Falls back to
   * chronological order while the `heat` column is not tracked yet.
   */
  private async queryTopicStubs<T>(args: {
    buildQuery: (orderBy: string) => string;
    variables: Record<string, unknown>;
    sort: FeedSort;
    pick: (data: Record<string, unknown> | undefined) => T[] | undefined;
  }): Promise<T[]> {
    const wantHot = args.sort === 'hot' && !this.topicHeatFallback.active;
    const orderBy = wantHot ? TOPIC_ORDER_HOT : TOPIC_ORDER_RECENT;
    try {
      const res = await this._q.graphql<Record<string, unknown>>({
        query: args.buildQuery(orderBy),
        variables: args.variables,
      });
      if (wantHot) this.topicHeatFallback.clear();
      return args.pick(res.data) ?? [];
    } catch (err) {
      if (!wantHot || !isTopicHeatUnavailableError(err)) throw err;
      this.topicHeatFallback.trip();
      const res = await this._q.graphql<Record<string, unknown>>({
        query: args.buildQuery(TOPIC_ORDER_RECENT),
        variables: args.variables,
      });
      return args.pick(res.data) ?? [];
    }
  }

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
    /**
     * Hot page from `feed_hot`. Tried before `postsFeed` so counts run for
     * the page only. An unknown-function error falls through to `postsFeed`.
     */
    feedHotQuery?: string;
    feedHotVariables?: Record<string, unknown>;
    /**
     * Chronological page from `feed_recent`. Used when an author or account
     * list would make `postsFeed` count every matching post before LIMIT.
     */
    feedRecentQuery?: string;
    feedRecentVariables?: Record<string, unknown>;
  }): Promise<PostRow[]> {
    if (
      args.feedHotQuery &&
      !this.feedHotFallback.active &&
      !this.amplifyHeatFallback.active
    ) {
      const hotQuery = this.feedPaintFallback.active
        ? stripFeedPaintFields(args.feedHotQuery)
        : args.feedHotQuery;
      try {
        const res = await this._q.graphql<{ postsFeed: PostRow[] }>({
          query: hotQuery,
          variables: args.feedHotVariables ?? args.variables,
        });
        if (hotQuery.includes(FEED_POST_ROW_PAINT_FIELDS)) {
          this.feedPaintFallback.clear();
        }
        this.feedHotFallback.clear();
        this.amplifyHeatFallback.clear();
        return res.data?.postsFeed ?? [];
      } catch (err) {
        if (
          hotQuery.includes('replyCount') &&
          isFeedPaintUnavailableError(err)
        ) {
          this.feedPaintFallback.trip();
          return this.queryFeedRows({
            ...args,
            feedHotQuery: stripFeedPaintFields(args.feedHotQuery),
          });
        }
        // Keyset pages only work on feed_hot. Falling through to postsFeed
        // with offset 0 would replay page 1 under deploy lag.
        const keysetRequired =
          args.feedHotVariables != null &&
          args.feedHotVariables.before_block_height != null;
        if (
          keysetRequired &&
          (isAmplifyHeatUnavailableError(err) ||
            isFeedHotUnavailableError(err) ||
            isFeedHotBeforeKeyUnavailableError(err))
        ) {
          throw err;
        }
        if (isAmplifyHeatUnavailableError(err)) {
          this.amplifyHeatFallback.trip();
        } else if (isFeedHotUnavailableError(err)) {
          this.feedHotFallback.trip();
        } else {
          throw err;
        }
      }
    }

    if (
      args.feedRecentQuery &&
      !this.feedRecentFallback.active &&
      !this.amplifyHeatFallback.active
    ) {
      const recentQuery = this.feedPaintFallback.active
        ? stripFeedPaintFields(args.feedRecentQuery)
        : args.feedRecentQuery;
      try {
        const res = await this._q.graphql<{ postsFeed: PostRow[] }>({
          query: recentQuery,
          variables: args.feedRecentVariables ?? args.variables,
        });
        if (recentQuery.includes(FEED_POST_ROW_PAINT_FIELDS)) {
          this.feedPaintFallback.clear();
        }
        this.feedRecentFallback.clear();
        return res.data?.postsFeed ?? [];
      } catch (err) {
        if (
          recentQuery.includes('replyCount') &&
          isFeedPaintUnavailableError(err)
        ) {
          this.feedPaintFallback.trip();
          return this.queryFeedRows({
            ...args,
            feedRecentQuery: stripFeedPaintFields(args.feedRecentQuery),
          });
        }
        if (isAmplifyHeatUnavailableError(err)) {
          this.amplifyHeatFallback.trip();
        } else if (isFeedRecentBeforeKeyUnavailableError(err)) {
          // Composite keyset args not tracked yet — fall through to postsFeed.
        } else if (!isFeedRecentUnavailableError(err)) {
          throw err;
        } else {
          this.feedRecentFallback.trip();
        }
      }
    }

    const postsFeedQuery = this.feedPaintFallback.active
      ? stripFeedPaintFields(args.postsFeedQuery)
      : args.postsFeedQuery;
    const postsFeedQueryNoHeat = args.postsFeedQueryNoHeat
      ? this.feedPaintFallback.active
        ? stripFeedPaintFields(args.postsFeedQueryNoHeat)
        : args.postsFeedQueryNoHeat
      : undefined;

    if (!this.postsFeedFallback.active) {
      const useNoHeat =
        this.amplifyHeatFallback.active && Boolean(postsFeedQueryNoHeat);
      const feedQuery = useNoHeat ? postsFeedQueryNoHeat! : postsFeedQuery;
      try {
        const res = await this._q.graphql<{ postsFeed: PostRow[] }>({
          query: feedQuery,
          variables: args.variables,
        });
        if (!useNoHeat) this.amplifyHeatFallback.clear();
        if (feedQuery.includes(FEED_POST_ROW_PAINT_FIELDS)) {
          this.feedPaintFallback.clear();
        }
        return res.data?.postsFeed ?? [];
      } catch (err) {
        if (
          feedQuery.includes('replyCount') &&
          isFeedPaintUnavailableError(err)
        ) {
          this.feedPaintFallback.trip();
          return this.queryFeedRows({
            ...args,
            postsFeedQuery: stripFeedPaintFields(args.postsFeedQuery),
            postsFeedQueryNoHeat: args.postsFeedQueryNoHeat
              ? stripFeedPaintFields(args.postsFeedQueryNoHeat)
              : undefined,
          });
        }
        if (
          !useNoHeat &&
          postsFeedQueryNoHeat &&
          isAmplifyHeatUnavailableError(err)
        ) {
          this.amplifyHeatFallback.trip();
          try {
            const res = await this._q.graphql<{ postsFeed: PostRow[] }>({
              query: postsFeedQueryNoHeat,
              variables: args.variables,
            });
            return res.data?.postsFeed ?? [];
          } catch (heatlessErr) {
            if (
              postsFeedQueryNoHeat.includes('replyCount') &&
              isFeedPaintUnavailableError(heatlessErr)
            ) {
              this.feedPaintFallback.trip();
              return this.queryFeedRows({
                ...args,
                postsFeedQuery: stripFeedPaintFields(args.postsFeedQuery),
                postsFeedQueryNoHeat:
                  stripFeedPaintFields(postsFeedQueryNoHeat),
              });
            }
            throw heatlessErr;
          }
        }
        if (!isPostsFeedUnavailableError(err)) throw err;
        this.postsFeedFallback.trip();
      }
    }

    const res = await this._q.graphql<{ postsCurrent: PostRow[] }>({
      query: args.postsCurrentQuery,
      variables: args.variables,
    });
    return this.enrichFeedPosts(res.data?.postsCurrent ?? []);
  }

  /**
   * Hydrate index stubs (accountId + postId) into full feed rows,
   * preserving stub order. Shared by hashtag / ticker / place feeds.
   */
  private async hydrateStubRows(
    queryName: string,
    stubs: Array<{ accountId: string; postId: string }>,
    limit: number
  ): Promise<PostRow[]> {
    const accountIds = Array.from(new Set(stubs.map((row) => row.accountId)));
    const postIds = Array.from(new Set(stubs.map((row) => row.postId)));
    const variables = {
      accounts: accountIds,
      postIds,
      limit: Math.max(stubs.length * 2, limit),
    };
    const whereClause = `where: {
            _and: [
              { accountId: { _in: $accounts } },
              { postId: { _in: $postIds } }
            ]
          },
          limit: $limit`;

    const hydratedRows = await this.queryFeedRows({
      variables,
      postsFeedQuery: `query ${queryName}($accounts: [String!]!, $postIds: [String!]!, $limit: Int!) {
        postsFeed(${whereClause}) {
          ${FEED_POST_ROW_FIELDS}
        }
      }`,
      postsFeedQueryNoHeat: `query ${queryName}($accounts: [String!]!, $postIds: [String!]!, $limit: Int!) {
        postsFeed(${whereClause}) {
          ${FEED_POST_ROW_FIELDS_NO_HEAT}
        }
      }`,
      postsCurrentQuery: `query ${queryName}($accounts: [String!]!, $postIds: [String!]!, $limit: Int!) {
        postsCurrent(${whereClause}) {
          ${POST_ROW_FIELDS}
        }
      }`,
    });

    const byKey = new Map(
      hydratedRows.map(
        (row) => [`${row.accountId}\0${row.postId}`, row] as const
      )
    );

    return stubs
      .map((stub) => byKey.get(`${stub.accountId}\0${stub.postId}`))
      .filter((row): row is PostRow => row != null);
  }

  /**
   * Recent / hot posts, optionally filtered by author and section.
   *
   * `sort: 'hot'` orders by decaying amplify heat then block height.
   * That page comes from `feed_hot`, which ranks on `posts_feed_rank` and
   * attaches counts and quotes only for the rows returned. Falls back to
   * `postsFeed` when the function is not deployed yet, and to chronological
   * order when amplify heat is not tracked yet.
   *
   * `section` narrows server-side (indexer stores empty strings, not NULLs):
   * - `'posts'` — roots that are not repost shells
   * - `'replies'` — has a `parentPath`
   * - `'reposts'` — `refType === 'repost'`
   *
   * `kind` matches the indexer-extracted post kind server-side
   * (`'longform'` for titled articles, `'poll'`, media kinds, …).
   *
   * ```ts
   * const { items, nextOffset } = await os.query.feed.recent({ limit: 20, sort: 'hot' });
   * const replies = await os.query.feed.recent({ author: 'alice.near', section: 'replies' });
   * const articles = await os.query.feed.recent({ author: 'alice.near', kind: 'longform' });
   * ```
   */
  async recent(
    opts: {
      author?: string;
      limit?: number;
      offset?: number;
      sort?: FeedSort;
      section?: FeedSection;
      /**
       * Server-side `kind` match (e.g. `'longform'` for articles). Keeps
       * filtered walks (Writing shelf) from paging the raw feed client-side.
       */
      kind?: string;
      /**
       * Exclusive upper bound for descending Recent pages, or the height
       * leg of a Hot/chrono keyset (with `beforePostKey`). Prefer over
       * `offset` under live inserts.
       */
      beforeBlockHeight?: number;
      /** Hot keyset heat leg (`feed_hot.before_amplify_heat`). */
      beforeHeat?: number;
      /**
       * Content-path tie-break — Hot (`feed_hot`) and chrono (`feed_recent`).
       * Chrono keysets require this with `beforeBlockHeight`.
       */
      beforePostKey?: string;
    } = {}
  ): Promise<Paginated<PostRow>> {
    const limit = opts.limit ?? 20;
    const sort = opts.sort ?? 'recent';
    const hot = sort === 'hot';
    const chronoKey = !hot
      ? requireChronoKeyset({
          beforeBlockHeight: opts.beforeBlockHeight,
          beforePostKey: opts.beforePostKey,
        })
      : null;
    if (chronoKey && !chronoKey.ok) {
      throw new Error(chronoKey.message);
    }
    const hotKey = hot
      ? requireHotKeyset({
          beforeBlockHeight: opts.beforeBlockHeight,
          beforeHeat: opts.beforeHeat,
          beforePostKey: opts.beforePostKey,
        })
      : null;
    if (hotKey && !hotKey.ok) {
      throw new Error(hotKey.message);
    }
    const before = hot ? hotKey?.before : chronoKey?.before;
    const beforeHeat = hot ? hotKey?.beforeHeat : undefined;
    const beforePostKey = hot ? hotKey?.beforePostKey : chronoKey?.beforePostKey;
    const wantKeyset = before !== undefined;
    let usedKeyset = wantKeyset;
    let offset = usedKeyset ? 0 : (opts.offset ?? 0);
    const orderBy = feedOrderByClause(sort);
    const hasAuthor = !!opts.author;
    const kind = opts.kind?.trim() || '';
    const chronoKeysetVars =
      !hot && before !== undefined && beforePostKey
        ? {
            beforeBlockHeight: before,
            beforePostKey,
          }
        : {};
    const variables = {
      ...(hasAuthor ? { author: opts.author } : {}),
      ...(kind ? { kind } : {}),
      limit,
      offset,
      ...chronoKeysetVars,
    };

    const conditions: string[] = [];
    if (hasAuthor) conditions.push('accountId: {_eq: $author}');
    if (kind) conditions.push('kind: {_eq: $kind}');
    if (opts.section === 'posts') {
      conditions.push('parentPath: {_eq: ""}', 'refType: {_neq: "repost"}');
    } else if (opts.section === 'replies') {
      conditions.push('parentPath: {_neq: ""}');
    } else if (opts.section === 'reposts') {
      conditions.push('refType: {_eq: "repost"}');
    }
    if (before !== undefined && beforePostKey && !hot) {
      conditions.push(chronoContentPathKeysetAnd());
    }
    const whereClause =
      conditions.length > 0 ? `where: {${conditions.join(', ')}}, ` : '';
    const params = [
      ...(hasAuthor ? ['$author: String!'] : []),
      ...(kind ? ['$kind: String!'] : []),
      ...(before !== undefined && beforePostKey && !hot
        ? ['$beforeBlockHeight: bigint!', '$beforePostKey: String!']
        : []),
      '$limit: Int!',
      '$offset: Int!',
    ].join(', ');

    const chronoOrder = feedOrderByClause('recent');
    const chronoNarrow =
      !hot && (hasAuthor || Boolean(kind) || Boolean(opts.section));

    const loadHotRows = async (keyset: boolean) =>
      this.queryFeedRows({
        variables: { ...variables, offset: keyset ? 0 : (opts.offset ?? 0) },
        feedHotQuery: feedHotQuery(FEED_POST_ROW_FIELDS, {
          author: hasAuthor,
          kind: Boolean(kind),
          section: Boolean(opts.section),
          beforeKeyset: keyset,
        }),
        feedHotVariables: {
          limit,
          offset: keyset ? 0 : (opts.offset ?? 0),
          ...(hasAuthor ? { author: opts.author } : {}),
          ...(kind ? { kind } : {}),
          ...(opts.section ? { section: opts.section } : {}),
          ...(keyset &&
          before !== undefined &&
          beforeHeat !== undefined &&
          beforePostKey
            ? {
                before_amplify_heat: beforeHeat,
                before_block_height: before,
                before_post_key: beforePostKey,
              }
            : {}),
        },
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

    let rows: PostRow[];
    if (hot) {
      // Keyset load-more must not fall back to offset 0 (page-1 replay).
      rows = await loadHotRows(wantKeyset);
    } else {
      rows = await this.queryFeedRows({
        variables,
        ...(chronoNarrow
          ? {
              feedRecentQuery: feedRecentQuery(FEED_POST_ROW_FIELDS, {
                author: hasAuthor,
                kind: Boolean(kind),
                section: Boolean(opts.section),
                beforeKeyset: usedKeyset,
              }),
              feedRecentVariables: {
                limit,
                offset,
                ...(hasAuthor ? { author: opts.author } : {}),
                ...(kind ? { kind } : {}),
                ...(opts.section ? { section: opts.section } : {}),
                ...(before !== undefined && beforePostKey
                  ? {
                      before_block_height: before,
                      before_post_key: beforePostKey,
                    }
                  : {}),
              },
            }
          : {}),
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
        // postsCurrent has no contentPath — height-only last-resort fallback.
        postsCurrentQuery: `query Posts(${[
          ...(hasAuthor ? ['$author: String!'] : []),
          ...(kind ? ['$kind: String!'] : []),
          ...(before !== undefined && !hot
            ? ['$beforeBlockHeight: bigint!']
            : []),
          '$limit: Int!',
          '$offset: Int!',
        ].join(', ')}) {
        postsCurrent(${(() => {
          const base: string[] = [];
          if (hasAuthor) base.push('accountId: {_eq: $author}');
          if (kind) base.push('kind: {_eq: $kind}');
          if (opts.section === 'posts') {
            base.push('parentPath: {_eq: ""}', 'refType: {_neq: "repost"}');
          } else if (opts.section === 'replies') {
            base.push('parentPath: {_neq: ""}');
          } else if (opts.section === 'reposts') {
            base.push('refType: {_eq: "repost"}');
          }
          if (before !== undefined && !hot) {
            base.push('blockHeight: {_lt: $beforeBlockHeight}');
          }
          return base.length > 0
            ? `where: {${base.join(', ')}}, `
            : '';
        })()}limit: $limit, offset: $offset, orderBy: [{blockHeight: DESC}]) {
          ${POST_ROW_FIELDS}
        }
      }`,
      });
    }

    return hot
      ? hotDescPage(rows, limit, { offset, usedKeyset })
      : chronoDescPage(rows, limit, { offset, usedKeyset });
  }

  /**
   * Current rows for the given (accountId, postId) pairs. Pairs whose row no
   * longer exists come back absent, so callers can reconcile deleted or
   * edited feed rows without refetching a whole page.
   *
   * ```ts
   * const fresh = await os.query.feed.statesByIds([{ accountId: 'alice.near', postId: '1' }]);
   * ```
   */
  async statesByIds(
    pairs: Array<{ accountId: string; postId: string }>
  ): Promise<PostRow[]> {
    const unique = new Map<string, { accountId: string; postId: string }>();
    for (const pair of pairs) {
      if (!pair.accountId || !pair.postId) continue;
      unique.set(`${pair.accountId}:${pair.postId}`, pair);
    }
    const stubs = [...unique.values()];
    if (stubs.length === 0) return [];
    return this.hydrateStubRows('PostStatesByIds', stubs, stubs.length);
  }

  /**
   * Feed from a list of accounts (e.g. accounts you stand with).
   *
   * `nativeOnly` drops replies whose parent author is outside `accounts`
   * (Circle). Pulse uses {@link FeedQuery.pulse} to bring those threads back
   * as parent + peek.
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
    nativeOnly?: boolean;
    /**
     * Exclusive upper bound for descending Recent pages, or the height
     * leg of a Hot/chrono keyset (with `beforePostKey`). Prefer over
     * `offset` under live inserts.
     */
    beforeBlockHeight?: number;
    /** Hot keyset heat leg (`feed_hot.before_amplify_heat`). */
    beforeHeat?: number;
    /**
     * Content-path tie-break — Hot and chrono. Chrono keysets require this
     * with `beforeBlockHeight`.
     */
    beforePostKey?: string;
  }): Promise<Paginated<PostRow>> {
    if (opts.accounts.length === 0) return { items: [] };
    const limit = opts.limit ?? 20;
    const sort = opts.sort ?? 'recent';
    const hot = sort === 'hot';
    const chronoKey = !hot
      ? requireChronoKeyset({
          beforeBlockHeight: opts.beforeBlockHeight,
          beforePostKey: opts.beforePostKey,
        })
      : null;
    if (chronoKey && !chronoKey.ok) {
      throw new Error(chronoKey.message);
    }
    const hotKey = hot
      ? requireHotKeyset({
          beforeBlockHeight: opts.beforeBlockHeight,
          beforeHeat: opts.beforeHeat,
          beforePostKey: opts.beforePostKey,
        })
      : null;
    if (hotKey && !hotKey.ok) {
      throw new Error(hotKey.message);
    }
    const before = hot ? hotKey?.before : chronoKey?.before;
    const beforeHeat = hot ? hotKey?.beforeHeat : undefined;
    const beforePostKey = hot ? hotKey?.beforePostKey : chronoKey?.beforePostKey;
    const wantKeyset = before !== undefined;
    let usedKeyset = wantKeyset;
    let offset = usedKeyset ? 0 : (opts.offset ?? 0);
    const orderBy = feedOrderByClause(sort);
    const chronoOrder = feedOrderByClause('recent');
    const nativeOnly = Boolean(opts.nativeOnly);
    const chronoBefore =
      !hot && before !== undefined && beforePostKey ? before : undefined;
    const chronoKeyFragment =
      chronoBefore !== undefined ? `, ${chronoContentPathKeysetAnd()}` : '';
    const where = nativeOnly
      ? `where: {_and: [
            {accountId: {_in: $accounts}},
            {_or: [
              {parentPath: {_eq: ""}},
              {parentAuthor: {_in: $accounts}}
            ]}
            ${chronoKeyFragment}
          ]}`
      : chronoBefore !== undefined
        ? `where: {_and: [
            {accountId: {_in: $accounts}},
            ${chronoContentPathKeysetAnd()}
          ]}`
        : accountsFeedWhere(false);
    const beforeParam =
      chronoBefore !== undefined
        ? ', $beforeBlockHeight: bigint!, $beforePostKey: String!'
        : '';
    const variables = {
      accounts: opts.accounts,
      limit,
      offset,
      ...(chronoBefore !== undefined && beforePostKey
        ? {
            beforeBlockHeight: chronoBefore,
            beforePostKey,
          }
        : {}),
    };

    const loadHotRows = async (keyset: boolean) =>
      this.queryFeedRows({
        variables: {
          accounts: opts.accounts,
          limit,
          offset: keyset ? 0 : (opts.offset ?? 0),
        },
        feedHotQuery: feedHotQuery(FEED_POST_ROW_FIELDS, {
          accounts: true,
          nativeOnly,
          beforeKeyset: keyset,
        }),
        feedHotVariables: {
          accounts: pulseAccountsTextArray(opts.accounts),
          limit,
          offset: keyset ? 0 : (opts.offset ?? 0),
          ...(nativeOnly ? { native_only: true } : {}),
          ...(keyset &&
          before !== undefined &&
          beforeHeat !== undefined &&
          beforePostKey
            ? {
                before_amplify_heat: beforeHeat,
                before_block_height: before,
                before_post_key: beforePostKey,
              }
            : {}),
        },
        postsFeedQuery: `query Feed($accounts: [String!]!, $limit: Int!, $offset: Int!${beforeParam}) {
        postsFeed(
          ${where},
          limit: $limit, offset: $offset,
          orderBy: ${orderBy}
        ) {
          ${FEED_POST_ROW_FIELDS}
        }
      }`,
        postsFeedQueryNoHeat: `query Feed($accounts: [String!]!, $limit: Int!, $offset: Int!${beforeParam}) {
        postsFeed(
          ${where},
          limit: $limit, offset: $offset,
          orderBy: ${chronoOrder}
        ) {
          ${FEED_POST_ROW_FIELDS_NO_HEAT}
        }
      }`,
        postsCurrentQuery: `query Feed($accounts: [String!]!, $limit: Int!, $offset: Int!${beforeParam}) {
        postsCurrent(
          ${where},
          limit: $limit, offset: $offset,
          orderBy: [{blockHeight: DESC}]
        ) {
          ${POST_ROW_FIELDS}
        }
      }`,
      });

    let rows: PostRow[];
    if (hot) {
      // Keyset load-more must not fall back to offset 0 (page-1 replay).
      rows = await loadHotRows(wantKeyset);
    } else {
      rows = await this.queryFeedRows({
        variables,
        feedRecentQuery: feedRecentQuery(FEED_POST_ROW_FIELDS, {
          accounts: true,
          nativeOnly,
          beforeKeyset: usedKeyset,
        }),
        feedRecentVariables: {
          accounts: pulseAccountsTextArray(opts.accounts),
          limit,
          offset,
          ...(nativeOnly ? { native_only: true } : {}),
          ...(before !== undefined && beforePostKey
            ? {
                before_block_height: before,
                before_post_key: beforePostKey,
              }
            : {}),
        },
        postsFeedQuery: `query Feed($accounts: [String!]!, $limit: Int!, $offset: Int!${beforeParam}) {
        postsFeed(
          ${where},
          limit: $limit, offset: $offset,
          orderBy: ${orderBy}
        ) {
          ${FEED_POST_ROW_FIELDS}
        }
      }`,
        postsFeedQueryNoHeat: `query Feed($accounts: [String!]!, $limit: Int!, $offset: Int!${beforeParam}) {
        postsFeed(
          ${where},
          limit: $limit, offset: $offset,
          orderBy: ${chronoOrder}
        ) {
          ${FEED_POST_ROW_FIELDS_NO_HEAT}
        }
      }`,
        postsCurrentQuery: `query Feed($accounts: [String!]!, $limit: Int!, $offset: Int!${beforeParam}) {
        postsCurrent(
          ${where},
          limit: $limit, offset: $offset,
          orderBy: [{blockHeight: DESC}]
        ) {
          ${POST_ROW_FIELDS}
        }
      }`,
      });
    }

    return hot
      ? hotDescPage(rows, limit, { offset, usedKeyset })
      : chronoDescPage(rows, limit, { offset, usedKeyset });
  }

  private async queryFeedPulseRows(args: {
    accounts: string[];
    cardLimit: number;
    cardOffset: number;
    sort: FeedSort;
    beforeEventHeight?: number;
    beforeEventHeat?: number;
    beforeEventKey?: string;
  }): Promise<PostRow[]> {
    const useKeyset = args.beforeEventHeight != null;
    const variables: Record<string, unknown> = {
      accounts: pulseAccountsTextArray(args.accounts),
      card_limit: args.cardLimit,
      card_offset: useKeyset ? 0 : args.cardOffset,
      sort: args.sort,
    };
    const keysetParams = useKeyset
      ? ', $before_event_height: bigint, $before_event_heat: float8, $before_event_key: String'
      : '';
    const keysetArgs = useKeyset
      ? `,
          before_event_height: $before_event_height,
          before_event_heat: $before_event_heat,
          before_event_key: $before_event_key`
      : '';
    if (useKeyset) {
      variables.before_event_height = args.beforeEventHeight;
      variables.before_event_heat = args.beforeEventHeat ?? null;
      variables.before_event_key = args.beforeEventKey ?? null;
    }
    const query = (
      fields: string
    ) => `query Pulse($accounts: _text, $card_limit: Int!, $card_offset: Int!, $sort: String${keysetParams}) {
        feedPulse(args: {
          accounts: $accounts,
          card_limit: $card_limit,
          card_offset: $card_offset,
          sort: $sort${keysetArgs}
        }) {
          ${fields}
        }
      }`;

    const wantHeat = !this.amplifyHeatFallback.active;
    try {
      const res = await this._q.graphql<{ feedPulse?: PostRow[] }>({
        query: query(
          wantHeat
            ? FEED_POST_ROW_FIELDS_WITH_ROOT
            : FEED_POST_ROW_FIELDS_NO_HEAT_WITH_ROOT
        ),
        variables,
      });
      return this.enrichFeedPosts(res.data?.feedPulse ?? []);
    } catch (err) {
      if (
        useKeyset &&
        err instanceof GraphQLValidationError &&
        `${err.message} ${err.errors.map((e) => e.message ?? '').join(' ')}`
          .toLowerCase()
          .includes('before_event')
      ) {
        // Keyset args not tracked yet — caller falls back to offset.
        throw err;
      }
      if (!wantHeat || !isAmplifyHeatUnavailableError(err)) throw err;
      this.amplifyHeatFallback.trip();
      const res = await this._q.graphql<{ feedPulse?: PostRow[] }>({
        query: query(FEED_POST_ROW_FIELDS_NO_HEAT_WITH_ROOT),
        variables,
      });
      return this.enrichFeedPosts(res.data?.feedPulse ?? []);
    }
  }

  /**
   * Pulse feed — Circle posts plus stranger threads a circle member replied
   * into. Hot ranks a circle card by the hotter of the post and its reply,
   * and a stranger thread by the circle reply. Each card flattens to
   * `[threadRoot, newestCircleReply]`.
   *
   * SQL `feed_pulse` only. `limit` / `offset` page cards, not raw rows.
   * Prefer `beforeEventHeight` (+ heat/key) for load-more under live lifts.
   *
   * ```ts
   * const { items } = await os.query.feed.pulse({ accounts, limit: 20, sort: 'hot' });
   * ```
   */
  async pulse(opts: {
    accounts: string[];
    limit?: number;
    offset?: number;
    sort?: FeedSort;
    beforeEventHeight?: number;
    beforeEventHeat?: number;
    beforeEventKey?: string;
  }): Promise<Paginated<PostRow>> {
    if (opts.accounts.length === 0) return { items: [] };
    const limit = opts.limit ?? 20;
    const sort = opts.sort ?? 'recent';
    const pulseKey = requirePulseKeyset({
      sort,
      beforeEventHeight: opts.beforeEventHeight,
      beforeEventHeat: opts.beforeEventHeat,
      beforeEventKey: opts.beforeEventKey,
    });
    if (!pulseKey.ok) {
      throw new Error(pulseKey.message);
    }
    const beforeHeight = pulseKey.beforeEventHeight;
    const usedKeyset = beforeHeight !== undefined;
    const offset = usedKeyset ? 0 : (opts.offset ?? 0);
    const beforeHeat = pulseKey.beforeEventHeat;
    const beforeKey = pulseKey.beforeEventKey;

    // Keyset load-more must not fall back to offset 0 (page-1 replay).
    const rows = await this.queryFeedPulseRows({
      accounts: opts.accounts,
      cardLimit: limit + 1,
      cardOffset: offset,
      sort,
      ...(usedKeyset
        ? {
            beforeEventHeight: beforeHeight,
            beforeEventHeat: beforeHeat,
            beforeEventKey: beforeKey,
          }
        : {}),
    });
    return paginatePulseFunctionRows({
      rows,
      accounts: opts.accounts,
      offset: usedKeyset ? 0 : (opts.offset ?? 0),
      limit,
      usedKeyset,
      sort,
    });
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
      feedRecentQuery: feedRecentQuery(FEED_POST_ROW_FIELDS, {
        accounts: true,
        channel: opts.channel !== undefined,
        kind: opts.kind !== undefined,
        audience: opts.audience !== undefined,
      }),
      feedRecentVariables: {
        accounts: pulseAccountsTextArray(opts.accounts),
        limit,
        offset,
        ...(opts.channel !== undefined ? { channel: opts.channel } : {}),
        ...(opts.kind !== undefined ? { kind: opts.kind } : {}),
        ...(opts.audience !== undefined
          ? { audience_like: audienceLikeValue(opts.audience) }
          : {}),
      },
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
      postsFeedQueryNoHeat: `query FilteredFeed($accounts: [String!]!, $limit: Int!, $offset: Int!${filterExtras}) {
        postsFeed(
          where: {_and: [
            {accountId: {_in: $accounts}}${whereExtras}
          ]},
          limit: $limit,
          offset: $offset,
          orderBy: [{blockHeight: DESC}]
        ) {
          ${FEED_POST_ROW_FIELDS_NO_HEAT}
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
   * Posts tagged with a hashtag (paginated; newest first, or heat-ordered
   * with `sort: 'hot'` once the topic `heat` column is deployed).
   * Hydrates full `postsFeed` / `postsCurrent` rows so list UIs get text/media.
   *
   * ```ts
   * const page = await os.query.feed.byHashtag('onchain', { limit: 20, sort: 'hot' });
   * ```
   */
  async byHashtag(
    hashtag: string,
    opts: {
      limit?: number;
      offset?: number;
      sort?: FeedSort;
      beforeBlockHeight?: number;
    } = {}
  ): Promise<Paginated<PostRow>> {
    const limit = opts.limit ?? 20;
    const sort = opts.sort ?? 'recent';
    const hot = sort === 'hot';
    const before = hot
      ? undefined
      : normalizeBeforeBlockHeight(opts.beforeBlockHeight);
    const usedKeyset = before !== undefined;
    const offset = usedKeyset ? 0 : (opts.offset ?? 0);
    type HashtagStub = {
      accountId: string;
      postId: string;
      hashtag: string;
      blockHeight: number;
      blockTimestamp: number;
      groupId: string | null;
    };
    const beforeParam =
      before !== undefined ? ', $beforeBlockHeight: bigint!' : '';
    const heightFilter =
      before !== undefined ? ', blockHeight: {_lt: $beforeBlockHeight}' : '';
    const stubs = await this.queryTopicStubs<HashtagStub>({
      buildQuery: (
        orderBy
      ) => `query PostsByHashtag($tag: String!, $limit: Int!, $offset: Int!${beforeParam}) {
        postHashtags(
          where: {hashtag: {_eq: $tag}${heightFilter}},
          orderBy: ${orderBy},
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
        ...(before !== undefined ? { beforeBlockHeight: before } : {}),
      },
      sort,
      pick: (data) =>
        (data as { postHashtags?: HashtagStub[] } | undefined)?.postHashtags,
    });

    if (stubs.length === 0) {
      return { items: [] };
    }

    const items = await this.hydrateStubRows(
      'PostsByHashtagHydrate',
      stubs,
      limit
    );
    return hot
      ? {
          items,
          nextOffset: stubs.length >= limit ? offset + limit : undefined,
        }
      : chronoDescPage(items, limit, {
          offset,
          usedKeyset,
          edgeCount: stubs.length,
          edgeHeight: stubs[stubs.length - 1]?.blockHeight,
        });
  }

  /**
   * Posts tagged with a ticker / cashtag (paginated; newest first, or
   * heat-ordered with `sort: 'hot'` once the topic `heat` column is deployed).
   * Hydrates full `postsFeed` / `postsCurrent` rows so list UIs get text/media.
   *
   * ```ts
   * const page = await os.query.feed.byTicker('social', { limit: 20, sort: 'hot' });
   * ```
   */
  async byTicker(
    ticker: string,
    opts: {
      limit?: number;
      offset?: number;
      sort?: FeedSort;
      beforeBlockHeight?: number;
    } = {}
  ): Promise<Paginated<PostRow>> {
    const limit = opts.limit ?? 20;
    const sort = opts.sort ?? 'recent';
    const hot = sort === 'hot';
    const before = hot
      ? undefined
      : normalizeBeforeBlockHeight(opts.beforeBlockHeight);
    const usedKeyset = before !== undefined;
    const offset = usedKeyset ? 0 : (opts.offset ?? 0);
    type TickerStub = {
      accountId: string;
      postId: string;
      ticker: string;
      blockHeight: number;
      blockTimestamp: number;
      groupId: string | null;
    };
    const beforeParam =
      before !== undefined ? ', $beforeBlockHeight: bigint!' : '';
    const heightFilter =
      before !== undefined ? ', blockHeight: {_lt: $beforeBlockHeight}' : '';
    const stubs = await this.queryTopicStubs<TickerStub>({
      buildQuery: (
        orderBy
      ) => `query PostsByTicker($ticker: String!, $limit: Int!, $offset: Int!${beforeParam}) {
        postTickers(
          where: {ticker: {_eq: $ticker}${heightFilter}},
          orderBy: ${orderBy},
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
        ...(before !== undefined ? { beforeBlockHeight: before } : {}),
      },
      sort,
      pick: (data) =>
        (data as { postTickers?: TickerStub[] } | undefined)?.postTickers,
    });

    if (stubs.length === 0) {
      return { items: [] };
    }

    const items = await this.hydrateStubRows(
      'PostsByTickerHydrate',
      stubs,
      limit
    );
    return hot
      ? {
          items,
          nextOffset: stubs.length >= limit ? offset + limit : undefined,
        }
      : chronoDescPage(items, limit, {
          offset,
          usedKeyset,
          edgeCount: stubs.length,
          edgeHeight: stubs[stubs.length - 1]?.blockHeight,
        });
  }

  /**
   * Posts tagged with a place (paginated; newest first, or heat-ordered
   * with `sort: 'hot'` once the topic `heat` column is deployed).
   * Hydrates full `postsFeed` / `postsCurrent` rows so list UIs get text/media.
   *
   * ```ts
   * const page = await os.query.feed.byPlace('lisbon', { limit: 20, sort: 'hot' });
   * ```
   */
  async byPlace(
    place: string,
    opts: {
      limit?: number;
      offset?: number;
      sort?: FeedSort;
      beforeBlockHeight?: number;
    } = {}
  ): Promise<Paginated<PostRow>> {
    const limit = opts.limit ?? 20;
    const sort = opts.sort ?? 'recent';
    const hot = sort === 'hot';
    const before = hot
      ? undefined
      : normalizeBeforeBlockHeight(opts.beforeBlockHeight);
    const usedKeyset = before !== undefined;
    const offset = usedKeyset ? 0 : (opts.offset ?? 0);
    type PlaceStub = {
      accountId: string;
      postId: string;
      place: string;
      blockHeight: number;
      blockTimestamp: number;
      groupId: string | null;
    };
    const beforeParam =
      before !== undefined ? ', $beforeBlockHeight: bigint!' : '';
    const heightFilter =
      before !== undefined ? ', blockHeight: {_lt: $beforeBlockHeight}' : '';
    const stubs = await this.queryTopicStubs<PlaceStub>({
      buildQuery: (
        orderBy
      ) => `query PostsByPlace($place: String!, $limit: Int!, $offset: Int!${beforeParam}) {
        postPlaces(
          where: {place: {_eq: $place}${heightFilter}},
          orderBy: ${orderBy},
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
        ...(before !== undefined ? { beforeBlockHeight: before } : {}),
      },
      sort,
      pick: (data) =>
        (data as { postPlaces?: PlaceStub[] } | undefined)?.postPlaces,
    });

    if (stubs.length === 0) {
      return { items: [] };
    }

    const items = await this.hydrateStubRows(
      'PostsByPlaceHydrate',
      stubs,
      limit
    );
    return hot
      ? {
          items,
          nextOffset: stubs.length >= limit ? offset + limit : undefined,
        }
      : chronoDescPage(items, limit, {
          offset,
          usedKeyset,
          edgeCount: stubs.length,
          edgeHeight: stubs[stubs.length - 1]?.blockHeight,
        });
  }
}
