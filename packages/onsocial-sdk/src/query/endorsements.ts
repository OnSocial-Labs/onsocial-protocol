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

export class EndorsementsQuery {
  constructor(private _q: QueryModule) {}

  /**
   * Endorsements issued by an account.
   *
   * ```ts
   * const rows = await os.query.endorsements.given('alice.near');
   * ```
   */
  async given(
    accountId: string,
    opts: { limit?: number; offset?: number } = {}
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
   *
   * ```ts
   * const rows = await os.query.endorsements.received('bob.near');
   * ```
   */
  async received(
    accountId: string,
    opts: { limit?: number; offset?: number } = {}
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
}
