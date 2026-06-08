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

export interface StandingPageOptions {
  limit?: number;
  offset?: number;
}

export interface StandingFilteredPage {
  rows: StandingListItem[];
  total: number;
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
    opts: StandingPageOptions = {}
  ): Promise<string[]> {
    const rows = await this.outgoingDetailed(accountId, opts);
    return rows.map((r) => r.targetAccount);
  }

  async outgoingDetailed(
    accountId: string,
    opts: StandingPageOptions = {}
  ): Promise<StandingListItem[]> {
    const limit = opts.limit ?? 100;
    const offset = opts.offset ?? 0;
    const res = await this._q.graphql<{
      standingsCurrent: Array<{
        accountId: string;
        targetAccount: string;
        value: string | null;
        blockHeight: number;
        blockTimestamp: number;
      }>;
    }>({
      query: `query Standings($id: String!, $limit: Int!, $offset: Int!) {
        standingsCurrent(
          where: {accountId: {_eq: $id}},
          limit: $limit,
          offset: $offset,
          orderBy: [{blockTimestamp: DESC}]
        ) {
          accountId targetAccount value blockHeight blockTimestamp
        }
      }`,
      variables: { id: accountId, limit, offset },
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
    opts: StandingPageOptions = {}
  ): Promise<string[]> {
    const rows = await this.incomingDetailed(accountId, opts);
    return rows.map((r) => r.accountId);
  }

  async incomingDetailed(
    accountId: string,
    opts: StandingPageOptions = {}
  ): Promise<StandingListItem[]> {
    const limit = opts.limit ?? 100;
    const offset = opts.offset ?? 0;
    const res = await this._q.graphql<{
      standingsCurrent: Array<{
        accountId: string;
        targetAccount: string;
        value: string | null;
        blockHeight: number;
        blockTimestamp: number;
      }>;
    }>({
      query: `query Standers($id: String!, $limit: Int!, $offset: Int!) {
        standingsCurrent(
          where: {targetAccount: {_eq: $id}},
          limit: $limit,
          offset: $offset,
          orderBy: [{blockTimestamp: DESC}]
        ) {
          accountId targetAccount value blockHeight blockTimestamp
        }
      }`,
      variables: { id: accountId, limit, offset },
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

  /**
   * True when `viewerAccountId` has an outbound stand with `targetAccountId`.
   */
  async viewerStandsWith(
    viewerAccountId: string,
    targetAccountId: string
  ): Promise<boolean> {
    const res = await this._q.graphql<{
      standingsCurrent: Array<{ accountId: string }>;
    }>({
      query: `query ViewerStandsWith($viewer: String!, $target: String!) {
        standingsCurrent(
          where: {
            accountId: {_eq: $viewer},
            targetAccount: {_eq: $target}
          },
          limit: 1
        ) {
          accountId
        }
      }`,
      variables: { viewer: viewerAccountId, target: targetAccountId },
    });
    return (res.data?.standingsCurrent?.length ?? 0) > 0;
  }

  /**
   * True when `sourceAccountId` stands with `viewerAccountId` (inbound to viewer).
   */
  async standsWithViewer(
    sourceAccountId: string,
    viewerAccountId: string
  ): Promise<boolean> {
    const res = await this._q.graphql<{
      standingsCurrent: Array<{ accountId: string }>;
    }>({
      query: `query StandsWithViewer($source: String!, $viewer: String!) {
        standingsCurrent(
          where: {
            accountId: {_eq: $source},
            targetAccount: {_eq: $viewer}
          },
          limit: 1
        ) {
          accountId
        }
      }`,
      variables: { source: sourceAccountId, viewer: viewerAccountId },
    });
    return (res.data?.standingsCurrent?.length ?? 0) > 0;
  }

  /**
   * Subset of `targetAccountIds` that `viewerAccountId` stands with (batch, O(page size)).
   */
  async outgoingTargetsAmong(
    viewerAccountId: string,
    targetAccountIds: string[]
  ): Promise<StandingListItem[]> {
    const targets = [
      ...new Set(targetAccountIds.map((id) => id.trim()).filter(Boolean)),
    ];
    if (targets.length === 0) return [];

    const res = await this._q.graphql<{
      standingsCurrent: Array<{
        accountId: string;
        targetAccount: string;
        value: string | null;
        blockHeight: number;
        blockTimestamp: number;
      }>;
    }>({
      query: `query OutgoingTargetsAmong($viewer: String!, $targets: [String!]!) {
        standingsCurrent(
          where: {
            accountId: {_eq: $viewer},
            targetAccount: {_in: $targets}
          }
        ) {
          accountId targetAccount value blockHeight blockTimestamp
        }
      }`,
      variables: { viewer: viewerAccountId, targets },
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
   * Account ids from `sourceAccountIds` that stand with `viewerAccountId`.
   */
  async incomingSourcesAmong(
    viewerAccountId: string,
    sourceAccountIds: string[]
  ): Promise<string[]> {
    const sources = [
      ...new Set(sourceAccountIds.map((id) => id.trim()).filter(Boolean)),
    ];
    if (sources.length === 0) return [];

    const res = await this._q.graphql<{
      standingsCurrent: Array<{ accountId: string }>;
    }>({
      query: `query IncomingSourcesAmong($viewer: String!, $sources: [String!]!) {
        standingsCurrent(
          where: {
            targetAccount: {_eq: $viewer},
            accountId: {_in: $sources}
          }
        ) {
          accountId
        }
      }`,
      variables: { viewer: viewerAccountId, sources },
    });
    return (res.data?.standingsCurrent ?? []).map((r) => r.accountId);
  }

  /**
   * @deprecated Use `os.query.endorsements.issuersAmong`.
   */
  async endorsementIssuersAmong(
    viewerAccountId: string,
    issuerAccountIds: string[]
  ): Promise<string[]> {
    return this._q.endorsements.issuersAmong(viewerAccountId, issuerAccountIds);
  }

  /**
   * Paginated inbound stands limited to a participant set (profile search).
   */
  async incomingFilteredPage(
    accountId: string,
    participantAccountIds: string[],
    opts: StandingPageOptions = {}
  ): Promise<StandingFilteredPage> {
    return this.filteredPage(
      accountId,
      'incoming',
      participantAccountIds,
      opts
    );
  }

  /**
   * Paginated outbound stands limited to a participant set (profile search).
   */
  async outgoingFilteredPage(
    accountId: string,
    participantAccountIds: string[],
    opts: StandingPageOptions = {}
  ): Promise<StandingFilteredPage> {
    return this.filteredPage(
      accountId,
      'outgoing',
      participantAccountIds,
      opts
    );
  }

  private async filteredPage(
    accountId: string,
    direction: 'incoming' | 'outgoing',
    participantAccountIds: string[],
    opts: StandingPageOptions
  ): Promise<StandingFilteredPage> {
    const participants = [
      ...new Set(participantAccountIds.map((id) => id.trim()).filter(Boolean)),
    ];
    if (participants.length === 0) {
      return { rows: [], total: 0 };
    }

    const limit = opts.limit ?? 100;
    const offset = opts.offset ?? 0;
    const participantField =
      direction === 'incoming' ? 'accountId' : 'targetAccount';
    const anchorField =
      direction === 'incoming' ? 'targetAccount' : 'accountId';

    const [pageRes, countRes] = await Promise.all([
      this._q.graphql<{
        standingsCurrent: Array<{
          accountId: string;
          targetAccount: string;
          value: string | null;
          blockHeight: number;
          blockTimestamp: number;
        }>;
      }>({
        query: `query FilteredStandingRows($anchor: String!, $ids: [String!]!, $limit: Int!, $offset: Int!) {
          standingsCurrent(
            where: {${anchorField}: {_eq: $anchor}, ${participantField}: {_in: $ids}},
            limit: $limit,
            offset: $offset,
            orderBy: [{blockTimestamp: DESC}]
          ) {
            accountId targetAccount value blockHeight blockTimestamp
          }
        }`,
        variables: {
          anchor: accountId,
          ids: participants,
          limit,
          offset,
        },
      }),
      this._q.graphql<{
        standingsCurrentAggregate: { aggregate?: { count?: number } };
      }>({
        query: `query FilteredStandingCount($anchor: String!, $ids: [String!]!) {
          standingsCurrentAggregate(
            where: {${anchorField}: {_eq: $anchor}, ${participantField}: {_in: $ids}}
          ) {
            aggregate {
              count
            }
          }
        }`,
        variables: { anchor: accountId, ids: participants },
      }),
    ]);

    return {
      rows: (pageRes.data?.standingsCurrent ?? []).map((r) => ({
        accountId: r.accountId,
        targetAccount: r.targetAccount,
        since: parseStandingSince(r.value),
        blockHeight: Number(r.blockHeight) || 0,
        blockTimestamp: Number(r.blockTimestamp) || 0,
      })),
      total: Number(
        countRes.data?.standingsCurrentAggregate?.aggregate?.count ?? 0
      ),
    };
  }

  /**
   * Mutual standing count from indexed `profile_search` (scales to large graphs).
   */
  async mutualCount(accountId: string): Promise<number> {
    const res = await this._q.graphql<{
      profileSearch: Array<{ mutualStandingCount: number }>;
    }>({
      query: `query ProfileMutualCount($id: String!) {
        profileSearch(where: {accountId: {_eq: $id}}, limit: 1) {
          mutualStandingCount
        }
      }`,
      variables: { id: accountId },
    });
    const row = res.data?.profileSearch?.[0];
    return row ? Number(row.mutualStandingCount) || 0 : 0;
  }

  /**
   * Paginated mutual standing edges for an account (uses `mutual_standings_current`).
   */
  async mutualDetailed(
    accountId: string,
    opts: StandingPageOptions = {}
  ): Promise<StandingListItem[]> {
    const limit = opts.limit ?? 100;
    const offset = opts.offset ?? 0;
    const res = await this._q.graphql<{
      mutualStandingsCurrent: Array<{
        accountId: string;
        mutualAccount: string;
        value: string | null;
        blockHeight: number;
        blockTimestamp: number;
      }>;
    }>({
      query: `query MutualStandings($id: String!, $limit: Int!, $offset: Int!) {
        mutualStandingsCurrent(
          where: {accountId: {_eq: $id}},
          limit: $limit,
          offset: $offset,
          orderBy: [{blockTimestamp: DESC}]
        ) {
          accountId mutualAccount value blockHeight blockTimestamp
        }
      }`,
      variables: { id: accountId, limit, offset },
    });
    return (res.data?.mutualStandingsCurrent ?? []).map((r) => ({
      accountId: r.mutualAccount,
      targetAccount: r.accountId,
      since: parseStandingSince(r.value),
      blockHeight: Number(r.blockHeight) || 0,
      blockTimestamp: Number(r.blockTimestamp) || 0,
    }));
  }

  /**
   * Paginated mutual stands limited to a participant set (network search).
   */
  async mutualFilteredDetailed(
    accountId: string,
    mutualAccountIds: string[],
    opts: StandingPageOptions = {}
  ): Promise<StandingListItem[]> {
    const participants = [
      ...new Set(mutualAccountIds.map((id) => id.trim()).filter(Boolean)),
    ];
    if (participants.length === 0) return [];

    const limit = opts.limit ?? 100;
    const offset = opts.offset ?? 0;
    const res = await this._q.graphql<{
      mutualStandingsCurrent: Array<{
        accountId: string;
        mutualAccount: string;
        value: string | null;
        blockHeight: number;
        blockTimestamp: number;
      }>;
    }>({
      query: `query MutualFiltered($id: String!, $participants: [String!]!, $limit: Int!, $offset: Int!) {
        mutualStandingsCurrent(
          where: {
            accountId: {_eq: $id},
            mutualAccount: {_in: $participants}
          },
          limit: $limit,
          offset: $offset,
          orderBy: [{blockTimestamp: DESC}]
        ) {
          accountId mutualAccount value blockHeight blockTimestamp
        }
      }`,
      variables: { id: accountId, participants, limit, offset },
    });
    return (res.data?.mutualStandingsCurrent ?? []).map((r) => ({
      accountId: r.mutualAccount,
      targetAccount: r.accountId,
      since: parseStandingSince(r.value),
      blockHeight: Number(r.blockHeight) || 0,
      blockTimestamp: Number(r.blockTimestamp) || 0,
    }));
  }

  async mutualFilteredCount(
    accountId: string,
    mutualAccountIds: string[]
  ): Promise<number> {
    const participants = [
      ...new Set(mutualAccountIds.map((id) => id.trim()).filter(Boolean)),
    ];
    if (participants.length === 0) return 0;

    const res = await this._q.graphql<{
      mutualStandingsCurrentAggregate: { aggregate?: { count?: number } };
    }>({
      query: `query MutualFilteredCount($id: String!, $participants: [String!]!) {
        mutualStandingsCurrentAggregate(
          where: {
            accountId: {_eq: $id},
            mutualAccount: {_in: $participants}
          }
        ) {
          aggregate {
            count
          }
        }
      }`,
      variables: { id: accountId, participants },
    });
    return Number(
      res.data?.mutualStandingsCurrentAggregate?.aggregate?.count ?? 0
    );
  }
}
