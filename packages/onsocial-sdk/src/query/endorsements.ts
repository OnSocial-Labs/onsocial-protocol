// ---------------------------------------------------------------------------
// Endorsement queries.
// Accessed as `os.query.endorsements.<method>()`.
// ---------------------------------------------------------------------------

import type { QueryModule } from './index.js';

export interface EndorsementRow {
  issuer: string;
  target: string;
  value: string;
  blockHeight: number;
  blockTimestamp: number;
  operation: string;
}

export interface EndorsementCounts {
  received: number;
  given: number;
}

export interface EndorsementPageOptions {
  limit?: number;
  offset?: number;
}

export interface EndorsementFilteredPage {
  rows: EndorsementRow[];
  total: number;
}

export class EndorsementsQuery {
  constructor(private _q: QueryModule) {}

  /**
   * Indexed endorsement counts from `profile_search`.
   */
  async counts(accountId: string): Promise<EndorsementCounts> {
    const res = await this._q.graphql<{
      profileSearch: Array<{
        endorsementsReceivedCount: number;
        endorsementsGivenCount: number;
      }>;
    }>({
      query: `query EndorsementCounts($id: String!) {
        profileSearch(where: {accountId: {_eq: $id}}, limit: 1) {
          endorsementsReceivedCount
          endorsementsGivenCount
        }
      }`,
      variables: { id: accountId },
    });
    const row = res.data?.profileSearch?.[0];
    return {
      received: Number(row?.endorsementsReceivedCount ?? 0),
      given: Number(row?.endorsementsGivenCount ?? 0),
    };
  }

  /**
   * Endorsements issued by an account.
   */
  async given(
    accountId: string,
    opts: EndorsementPageOptions = {}
  ): Promise<EndorsementRow[]> {
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;
    const res = await this._q.graphql<{
      endorsementsCurrent: EndorsementRow[];
    }>({
      query: `query EndorsementsGiven($id: String!, $limit: Int!, $offset: Int!) {
        endorsementsCurrent(
          where: {issuer: {_eq: $id}, operation: {_eq: "set"}},
          limit: $limit, offset: $offset,
          orderBy: [{blockHeight: DESC}]
        ) {
          issuer target value blockHeight blockTimestamp operation
        }
      }`,
      variables: { id: accountId, limit, offset },
    });
    return res.data?.endorsementsCurrent ?? [];
  }

  /**
   * Endorsements received by an account.
   */
  async received(
    accountId: string,
    opts: EndorsementPageOptions = {}
  ): Promise<EndorsementRow[]> {
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;
    const res = await this._q.graphql<{
      endorsementsCurrent: EndorsementRow[];
    }>({
      query: `query EndorsementsReceived($id: String!, $limit: Int!, $offset: Int!) {
        endorsementsCurrent(
          where: {target: {_eq: $id}, operation: {_eq: "set"}},
          limit: $limit, offset: $offset,
          orderBy: [{blockHeight: DESC}]
        ) {
          issuer target value blockHeight blockTimestamp operation
        }
      }`,
      variables: { id: accountId, limit, offset },
    });
    return res.data?.endorsementsCurrent ?? [];
  }

  /**
   * Active endorsements from `issuer` to `target` (point lookup).
   */
  async receivedFromIssuer(
    issuerAccountId: string,
    targetAccountId: string,
    opts: { limit?: number } = {}
  ): Promise<EndorsementRow[]> {
    const limit = opts.limit ?? 20;
    const res = await this._q.graphql<{
      endorsementsCurrent: EndorsementRow[];
    }>({
      query: `query EndorsementsFromIssuer($issuer: String!, $target: String!, $limit: Int!) {
        endorsementsCurrent(
          where: {
            issuer: {_eq: $issuer},
            target: {_eq: $target},
            operation: {_eq: "set"}
          },
          limit: $limit,
          orderBy: [{blockHeight: DESC}]
        ) {
          issuer target value blockHeight blockTimestamp operation
        }
      }`,
      variables: {
        issuer: issuerAccountId,
        target: targetAccountId,
        limit,
      },
    });
    return res.data?.endorsementsCurrent ?? [];
  }

  /**
   * Issuers from `issuerAccountIds` with a set endorsement for `targetAccountId`.
   */
  async issuersAmong(
    targetAccountId: string,
    issuerAccountIds: string[]
  ): Promise<string[]> {
    const issuers = [
      ...new Set(issuerAccountIds.map((id) => id.trim()).filter(Boolean)),
    ];
    if (issuers.length === 0) return [];

    const res = await this._q.graphql<{
      endorsementsCurrent: Array<{ issuer: string }>;
    }>({
      query: `query EndorsementIssuersAmong($target: String!, $issuers: [String!]!) {
        endorsementsCurrent(
          where: {
            target: {_eq: $target},
            issuer: {_in: $issuers},
            operation: {_eq: "set"}
          }
        ) {
          issuer
        }
      }`,
      variables: { target: targetAccountId, issuers },
    });
    return (res.data?.endorsementsCurrent ?? []).map((r) => r.issuer);
  }

  /**
   * Paginated received endorsements limited to a participant set.
   */
  async receivedFilteredPage(
    accountId: string,
    participantIssuerIds: string[],
    opts: EndorsementPageOptions = {}
  ): Promise<EndorsementFilteredPage> {
    return this.filteredPage(accountId, 'received', participantIssuerIds, opts);
  }

  /**
   * Paginated given endorsements limited to a participant set.
   */
  async givenFilteredPage(
    accountId: string,
    participantTargetIds: string[],
    opts: EndorsementPageOptions = {}
  ): Promise<EndorsementFilteredPage> {
    return this.filteredPage(accountId, 'given', participantTargetIds, opts);
  }

  private async filteredPage(
    accountId: string,
    mode: 'received' | 'given',
    participantIds: string[],
    opts: EndorsementPageOptions
  ): Promise<EndorsementFilteredPage> {
    const participants = [
      ...new Set(participantIds.map((id) => id.trim()).filter(Boolean)),
    ];
    if (participants.length === 0) {
      return { rows: [], total: 0 };
    }

    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;
    const participantField = mode === 'received' ? 'issuer' : 'target';
    const anchorField = mode === 'received' ? 'target' : 'issuer';

    const [pageRes, countRes] = await Promise.all([
      this._q.graphql<{ endorsementsCurrent: EndorsementRow[] }>({
        query: `query FilteredEndorsementRows($anchor: String!, $ids: [String!]!, $limit: Int!, $offset: Int!) {
          endorsementsCurrent(
            where: {
              ${anchorField}: {_eq: $anchor},
              ${participantField}: {_in: $ids},
              operation: {_eq: "set"}
            },
            limit: $limit,
            offset: $offset,
            orderBy: [{blockHeight: DESC}]
          ) {
            issuer target value blockHeight blockTimestamp operation
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
        endorsementsCurrentAggregate: { aggregate?: { count?: number } };
      }>({
        query: `query FilteredEndorsementCount($anchor: String!, $ids: [String!]!) {
          endorsementsCurrentAggregate(
            where: {
              ${anchorField}: {_eq: $anchor},
              ${participantField}: {_in: $ids},
              operation: {_eq: "set"}
            }
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
      rows: pageRes.data?.endorsementsCurrent ?? [],
      total: Number(
        countRes.data?.endorsementsCurrentAggregate?.aggregate?.count ?? 0
      ),
    };
  }
}
