// ---------------------------------------------------------------------------
// OnSocial SDK — query module (GraphQL over indexed views)
// ---------------------------------------------------------------------------

import type { HttpClient } from './http.js';
import type { GraphQLRequest, GraphQLResponse, QueryLimits } from './types.js';

export class QueryModule {
  constructor(private _http: HttpClient) {}

  /**
   * Execute a raw GraphQL query against the indexed data.
   *
   * ```ts
   * const { data } = await os.query.graphql({
   *   query: `{ posts_current(where: {author: {_eq: "alice.near"}}, limit: 10) { path value block_height } }`,
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

  /** Fetch a profile by account ID. */
  async profile(accountId: string) {
    return this.graphql<{ profiles_current: unknown[] }>({
      query: `query Profile($id: String!) {
        profiles_current(where: {account_id: {_eq: $id}}, limit: 1) {
          account_id data_type path value block_height
        }
      }`,
      variables: { id: accountId },
    });
  }

  /** Fetch recent posts, optionally filtered by author. */
  async posts(opts: { author?: string; limit?: number; offset?: number } = {}) {
    const where = opts.author
      ? `{author: {_eq: "${opts.author}"}}`
      : '{}';
    return this.graphql<{ posts_current: unknown[] }>({
      query: `{ posts_current(where: ${where}, limit: ${opts.limit ?? 20}, offset: ${opts.offset ?? 0}, order_by: {block_height: desc}) {
        account_id path value author block_height block_timestamp
      }}`,
    });
  }

  /** Fetch standings (who an account stands with). */
  async standings(accountId: string, opts: { limit?: number } = {}) {
    return this.graphql<{ standings_current: unknown[] }>({
      query: `query Standings($id: String!) {
        standings_current(where: {account_id: {_eq: $id}}, limit: ${opts.limit ?? 100}) {
          account_id target_account block_height
        }
      }`,
      variables: { id: accountId },
    });
  }

  /** Fetch standing counts for an account. */
  async standingCounts(accountId: string) {
    return this.graphql<{ standing_counts: unknown[]; standing_out_counts: unknown[] }>({
      query: `query StandingCounts($id: String!) {
        standing_counts(where: {target_account: {_eq: $id}}) {
          target_account standing_count
        }
        standing_out_counts(where: {account_id: {_eq: $id}}) {
          account_id standing_out_count
        }
      }`,
      variables: { id: accountId },
    });
  }

  /** Fetch reactions on a piece of content. */
  async reactions(ownerAccount: string, contentPath: string) {
    const fullPath = `reaction/${ownerAccount}/${contentPath}`;
    return this.graphql<{ reactions_current: unknown[] }>({
      query: `query Reactions($path: String!) {
        reactions_current(where: {path: {_like: $path}}) {
          account_id path value target_account block_height
        }
      }`,
      variables: { path: `${fullPath}%` },
    });
  }

  /** Fetch universal edge counts (any relationship type). */
  async edgeCounts(accountId: string) {
    return this.graphql<{ edge_counts: unknown[] }>({
      query: `query EdgeCounts($id: String!) {
        edge_counts(where: {target_account: {_eq: $id}}) {
          target_account edge_type edge_count
        }
      }`,
      variables: { id: accountId },
    });
  }

  /** Fetch the reward leaderboard. */
  async leaderboard(opts: { limit?: number } = {}) {
    return this.graphql<{ leaderboard_rewards: unknown[] }>({
      query: `{ leaderboard_rewards(limit: ${opts.limit ?? 50}) {
        account_id total_earned total_claimed rank
      }}`,
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
   * // data.dataUpdates → [{ path, value, block_height, ... }]
   * ```
   */
  async dataByType(
    dataType: string,
    opts: { accountId?: string; limit?: number; offset?: number } = {},
  ) {
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;
    const conditions = [`{data_type: {_eq: $dataType}}`];
    if (opts.accountId) conditions.push(`{account_id: {_eq: $accountId}}`);
    const where = conditions.length === 1
      ? conditions[0]
      : `{_and: [${conditions.join(', ')}]}`;

    return this.graphql<{ dataUpdates: Array<{
      path: string;
      value: string;
      account_id: string;
      data_id: string;
      block_height: string;
      block_timestamp: string;
      operation: string;
    }> }>({
      query: `query DataByType($dataType: String!${opts.accountId ? ', $accountId: String!' : ''}) {
        dataUpdates(where: ${where}, limit: ${limit}, offset: ${offset}, order_by: {block_height: desc}) {
          path value account_id data_id block_height block_timestamp operation
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
      account_id: string;
      data_type: string;
      data_id: string;
      block_height: string;
      block_timestamp: string;
      operation: string;
    }> }>({
      query: `query DataByPath($path: String!) {
        dataUpdates(where: {path: {_eq: $path}}, limit: 1, order_by: {block_height: desc}) {
          path value account_id data_type data_id block_height block_timestamp operation
        }
      }`,
      variables: { path },
    });
  }
}
