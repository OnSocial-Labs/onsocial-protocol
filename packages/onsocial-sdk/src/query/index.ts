// ---------------------------------------------------------------------------
// OnSocial SDK — query module (GraphQL over indexed views)
//
// `QueryModule` exposes typed read helpers grouped by domain. Each domain
// lives in a sibling file as a small class; QueryModule wires them up as
// readonly sub-namespaces:
//
//   os.query.feed.recent({ limit: 20 })
//   os.query.threads.replies('alice.near', '123')
//   os.query.groups.feed({ groupId: 'dao' })
//   os.query.profiles.get('alice.near')
//   os.query.reactions.counts('alice.near', 'post/123')
//   os.query.standings.outgoing('alice.near')
//   os.query.saves.list('alice.near')
//   os.query.endorsements.given('alice.near')
//   os.query.attestations.issued('alice.near')
//   os.query.hashtags.trending()
//   os.query.stats.leaderboard()
//   os.query.storage.tipsReceived('alice.near')
//   os.query.permissions.grantsBy('alice.near')
//   os.query.raw.byType('vegancert')
//
// For unindexed or one-off queries, drop down to `os.query.graphql<T>(...)`.
// ---------------------------------------------------------------------------

import type { HttpClient } from '../http.js';
import type { GraphQLRequest, GraphQLResponse, QueryLimits } from '../types.js';

import { GraphQLValidationError } from './_shared.js';

import { FeedQuery } from './feed.js';
import { ThreadsQuery } from './threads.js';
import { GroupsQuery } from './groups.js';
import { ProfilesQuery } from './profiles.js';
import { ReactionsQuery } from './reactions.js';
import { StandingsQuery } from './standings.js';
import { SavesQuery } from './saves.js';
import { EndorsementsQuery } from './endorsements.js';
import { AttestationsQuery } from './attestations.js';
import { HashtagsQuery } from './hashtags.js';
import { StatsQuery } from './stats.js';
import { StorageQuery } from './storage.js';
import { PermissionsQuery } from './permissions.js';
import { RawQuery } from './raw.js';

export { GraphQLValidationError } from './_shared.js';
export type {
  PostRow,
  ReactionRow,
  Paginated,
  HashtagCount,
  GroupConversation,
  FeedFilter,
  GroupFeedFilter,
} from './types.js';
export type { SaveRow } from './saves.js';
export type { EndorsementRow } from './endorsements.js';
export type { ClaimRow } from './attestations.js';
export type { EdgeCount, LeaderboardEntry, TokenStats } from './stats.js';
export type { StorageEventRow } from './storage.js';
export type { PermissionEventRow } from './permissions.js';
export { PERMISSION_OPERATIONS } from './permissions.js';
export type { DataRow } from './raw.js';

export class QueryModule {
  /** @internal — used by sub-namespace classes. */
  _http: HttpClient;

  readonly feed: FeedQuery;
  readonly threads: ThreadsQuery;
  readonly groups: GroupsQuery;
  readonly profiles: ProfilesQuery;
  readonly reactions: ReactionsQuery;
  readonly standings: StandingsQuery;
  readonly saves: SavesQuery;
  readonly endorsements: EndorsementsQuery;
  readonly attestations: AttestationsQuery;
  readonly hashtags: HashtagsQuery;
  readonly stats: StatsQuery;
  readonly storage: StorageQuery;
  readonly permissions: PermissionsQuery;
  readonly raw: RawQuery;

  constructor(http: HttpClient) {
    this._http = http;
    this.feed = new FeedQuery(this);
    this.threads = new ThreadsQuery(this);
    this.groups = new GroupsQuery(this);
    this.profiles = new ProfilesQuery(this);
    this.reactions = new ReactionsQuery(this);
    this.standings = new StandingsQuery(this);
    this.saves = new SavesQuery(this);
    this.endorsements = new EndorsementsQuery(this);
    this.attestations = new AttestationsQuery(this);
    this.hashtags = new HashtagsQuery(this);
    this.stats = new StatsQuery(this, http);
    this.storage = new StorageQuery(this);
    this.permissions = new PermissionsQuery(this);
    this.raw = new RawQuery(this);
  }

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
    const res = await this._http.post<GraphQLResponse<T>>('/graph/query', req);
    // Defensive: if the server returned errors AND no data, throw rather than
    // letting helpers silently coerce `res.data?.x ?? []` to an empty array.
    // GraphQL allows partial results (data + errors), so only escalate when
    // data is fully missing — that's the case where a downstream `?? []`
    // would mask a schema validation failure (e.g. column drift).
    if (res.errors?.length && (res.data === null || res.data === undefined)) {
      const messages = res.errors
        .map((e) => e.message ?? 'unknown error')
        .join('; ');
      throw new GraphQLValidationError(messages, res.errors);
    }
    return res;
  }

  /** Get query limits for the current tier. */
  async getLimits(): Promise<QueryLimits> {
    return this._http.get<QueryLimits>('/graph/limits');
  }
}
