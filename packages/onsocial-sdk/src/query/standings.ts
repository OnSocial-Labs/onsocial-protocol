// ---------------------------------------------------------------------------
// Standing graph queries.
// Accessed as `os.query.standings.<method>()`.
// ---------------------------------------------------------------------------

import type { QueryModule } from './index.js';

export class StandingsQuery {
  constructor(private _q: QueryModule) {}

  /**
   * Accounts this account stands with (outbound graph).
   *
   * ```ts
   * const list = await os.query.standings.outgoing('alice.near');
   * // list → ['bob.near', 'carol.near']
   * ```
   */
  async outgoing(
    accountId: string,
    opts: { limit?: number } = {}
  ): Promise<string[]> {
    const res = await this._q.graphql<{
      standingsCurrent: Array<{
        accountId: string;
        targetAccount: string;
      }>;
    }>({
      query: `query Standings($id: String!, $limit: Int!) {
        standingsCurrent(where: {accountId: {_eq: $id}}, limit: $limit) {
          accountId targetAccount
        }
      }`,
      variables: { id: accountId, limit: opts.limit ?? 100 },
    });
    return (res.data?.standingsCurrent ?? []).map((r) => r.targetAccount);
  }

  /**
   * Accounts that stand with this account (inbound graph).
   *
   * ```ts
   * const list = await os.query.standings.incoming('alice.near');
   * // list → ['dave.near', 'eve.near']
   * ```
   */
  async incoming(
    accountId: string,
    opts: { limit?: number } = {}
  ): Promise<string[]> {
    const res = await this._q.graphql<{
      standingsCurrent: Array<{
        accountId: string;
        targetAccount: string;
      }>;
    }>({
      query: `query Standers($id: String!, $limit: Int!) {
        standingsCurrent(where: {targetAccount: {_eq: $id}}, limit: $limit) {
          accountId targetAccount
        }
      }`,
      variables: { id: accountId, limit: opts.limit ?? 100 },
    });
    return (res.data?.standingsCurrent ?? []).map((r) => r.accountId);
  }

  /**
   * Standing counts (inbound + outbound) for an account.
   *
   * ```ts
   * const { incoming, outgoing } = await os.query.standings.counts('alice.near');
   * ```
   */
  async counts(
    accountId: string
  ): Promise<{ incoming: number; outgoing: number }> {
    const res = await this._q.graphql<{
      standingCounts: Array<{
        accountId: string;
        standingWithCount: number;
        lastStandingBlock: number;
      }>;
      standingOutCounts: Array<{
        accountId: string;
        standingWithOthersCount: number;
        lastStandingBlock: number;
      }>;
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
    const inbound = res.data?.standingCounts?.[0];
    const outbound = res.data?.standingOutCounts?.[0];
    return {
      incoming: inbound ? Number(inbound.standingWithCount) : 0,
      outgoing: outbound ? Number(outbound.standingWithOthersCount) : 0,
    };
  }
}
