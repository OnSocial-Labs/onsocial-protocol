// ---------------------------------------------------------------------------
// Standing graph queries.
// Accessed as `os.query.standings.<method>()`.
// ---------------------------------------------------------------------------

import type { QueryModule } from './index.js';

export interface StandingListItem {
  accountId: string;
  targetAccount: string;
  since: number | null;
  blockHeight: number;
  blockTimestamp: number;
}

function parseStandingSince(raw: string | null | undefined): number | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { since?: unknown };
    return typeof parsed.since === 'number' ? parsed.since : null;
  } catch {
    return null;
  }
}

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
    const rows = await this.outgoingDetailed(accountId, opts);
    return rows.map((r) => r.targetAccount);
  }

  async outgoingDetailed(
    accountId: string,
    opts: { limit?: number } = {}
  ): Promise<StandingListItem[]> {
    const res = await this._q.graphql<{
      standingsCurrent: Array<{
        accountId: string;
        targetAccount: string;
        value: string | null;
        blockHeight: number;
        blockTimestamp: number;
      }>;
    }>({
      query: `query Standings($id: String!, $limit: Int!) {
        standingsCurrent(where: {accountId: {_eq: $id}}, limit: $limit) {
          accountId targetAccount value blockHeight blockTimestamp
        }
      }`,
      variables: { id: accountId, limit: opts.limit ?? 100 },
    });
    return (res.data?.standingsCurrent ?? []).map((r) => ({
      accountId: r.accountId,
      targetAccount: r.targetAccount,
      since: parseStandingSince(r.value),
      blockHeight: Number(r.blockHeight) || 0,
      blockTimestamp: Number(r.blockTimestamp) || 0,
    }));
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
    const rows = await this.incomingDetailed(accountId, opts);
    return rows.map((r) => r.accountId);
  }

  async incomingDetailed(
    accountId: string,
    opts: { limit?: number } = {}
  ): Promise<StandingListItem[]> {
    const res = await this._q.graphql<{
      standingsCurrent: Array<{
        accountId: string;
        targetAccount: string;
        value: string | null;
        blockHeight: number;
        blockTimestamp: number;
      }>;
    }>({
      query: `query Standers($id: String!, $limit: Int!) {
        standingsCurrent(where: {targetAccount: {_eq: $id}}, limit: $limit) {
          accountId targetAccount value blockHeight blockTimestamp
        }
      }`,
      variables: { id: accountId, limit: opts.limit ?? 100 },
    });
    return (res.data?.standingsCurrent ?? []).map((r) => ({
      accountId: r.accountId,
      targetAccount: r.targetAccount,
      since: parseStandingSince(r.value),
      blockHeight: Number(r.blockHeight) || 0,
      blockTimestamp: Number(r.blockTimestamp) || 0,
    }));
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
