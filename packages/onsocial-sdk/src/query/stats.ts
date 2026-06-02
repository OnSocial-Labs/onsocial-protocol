// ---------------------------------------------------------------------------
// Platform stats — leaderboard, token stats, edge counts, profile/group totals.
// Accessed as `os.query.stats.<method>()`.
// ---------------------------------------------------------------------------

import type { HttpClient } from '../internal/http.js';
import type { QueryModule } from './index.js';

export interface EdgeCount {
  accountId: string;
  targetType: string;
  edgeType: string;
  edgeKind: string;
  inboundCount: number;
  lastBlock: number;
}

export interface LeaderboardEntry {
  accountId: string;
  totalEarned: string;
  totalClaimed: string;
  rank: number;
}

export interface TokenStats {
  contract: string;
  holders: number;
  source: string;
}

/** Profile and group totals from indexed aggregates (matches pulse `totals`). */
export interface ProtocolTotals {
  /** Accounts with any indexed profile field. */
  profiles: number;
  /** Complete profiles in `profile_search` (Discover list). */
  discoverableProfiles: number;
  groups: number;
}

/** Curated protocol activity snapshot from `GET /graph/protocol-pulse` (requires OnAPI key). */
export interface ProtocolPulse {
  generatedAt: string;
  windowHours: number;
  totals: ProtocolTotals;
  recent24h: {
    posts: number;
    reactions: number;
  };
}

type AggregateCountNode = {
  aggregate?: { count?: number | null } | null;
};

function readAggregateCount(
  node: AggregateCountNode | null | undefined
): number {
  const count = node?.aggregate?.count;
  return typeof count === 'number' && Number.isFinite(count) ? count : 0;
}

export class StatsQuery {
  constructor(
    private _q: QueryModule,
    private _http: HttpClient
  ) {}

  /** Universal edge counts (any relationship type) for an account. */
  async edges(accountId: string): Promise<EdgeCount[]> {
    const res = await this._q.graphql<{ edgeCounts: EdgeCount[] }>({
      query: `query EdgeCounts($id: String!) {
        edgeCounts(where: {accountId: {_eq: $id}}) {
          accountId targetType edgeType edgeKind inboundCount lastBlock
        }
      }`,
      variables: { id: accountId },
    });
    return res.data?.edgeCounts ?? [];
  }

  /** Reward leaderboard. */
  async leaderboard(
    opts: { limit?: number } = {}
  ): Promise<LeaderboardEntry[]> {
    const res = await this._q.graphql<{
      leaderboardRewards: LeaderboardEntry[];
    }>({
      query: `query Leaderboard($limit: Int!) {
        leaderboardRewards(limit: $limit) {
          accountId totalEarned totalClaimed rank
        }
      }`,
      variables: { limit: opts.limit ?? 50 },
    });
    return res.data?.leaderboardRewards ?? [];
  }

  /** SOCIAL token stats. */
  tokenStats(): Promise<TokenStats> {
    return this._http.get<TokenStats>('/graph/token-stats');
  }

  /**
   * Protocol totals via GraphQL aggregates (one round-trip, tier-aware).
   * Aligns with `protocolPulse().totals` and internal analytics profile/group counts.
   *
   * ```ts
   * const { profiles, groups } = await os.query.stats.protocolTotals();
   * ```
   */
  async protocolTotals(): Promise<ProtocolTotals> {
    const res = await this._q.graphql<{
      profilesTotal: AggregateCountNode;
      discoverableProfilesTotal: AggregateCountNode;
      groupsTotal: AggregateCountNode;
    }>({
      query: `query ProtocolTotals {
        profilesTotal: profilesCurrentAggregate(where: {value: {_isNull: false}}) {
          aggregate {
            count(columns: [accountId], distinct: true)
          }
        }
        discoverableProfilesTotal: profileSearchAggregate {
          aggregate {
            count
          }
        }
        groupsTotal: groupUpdatesAggregate(where: {value: {_isNull: false}}) {
          aggregate {
            count(columns: [groupId], distinct: true)
          }
        }
      }`,
    });

    return {
      profiles: readAggregateCount(res.data?.profilesTotal),
      discoverableProfiles: readAggregateCount(
        res.data?.discoverableProfilesTotal
      ),
      groups: readAggregateCount(res.data?.groupsTotal),
    };
  }

  /**
   * Protocol pulse — profile/group totals and recent post activity.
   * Requires an OnAPI key or JWT session.
   *
   * ```ts
   * const pulse = await os.query.stats.protocolPulse();
   * ```
   */
  protocolPulse(): Promise<ProtocolPulse> {
    return this._http.get<ProtocolPulse>('/graph/protocol-pulse');
  }

  /**
   * Total indexed accounts with profile data.
   * @deprecated Prefer {@link protocolTotals} — row-based counts were capped by tier limits.
   */
  async profileCount(): Promise<number> {
    return (await this.protocolTotals()).profiles;
  }

  /**
   * Total indexed groups.
   * @deprecated Prefer {@link protocolTotals} — row-based counts were capped by tier limits.
   */
  async groupCount(): Promise<number> {
    return (await this.protocolTotals()).groups;
  }
}
