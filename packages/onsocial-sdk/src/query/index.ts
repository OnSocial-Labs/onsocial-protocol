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
//   os.query.pages.getConfig('alice.near')
//   os.query.profiles.search({ query: 'alice' })
//   os.query.profiles.discoverPage({ limit: 24, viewerAccountId: 'bob.near' })
//   os.query.stats.protocolTotals()
//   os.query.stats.protocolPulse()
//   os.query.reactions.counts('alice.near', 'post/123')
//   os.query.graph.incoming('alice.near')
//   os.query.profiles.discoverPage({ limit: 24, viewerAccountId: 'bob.near' })
//   os.query.standings.incomingDetailed('alice.near', { limit: 24, offset: 0 })
//   os.query.standings.mutualDetailed('alice.near', { limit: 24, offset: 0 })
//   os.query.endorsements.received('alice.near', { limit: 24, offset: 0 })
//   os.query.endorsements.receivedFromIssuer('bob.near', 'alice.near')
//   os.query.saves.list('alice.near')
//   os.query.attestations.issued('alice.near')
//   os.query.hashtags.trending()
//   os.query.stats.leaderboard()
//   os.query.storage.tipsReceived('alice.near')
//   os.query.permissions.grantsBy('alice.near')
//   os.query.governance.proposals('dao')
//   os.query.scarces.tokenHistory('s:42')
//   os.query.rewards.creditsTo('alice.near')
//   os.query.token.transfersTo('alice.near')
//   os.query.boost.topBoosters({ limit: 10 })
//   os.query.socialSpend.seasonActivity('season0')
//   os.query.raw.byType('vegancert')
//
// For unindexed or one-off queries, drop down to `os.query.graphql<T>(...)`.
// ---------------------------------------------------------------------------

import type { HttpClient } from '../internal/http.js';
import type { GraphQLRequest, GraphQLResponse, QueryLimits } from '../types.js';

import { GraphQLValidationError } from './_shared.js';

import { FeedQuery } from './feed.js';
import { ThreadsQuery } from './threads.js';
import { GroupsQuery } from './groups.js';
import { ProfilesQuery } from './profiles.js';
import { ReactionsQuery } from './reactions.js';
import { GraphQuery } from './graph.js';
import { StandingsQuery } from './standings.js';
import { SavesQuery } from './saves.js';
import { EndorsementsQuery } from './endorsements.js';
import { AttestationsQuery } from './attestations.js';
import { HashtagsQuery } from './hashtags.js';
import { StatsQuery } from './stats.js';
import { StorageQuery } from './storage.js';
import { PermissionsQuery } from './permissions.js';
import { GovernanceQuery } from './governance.js';
import { ScarcesQuery } from './scarces.js';
import { RewardsQuery } from './rewards.js';
import { TokenQuery } from './token.js';
import { BoostQuery } from './boost.js';
import { SocialSpendQuery } from './social-spend.js';
import { RawQuery } from './raw.js';
import { PagesQuery } from './pages.js';

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
export type {
  ThreadEdge,
  ThreadNode,
  ThreadTree,
  ThreadTreeOptions,
} from './threads.js';
export type { SaveRow } from './saves.js';
export type { EndorsementRow } from './endorsements.js';
export type { ClaimRow } from './attestations.js';
export type {
  GraphCountFilter,
  GraphEdgeCountRow,
  GraphEdgeFilter,
  GraphEdgeRow,
} from './graph.js';
export type {
  ProfileDiscoverPageOptions,
  ProfileDiscoverPageResult,
  ProfileDiscoverStandingRow,
  ProfileDiscoverViewerContext,
  ProfileSearchOptions,
  ProfileSearchRow,
} from './profiles.js';
export type {
  EdgeCount,
  LeaderboardEntry,
  ProtocolPulse,
  ProtocolTotals,
  TokenStats,
} from './stats.js';
export type { StorageEventRow } from './storage.js';
export type { PermissionEventRow } from './permissions.js';
export { PERMISSION_OPERATIONS } from './permissions.js';
export type { GovernanceEventRow } from './governance.js';
export { GOVERNANCE_OPERATIONS } from './governance.js';
export type { ScarcesEventRow } from './scarces.js';
export { SCARCES_OPERATIONS } from './scarces.js';
export {
  SCARCES_EVENT_TYPES,
  SCARCES_CONTRACT_EVENTS,
  type ScarcesEventType,
} from './scarces-events.js';
export type { RewardsEventRow, UserRewardStateRow } from './rewards.js';
export { REWARDS_EVENT_TYPES } from './rewards.js';
export type { TokenEventRow, TokenAccountActivityRow } from './token.js';
export { TOKEN_EVENT_TYPES } from './token.js';
export type {
  BoostEventRow,
  BoosterStateRow,
  BoostCreditPurchaseRow,
} from './boost.js';
export { BOOST_EVENT_TYPES } from './boost.js';
export type { SocialSpendEventRow } from './social-spend.js';
export {
  SOCIAL_SPEND_EVENT_TYPES,
  aggregateEndorsementSupportRows,
  parseLegacyEndorsementSpendTargetId,
} from './social-spend.js';
export type {
  EndorsementSupporterAggregate,
  EndorsementSupportGivenRow,
  EndorsementSupportSummaryResult,
} from './social-spend.js';
export type { SocialSpendEventType } from './social-spend-events.js';
export type { DataRow } from './raw.js';
export type { PageCurrentRow } from './pages.js';

export class QueryModule {
  /** @internal — used by sub-namespace classes. */
  _http: HttpClient;

  readonly feed: FeedQuery;
  readonly threads: ThreadsQuery;
  readonly groups: GroupsQuery;
  readonly profiles: ProfilesQuery;
  readonly reactions: ReactionsQuery;
  readonly graph: GraphQuery;
  readonly standings: StandingsQuery;
  readonly saves: SavesQuery;
  readonly endorsements: EndorsementsQuery;
  readonly attestations: AttestationsQuery;
  readonly hashtags: HashtagsQuery;
  readonly stats: StatsQuery;
  readonly storage: StorageQuery;
  readonly permissions: PermissionsQuery;
  readonly governance: GovernanceQuery;
  readonly scarces: ScarcesQuery;
  readonly rewards: RewardsQuery;
  readonly token: TokenQuery;
  readonly boost: BoostQuery;
  readonly socialSpend: SocialSpendQuery;
  readonly pages: PagesQuery;
  readonly raw: RawQuery;

  constructor(http: HttpClient) {
    this._http = http;
    this.feed = new FeedQuery(this);
    this.threads = new ThreadsQuery(this);
    this.groups = new GroupsQuery(this);
    this.profiles = new ProfilesQuery(this);
    this.reactions = new ReactionsQuery(this);
    this.graph = new GraphQuery(this);
    this.standings = new StandingsQuery(this);
    this.saves = new SavesQuery(this);
    this.endorsements = new EndorsementsQuery(this);
    this.attestations = new AttestationsQuery(this);
    this.hashtags = new HashtagsQuery(this);
    this.stats = new StatsQuery(this, http);
    this.storage = new StorageQuery(this);
    this.permissions = new PermissionsQuery(this);
    this.governance = new GovernanceQuery(this);
    this.scarces = new ScarcesQuery(this);
    this.rewards = new RewardsQuery(this);
    this.token = new TokenQuery(this);
    this.boost = new BoostQuery(this);
    this.socialSpend = new SocialSpendQuery(this);
    this.pages = new PagesQuery(this);
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
