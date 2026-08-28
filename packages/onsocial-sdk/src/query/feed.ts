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
import {
  assemblePulsePage,
  paginatePulseFunctionRows,
  pulseParentRefsToHydrate,
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
const POST_ROW_FIELDS_WITH_ROOT = `${POST_ROW_FIELDS}
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

function isFeedPulseUnavailableError(err: unknown): boolean {
  if (!(err instanceof GraphQLValidationError)) return false;
  const hay =
    `${err.message} ${err.errors.map((e) => e.message ?? '').join(' ')}`.toLowerCase();
  return hay.includes('feedpulse') || hay.includes('feed_pulse');
}

function isRootPathUnavailableError(err: unknown): boolean {
  if (!(err instanceof GraphQLValidationError)) return false;
  const hay =
    `${err.message} ${err.errors.map((e) => e.message ?? '').join(' ')}`.toLowerCase();
  return hay.includes('rootpath') || hay.includes('root_path');
}

function isAmplifyHeatUnavailableError(err: unknown): boolean {
  if (!(err instanceof GraphQLValidationError)) return false;
  const hay =
    `${err.message} ${err.errors.map((e) => e.message ?? '').join(' ')}`.toLowerCase();
  return hay.includes('amplifyheat') || hay.includes('amplify_heat');
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

const PULSE_BRIDGE_WHERE = `where: {_and: [
            {accountId: {_in: $accounts}},
            {parentPath: {_neq: ""}},
            {parentAuthor: {_neq: ""}},
            {parentAuthor: {_nin: $accounts}}
          ]}`;

export class FeedQuery {
  /** Set when GraphQL rejects `postsFeed` (view not tracked yet). */
  private postsFeedFallback = new SchemaFallback();

  /** Set when GraphQL rejects `amplifyHeat` (column not tracked yet). */
  private amplifyHeatFallback = new SchemaFallback();

  /** Set when topic index views reject `heat` ordering (column not tracked yet). */
  private topicHeatFallback = new SchemaFallback();

  /** Set when GraphQL rejects `feedPulse` (function not tracked yet). */
  private feedPulseFallback = new SchemaFallback();

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
  }): Promise<PostRow[]> {
    if (!this.postsFeedFallback.active) {
      const useNoHeat =
        this.amplifyHeatFallback.active && Boolean(args.postsFeedQueryNoHeat);
      const feedQuery = useNoHeat
        ? args.postsFeedQueryNoHeat!
        : args.postsFeedQuery;
      try {
        const res = await this._q.graphql<{ postsFeed: PostRow[] }>({
          query: feedQuery,
          variables: args.variables,
        });
        // A full-heat success means the column is tracked again.
        if (!useNoHeat) this.amplifyHeatFallback.clear();
        return res.data?.postsFeed ?? [];
      } catch (err) {
        if (
          !useNoHeat &&
          args.postsFeedQueryNoHeat &&
          isAmplifyHeatUnavailableError(err)
        ) {
          this.amplifyHeatFallback.trip();
          const res = await this._q.graphql<{ postsFeed: PostRow[] }>({
            query: args.postsFeedQueryNoHeat,
            variables: args.variables,
          });
          return res.data?.postsFeed ?? [];
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

  private async queryPulseBridgeRows(args: {
    variables: Record<string, unknown>;
    orderBy: string;
    chronoOrder: string;
  }): Promise<PostRow[]> {
    const withRoot = {
      variables: args.variables,
      postsFeedQuery: `query PulseBridges($accounts: [String!]!, $limit: Int!, $offset: Int!) {
        postsFeed(
          ${PULSE_BRIDGE_WHERE},
          limit: $limit, offset: $offset,
          orderBy: ${args.orderBy}
        ) {
          ${FEED_POST_ROW_FIELDS_WITH_ROOT}
        }
      }`,
      postsFeedQueryNoHeat: `query PulseBridges($accounts: [String!]!, $limit: Int!, $offset: Int!) {
        postsFeed(
          ${PULSE_BRIDGE_WHERE},
          limit: $limit, offset: $offset,
          orderBy: ${args.chronoOrder}
        ) {
          ${FEED_POST_ROW_FIELDS_NO_HEAT_WITH_ROOT}
        }
      }`,
      postsCurrentQuery: `query PulseBridges($accounts: [String!]!, $limit: Int!, $offset: Int!) {
        postsCurrent(
          ${PULSE_BRIDGE_WHERE},
          limit: $limit, offset: $offset,
          orderBy: [{blockHeight: DESC}]
        ) {
          ${POST_ROW_FIELDS_WITH_ROOT}
        }
      }`,
    };
    try {
      return await this.queryFeedRows(withRoot);
    } catch (err) {
      if (!isRootPathUnavailableError(err)) throw err;
      return this.queryFeedRows({
        variables: args.variables,
        postsFeedQuery: `query PulseBridges($accounts: [String!]!, $limit: Int!, $offset: Int!) {
        postsFeed(
          ${PULSE_BRIDGE_WHERE},
          limit: $limit, offset: $offset,
          orderBy: ${args.orderBy}
        ) {
          ${FEED_POST_ROW_FIELDS}
        }
      }`,
        postsFeedQueryNoHeat: `query PulseBridges($accounts: [String!]!, $limit: Int!, $offset: Int!) {
        postsFeed(
          ${PULSE_BRIDGE_WHERE},
          limit: $limit, offset: $offset,
          orderBy: ${args.chronoOrder}
        ) {
          ${FEED_POST_ROW_FIELDS_NO_HEAT}
        }
      }`,
        postsCurrentQuery: `query PulseBridges($accounts: [String!]!, $limit: Int!, $offset: Int!) {
        postsCurrent(
          ${PULSE_BRIDGE_WHERE},
          limit: $limit, offset: $offset,
          orderBy: [{blockHeight: DESC}]
        ) {
          ${POST_ROW_FIELDS}
        }
      }`,
      });
    }
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
  }): Promise<Paginated<PostRow>> {
    if (opts.accounts.length === 0) return { items: [] };
    const limit = opts.limit ?? 20;
    const offset = opts.offset ?? 0;
    const sort = opts.sort ?? 'recent';
    const orderBy = feedOrderByClause(sort);
    const chronoOrder = feedOrderByClause('recent');
    const where = accountsFeedWhere(Boolean(opts.nativeOnly));
    const variables = { accounts: opts.accounts, limit, offset };

    const rows = await this.queryFeedRows({
      variables,
      postsFeedQuery: `query Feed($accounts: [String!]!, $limit: Int!, $offset: Int!) {
        postsFeed(
          ${where},
          limit: $limit, offset: $offset,
          orderBy: ${orderBy}
        ) {
          ${FEED_POST_ROW_FIELDS}
        }
      }`,
      postsFeedQueryNoHeat: `query Feed($accounts: [String!]!, $limit: Int!, $offset: Int!) {
        postsFeed(
          ${where},
          limit: $limit, offset: $offset,
          orderBy: ${chronoOrder}
        ) {
          ${FEED_POST_ROW_FIELDS_NO_HEAT}
        }
      }`,
      postsCurrentQuery: `query Feed($accounts: [String!]!, $limit: Int!, $offset: Int!) {
        postsCurrent(
          ${where},
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

  private async queryFeedPulseRows(args: {
    accounts: string[];
    cardLimit: number;
    cardOffset: number;
    sort: FeedSort;
  }): Promise<PostRow[]> {
    const variables = {
      accounts: args.accounts,
      cardLimit: args.cardLimit,
      cardOffset: args.cardOffset,
      sort: args.sort,
    };
    const query = (
      fields: string
    ) => `query Pulse($accounts: [String!]!, $cardLimit: Int!, $cardOffset: Int!, $sort: String) {
        feedPulse(args: {
          accounts: $accounts,
          cardLimit: $cardLimit,
          cardOffset: $cardOffset,
          sort: $sort
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
   * into. Rank a bridge by the circle reply. Each bridge flattens to
   * `[threadRoot, newestCircleReply]` so the app can peek without a second fetch.
   *
   * Prefers SQL `feed_pulse` (one query, cards already grouped). Falls back to
   * merging native + bridge streams while Hasura has not tracked the function.
   *
   * `limit` / `offset` page cards (native post or one bridge), not raw rows.
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
  }): Promise<Paginated<PostRow>> {
    if (opts.accounts.length === 0) return { items: [] };
    const limit = opts.limit ?? 20;
    const offset = opts.offset ?? 0;
    const sort = opts.sort ?? 'recent';
    if (!this.feedPulseFallback.active) {
      try {
        const rows = await this.queryFeedPulseRows({
          accounts: opts.accounts,
          cardLimit: limit + 1,
          cardOffset: offset,
          sort,
        });
        return paginatePulseFunctionRows({
          rows,
          accounts: opts.accounts,
          offset,
          limit,
        });
      } catch (err) {
        if (!isFeedPulseUnavailableError(err)) throw err;
        this.feedPulseFallback.trip();
      }
    }
    const take = offset + limit;
    const orderBy = feedOrderByClause(sort);
    const chronoOrder = feedOrderByClause('recent');
    const nativeWhere = accountsFeedWhere(true);
    const variables = {
      accounts: opts.accounts,
      limit: take,
      offset: 0,
    };

    const [native, bridges] = await Promise.all([
      this.queryFeedRows({
        variables,
        postsFeedQuery: `query PulseNative($accounts: [String!]!, $limit: Int!, $offset: Int!) {
        postsFeed(
          ${nativeWhere},
          limit: $limit, offset: $offset,
          orderBy: ${orderBy}
        ) {
          ${FEED_POST_ROW_FIELDS}
        }
      }`,
        postsFeedQueryNoHeat: `query PulseNative($accounts: [String!]!, $limit: Int!, $offset: Int!) {
        postsFeed(
          ${nativeWhere},
          limit: $limit, offset: $offset,
          orderBy: ${chronoOrder}
        ) {
          ${FEED_POST_ROW_FIELDS_NO_HEAT}
        }
      }`,
        postsCurrentQuery: `query PulseNative($accounts: [String!]!, $limit: Int!, $offset: Int!) {
        postsCurrent(
          ${nativeWhere},
          limit: $limit, offset: $offset,
          orderBy: [{blockHeight: DESC}]
        ) {
          ${POST_ROW_FIELDS}
        }
      }`,
      }),
      this.queryPulseBridgeRows({
        variables,
        orderBy,
        chronoOrder,
      }),
    ]);

    const parentRefs = pulseParentRefsToHydrate(bridges, opts.accounts);
    const parents =
      parentRefs.length > 0
        ? await this.hydrateStubRows(
            'PulseParents',
            parentRefs,
            parentRefs.length
          )
        : [];

    return assemblePulsePage({
      native,
      bridges,
      parents,
      accounts: opts.accounts,
      sort,
      offset,
      limit,
      take,
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
    opts: { limit?: number; offset?: number; sort?: FeedSort } = {}
  ): Promise<Paginated<PostRow>> {
    const limit = opts.limit ?? 20;
    const offset = opts.offset ?? 0;
    type HashtagStub = {
      accountId: string;
      postId: string;
      hashtag: string;
      blockHeight: number;
      blockTimestamp: number;
      groupId: string | null;
    };
    const stubs = await this.queryTopicStubs<HashtagStub>({
      buildQuery: (
        orderBy
      ) => `query PostsByHashtag($tag: String!, $limit: Int!, $offset: Int!) {
        postHashtags(
          where: {hashtag: {_eq: $tag}},
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
      },
      sort: opts.sort ?? 'recent',
      pick: (data) =>
        (data as { postHashtags?: HashtagStub[] } | undefined)?.postHashtags,
    });
    const nextOffset = stubs.length >= limit ? offset + limit : undefined;

    if (stubs.length === 0) {
      return { items: [], nextOffset };
    }

    const items = await this.hydrateStubRows(
      'PostsByHashtagHydrate',
      stubs,
      limit
    );
    return { items, nextOffset };
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
    opts: { limit?: number; offset?: number; sort?: FeedSort } = {}
  ): Promise<Paginated<PostRow>> {
    const limit = opts.limit ?? 20;
    const offset = opts.offset ?? 0;
    type TickerStub = {
      accountId: string;
      postId: string;
      ticker: string;
      blockHeight: number;
      blockTimestamp: number;
      groupId: string | null;
    };
    const stubs = await this.queryTopicStubs<TickerStub>({
      buildQuery: (
        orderBy
      ) => `query PostsByTicker($ticker: String!, $limit: Int!, $offset: Int!) {
        postTickers(
          where: {ticker: {_eq: $ticker}},
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
      },
      sort: opts.sort ?? 'recent',
      pick: (data) =>
        (data as { postTickers?: TickerStub[] } | undefined)?.postTickers,
    });
    const nextOffset = stubs.length >= limit ? offset + limit : undefined;

    if (stubs.length === 0) {
      return { items: [], nextOffset };
    }

    const items = await this.hydrateStubRows(
      'PostsByTickerHydrate',
      stubs,
      limit
    );
    return { items, nextOffset };
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
    opts: { limit?: number; offset?: number; sort?: FeedSort } = {}
  ): Promise<Paginated<PostRow>> {
    const limit = opts.limit ?? 20;
    const offset = opts.offset ?? 0;
    type PlaceStub = {
      accountId: string;
      postId: string;
      place: string;
      blockHeight: number;
      blockTimestamp: number;
      groupId: string | null;
    };
    const stubs = await this.queryTopicStubs<PlaceStub>({
      buildQuery: (
        orderBy
      ) => `query PostsByPlace($place: String!, $limit: Int!, $offset: Int!) {
        postPlaces(
          where: {place: {_eq: $place}},
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
      },
      sort: opts.sort ?? 'recent',
      pick: (data) =>
        (data as { postPlaces?: PlaceStub[] } | undefined)?.postPlaces,
    });
    const nextOffset = stubs.length >= limit ? offset + limit : undefined;

    if (stubs.length === 0) {
      return { items: [], nextOffset };
    }

    const items = await this.hydrateStubRows(
      'PostsByPlaceHydrate',
      stubs,
      limit
    );
    return { items, nextOffset };
  }
}
