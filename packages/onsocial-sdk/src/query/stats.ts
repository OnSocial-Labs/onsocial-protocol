// ---------------------------------------------------------------------------
// Platform stats — leaderboard, token stats, edge counts, profile/group totals.
// Accessed as `os.query.stats.<method>()`.
// ---------------------------------------------------------------------------

import type { HttpClient } from '../http.js';
import type { QueryModule } from './index.js';

export interface EdgeCount {
  accountId: string;
  edgeType: string;
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
          accountId edgeType inboundCount lastBlock
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

  /** Total number of accounts that have created a profile. */
  async profileCount(): Promise<number> {
    const res = await this._q.graphql<{
      profilesCurrent: Array<{ accountId: string }>;
    }>({
      query: `{ profilesCurrent(where: {value: {_isNull: false}}, distinctOn: [accountId]) { accountId } }`,
    });
    return res.data?.profilesCurrent?.length ?? 0;
  }

  /** Total number of groups created. */
  async groupCount(): Promise<number> {
    const res = await this._q.graphql<{
      groupUpdates: Array<{ groupId: string }>;
    }>({
      query: `{ groupUpdates(where: {value: {_isNull: false}}, distinctOn: [groupId]) { groupId } }`,
    });
    return res.data?.groupUpdates?.length ?? 0;
  }
}
